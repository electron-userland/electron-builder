import { ParallelsVmManager } from "app-builder-lib/out/vm/ParallelsVm"
import { execFileSync, execSync } from "child_process"
import { randomUUID } from "crypto"
import { Arch } from "electron-builder"
import { existsSync, outputFile, remove } from "fs-extra"
import { homedir, tmpdir } from "os"
import path from "path"
import { createLocalServer, getParallelsHostIP, sha256File, toVmHomePath } from "../helpers/launchAppCrossPlatform"

// ─── native Windows ───────────────────────────────────────────────────────────

export async function installWindowsNative(dirPath: string, perMachine: boolean): Promise<string> {
  // Kill any lingering NSIS installer processes left over from previous test retries.
  // Without this, ALLOW_ONLY_ONE_INSTALLER_INSTANCE aborts the new installer (mutex conflict),
  // and lingering mid-replacement processes cause ENOENT at the first probe launch.
  try {
    execSync('taskkill /F /IM "TestApp Setup.exe" /T', { stdio: "ignore" })
    await new Promise(resolve => setTimeout(resolve, 1000))
  } catch {
    // no matching process — expected on the first run
  }

  const installBase = perMachine
    ? (process.env["ProgramW6432"] ?? process.env["ProgramFiles"] ?? "C:\\Program Files")
    : path.join(process.env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local"), "Programs")
  const localProgramsPath = path.join(installBase, "TestApp")

  // Clear any previous installation so reinstall doesn't hit the "uninstall first" prompt.
  const uninstaller = path.join(localProgramsPath, "Uninstall TestApp.exe")
  if (existsSync(uninstaller)) {
    console.log("Uninstalling", uninstaller)
    execFileSync(uninstaller, ["/S", "/C", "exit"], { stdio: "inherit" })
    await new Promise(resolve => setTimeout(resolve, 5000))
  }

  const installerPath = path.join(dirPath, "TestApp Setup.exe")
  console.log("Installing windows", installerPath)
  execFileSync(installerPath, ["/S"], { stdio: "inherit" })

  return path.join(localProgramsPath, "TestApp.exe")
}

export async function cleanupWindowsNative(perMachine?: boolean): Promise<void> {
  // Kill any lingering NSIS installer processes before running the uninstaller,
  // so the uninstaller isn't blocked by a still-running update installer holding file locks.
  try {
    execSync('taskkill /F /IM "TestApp Setup.exe" /T', { stdio: "ignore" })
    await new Promise(resolve => setTimeout(resolve, 500))
  } catch {
    // no matching process — ignore
  }

  const installBase = perMachine
    ? (process.env["ProgramW6432"] ?? process.env["ProgramFiles"] ?? "C:\\Program Files")
    : path.join(process.env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local"), "Programs")
  const localProgramsPath = path.join(installBase, "TestApp")
  const uninstaller = path.join(localProgramsPath, "Uninstall TestApp.exe")
  console.log("Uninstalling", uninstaller)
  if (perMachine) {
    // Per-machine uninstall needs elevation — use Task Scheduler (RunLevel Highest, no UAC)
    const tmpScript = path.join(tmpdir(), `eb-uninstall-${randomUUID()}.ps1`)
    await outputFile(
      tmpScript,
      [
        `$u = '${uninstaller}'`,
        `if (-not (Test-Path $u)) { exit 0 }`,
        `$tn = 'EBUninstall_' + [System.Guid]::NewGuid().ToString('N')`,
        `$a = New-ScheduledTaskAction -Execute $u -Argument '/S'`,
        `$p = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -RunLevel Highest`,
        `$s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 3)`,
        `Register-ScheduledTask -TaskName $tn -Action $a -Principal $p -Settings $s -Force | Out-Null`,
        `Start-ScheduledTask -TaskName $tn`,
        `$dl = [DateTime]::Now.AddMinutes(2)`,
        `while ((Get-ScheduledTask -TaskName $tn -ErrorAction SilentlyContinue).State -eq 'Running') {`,
        `    if ([DateTime]::Now -gt $dl) { break }`,
        `    Start-Sleep -Seconds 2`,
        `}`,
        `Unregister-ScheduledTask -TaskName $tn -Confirm:$false -ErrorAction SilentlyContinue`,
      ].join("\n")
    )
    try {
      execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", tmpScript], { stdio: "inherit" })
    } finally {
      await remove(tmpScript).catch(() => {})
    }
  } else {
    execFileSync(uninstaller, ["/S", "/C", "exit"], { stdio: "inherit" })
  }
  await new Promise(resolve => setTimeout(resolve, 5000))
}

// ─── Parallels VM ─────────────────────────────────────────────────────────────

export async function installWindowsVm(dirPath: string, arch: Arch, vm: ParallelsVmManager, perMachine: boolean): Promise<string> {
  void arch // arch is resolved inside the VM — only used for the appPath on macOS host

  // Kill any stale installer mutex holder from a previous retry.
  try {
    await vm.exec("taskkill", ["/F", "/IM", "TestApp Setup.exe", "/T"])
    await new Promise(resolve => setTimeout(resolve, 1000))
  } catch {
    // no matching process — expected on the first run
  }

  // Query the install root once; used for uninstaller check and the final appPath.
  const installRoot = (
    await vm.exec("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      perMachine ? "[Environment]::GetFolderPath('ProgramFiles')" : "[Environment]::GetFolderPath('LocalApplicationData')",
    ])
  ).trim()
  const installSubDir = perMachine ? "TestApp" : "Programs\\TestApp"
  const uninstallerPath = `${installRoot}\\${installSubDir}\\Uninstall TestApp.exe`

  if (perMachine) {
    // For per-machine, run the uninstaller as SYSTEM via vm.spawn (prlctl exec without
    // --current-user). SYSTEM already holds full admin rights — no UAC, no Task Scheduler.
    const prevExists = (
      await vm.exec("powershell.exe", ["-NonInteractive", "-Command", `if (Test-Path '${uninstallerPath}') { 'true' } else { 'false' }`])
    ).trim()
    if (prevExists === "true") {
      await vm.spawn("powershell.exe", [
        "-NonInteractive",
        "-Command",
        `$p = Start-Process -FilePath '${uninstallerPath}' -ArgumentList '/S' -PassThru; $p.WaitForExit(60000) | Out-Null`,
      ])
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
  } else {
    // Per-user uninstall runs without elevation — direct exec is fine
    try {
      await vm.exec(uninstallerPath, ["/S", "/C", "exit"])
      await new Promise(resolve => setTimeout(resolve, 5000))
    } catch {
      // no previous installation — expected on first run
    }
  }

  // Use HTTP to deliver the installer: getParallelsHostIP() returns the Mac's bridge IP
  // (e.g. 10.211.55.2) which is reachable from the VM. \\Mac\Home\ hangs on large binary reads.
  const hostIP = getParallelsHostIP()
  if (!hostIP) {
    throw new Error("Cannot determine Parallels host IP for installer delivery — no prl*/bridge* interface found")
  }
  if (!/^[\d.]+$/.test(hostIP)) {
    throw new Error(`Unsafe hostIP: ${hostIP}`)
  }

  const installerBinPath = path.join(dirPath, "TestApp Setup.exe")
  const expectedSha256 = await sha256File(installerBinPath)
  if (!/^[0-9a-f]{64}$/i.test(expectedSha256)) {
    throw new Error(`Unexpected hash value: ${expectedSha256}`)
  }

  const { server: installerServer, port: installerPort } = await createLocalServer(dirPath, "0.0.0.0")
  if (!Number.isInteger(installerPort) || installerPort < 1024 || installerPort > 65535) {
    throw new Error(`Unsafe port: ${installerPort}`)
  }

  // Write the installer script to Mac home dir; the VM reads it via \\Mac\Home\ (UNC).
  // Using -File instead of -Command avoids double-quote stripping by prlctl/cmd.exe,
  // which allows the Add-Type heredoc and DllImport attributes to work correctly.
  // A small PS script file (<5 KB) reads fine from \\Mac\Home\ (only large binary reads hang).
  const scriptPath = path.join(homedir(), `.eb-nsis-${randomUUID()}.ps1`)
  const psScript = [
    `$tmpDir = $null`,
    `try {`,
    // Kill any stale installer from a previous test run — it holds the NSIS APP_GUID mutex
    `    Stop-Process -Name 'eb-setup' -Force -ErrorAction SilentlyContinue`,
    `    Start-Sleep -Seconds 1`,
    `    $tmpDir = Join-Path $env:TEMP ([Guid]::NewGuid().ToString())`,
    `    New-Item -ItemType Directory -Path $tmpDir | Out-Null`,
    `    $dest = Join-Path $tmpDir 'eb-setup.exe'`,
    `    Invoke-WebRequest -Uri 'http://${hostIP}:${installerPort}/TestApp%20Setup.exe' -OutFile $dest -UseBasicParsing`,
    `    if (-not (Test-Path $dest)) { Write-Error 'Download failed'; exit 1 }`,
    `    Write-Output ('DOWNLOAD_SIZE:' + (Get-Item $dest).Length)`,
    // Verify download integrity; hash was computed on the Mac before the HTTP server started
    `    $actualHash = (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower()`,
    `    $expectedHash = '${expectedSha256}'`,
    `    if ($actualHash -ne $expectedHash) { Write-Error ('Hash mismatch: expected ' + $expectedHash + ' got ' + $actualHash); exit 1 }`,
    `    Write-Output ('HASH_OK:true')`,
    // Remove Mark-of-the-Web only after integrity is confirmed
    `    Unblock-File -Path $dest -ErrorAction SilentlyContinue`,
    `    Write-Output ('DEST_PATH:' + $dest)`,
    // For per-machine this script runs as SYSTEM (via vm.spawn / prlctl exec without --current-user)
    // so Start-Process already has full admin rights — no UAC, no Task Scheduler needed.
    `    $proc = Start-Process -FilePath $dest -ArgumentList '/S' -PassThru`,
    `    $finished = $proc.WaitForExit(180000)`,
    `    if (-not $finished) {`,
    `        $proc.Kill() | Out-Null`,
    `        Write-Error 'Installer timed out after 180s'; exit 1`,
    `    }`,
    `    Write-Output ('INSTALLER_EXIT:' + $proc.ExitCode)`,
    // NSIS one-click calls quitSuccess (SetErrorLevel 0; Quit) on success → exit 0
    `    if ($proc.ExitCode -ne 0) { Write-Error ('Installer exited with code ' + $proc.ExitCode); exit 1 }`,
    `    Start-Sleep -Seconds 3`,
    `    $installPath = Join-Path '${installRoot}' '${installSubDir}\\TestApp.exe'`,
    `    Write-Output ('APP_EXISTS:' + (Test-Path $installPath))`,
    `    if (-not (Test-Path $installPath)) { Write-Error 'App not installed at expected path'; exit 1 }`,
    `} finally {`,
    // PowerShell guarantees finally runs on all exit paths including exit 1
    `    if ($tmpDir) { Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue }`,
    `}`,
  ].join("\n")

  await outputFile(scriptPath, psScript)
  const winScriptPath = toVmHomePath(scriptPath)
  try {
    // Per-machine: run as SYSTEM via vm.spawn (prlctl exec without --current-user).
    // SYSTEM has full admin rights — installs to Program Files without UAC.
    // Per-user: run as the logged-in user via vm.exec (--current-user).
    const installResult = perMachine
      ? await vm.spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", winScriptPath])
      : await vm.exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", winScriptPath], { timeout: 300000 })
    console.log("Installer output:", installResult)
  } finally {
    installerServer.close()
    await remove(scriptPath).catch(() => {})
  }

  return `${installRoot}\\${installSubDir}\\TestApp.exe`
}
