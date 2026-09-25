import { execFileSync } from "child_process"
import { randomUUID } from "crypto"
import { homedir } from "os"
import path from "path"
import { outputFile, remove } from "fs-extra"
import type { VmManager } from "app-builder-lib/src/vm/vm"
import { createLocalServer, getParallelsHostIP, sha256File, toVmHomePath } from "../helpers/launchAppCrossPlatform"

export interface MsixInstallResult {
  /** The Windows package family name, e.g. "TestApp_abcde12345xyz" — used to uninstall. */
  packageFamilyName: string
  /** SHA-1 thumbprint of the signing cert that was trusted, or empty if no extra trust was needed. */
  certThumbprint: string
  /** Full path to the installed app directory inside the Windows package cache. */
  installLocation: string
}

// ─── Parallels VM ────────────────────────────────────────────────────────────

/**
 * Delivers an MSIX (or .msixbundle) to the Parallels VM via HTTP, trusts its
 * signing cert, installs it, and returns the package identifiers needed for
 * verification and cleanup.
 *
 * Requires Developer Mode to be enabled on the VM (AllowDevelopmentWithoutDevLicense=1) so
 * that `Add-AppxPackage -AllowUnsigned` can install test-signed packages without cert trust.
 *
 * Runs as the logged-in user via `vm.exec()` (--current-user) because `Add-AppxPackage`
 * is a per-user operation that the Local System account cannot perform.
 */
export async function installMsixInVm(vm: VmManager, msixPath: string, identityName: string): Promise<MsixInstallResult> {
  const hostIP = getParallelsHostIP()
  if (!hostIP) {
    throw new Error("Cannot determine Parallels host IP — no prl*/bridge* interface found")
  }
  if (!/^[\d.]+$/.test(hostIP)) {
    throw new Error(`Unsafe hostIP: ${hostIP}`)
  }

  const expectedSha256 = await sha256File(msixPath)
  if (!/^[0-9a-f]{64}$/i.test(expectedSha256)) {
    throw new Error(`Unexpected SHA-256 value: ${expectedSha256}`)
  }

  const { server, port } = await createLocalServer(path.dirname(msixPath), "0.0.0.0")
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Unsafe port: ${port}`)
  }

  const filename = encodeURIComponent(path.basename(msixPath))
  const scriptPath = path.join(homedir(), `.eb-msix-install-${randomUUID()}.ps1`)

  const psScript = [
    `$ErrorActionPreference = 'Stop'`,
    `$tmpDir = $null`,
    `try {`,
    `    $tmpDir = Join-Path $env:TEMP ([Guid]::NewGuid().ToString())`,
    `    New-Item -ItemType Directory -Path $tmpDir | Out-Null`,
    `    $dest = Join-Path $tmpDir 'package.msix'`,
    `    Invoke-WebRequest -Uri 'http://${hostIP}:${port}/${filename}' -OutFile $dest -UseBasicParsing`,
    `    $actualHash = (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower()`,
    `    if ($actualHash -ne '${expectedSha256}') { Write-Error "Hash mismatch: $actualHash"; exit 1 }`,
    `    Write-Output 'HASH_OK:true'`,
    // Remove previous installation of the same package family to avoid version conflicts
    `    $existing = Get-AppxPackage -Name '${identityName}' -ErrorAction SilentlyContinue`,
    `    if ($existing) { Remove-AppxPackage -Package $existing.PackageFullName -ErrorAction SilentlyContinue }`,
    `    Unblock-File -Path $dest -ErrorAction SilentlyContinue`,
    // -AllowUnsigned requires Developer Mode (AllowDevelopmentWithoutDevLicense=1), which avoids
    // needing to add the test-signing cert to LocalMachine\TrustedPeople (requires UAC elevation).
    `    Add-AppxPackage -Path $dest -AllowUnsigned`,
    `    $pkg = Get-AppxPackage -Name '${identityName}'`,
    `    if (-not $pkg) { Write-Error 'Package not found after installation'; exit 1 }`,
    `    Write-Output "PFN:$($pkg.PackageFamilyName)"`,
    `    Write-Output "INSTALL_LOCATION:$($pkg.InstallLocation)"`,
    `    Write-Output "INSTALLED_VERSION:$($pkg.Version)"`,
    `} finally {`,
    `    if ($tmpDir) { Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue }`,
    `}`,
  ].join("\n")

  await outputFile(scriptPath, psScript)
  const winScriptPath = toVmHomePath(scriptPath)

  let output: string
  try {
    // Use --current-user: Add-AppxPackage cannot be called by the Local System account
    output = await vm.exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", winScriptPath], { timeout: 120_000 })
    console.log("[installMsixInVm] output:", output)
  } finally {
    server.close()
    await remove(scriptPath).catch(() => {})
  }

  const pfnMatch = output.match(/PFN:(\S+)/)
  const locationMatch = output.match(/INSTALL_LOCATION:(.+)/)

  if (!pfnMatch) {
    throw new Error(`PFN not found in output:\n${output}`)
  }

  return {
    packageFamilyName: pfnMatch[1].trim(),
    installLocation: locationMatch ? locationMatch[1].trim() : "",
    certThumbprint: "", // No cert added; Developer Mode allows -AllowUnsigned
  }
}

/**
 * Uninstalls an MSIX package from the VM and optionally removes the trusted cert.
 */
export async function uninstallMsixInVm(vm: VmManager, packageFamilyName: string, _certThumbprint: string): Promise<void> {
  // No cert cleanup needed since we use -AllowUnsigned (Developer Mode) and don't add certs.
  // Run as current user because Remove-AppxPackage is also a per-user operation.
  const psCommand = `$pkg = Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq '${packageFamilyName}' } | Select-Object -First 1; if ($pkg) { Remove-AppxPackage -Package $pkg.PackageFullName -ErrorAction SilentlyContinue }`
  await vm.exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand]).catch(() => {})
}

/**
 * Launches the installed MSIX app directly from its install location and waits
 * for it to emit "APP_VERSION:<n.n.n>" on stdout, then kills it.
 * Returns the version string.
 */
export async function launchMsixAppInVm(vm: VmManager, installLocation: string, exeName: string, timeoutMs = 30_000): Promise<string> {
  const exePath = `${installLocation}\\app\\${exeName}`
  const psCommand = `$proc = Start-Process -FilePath '${exePath}' -PassThru -NoNewWindow; Start-Sleep -Seconds 5; Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; Write-Output 'LAUNCHED:true'`
  const output = await vm.exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], { timeout: timeoutMs })
  return output
}

// ─── native Windows ───────────────────────────────────────────────────────────

/**
 * Installs an MSIX / .msixbundle on native Windows by extracting it to a loose layout and
 * registering it (`Add-AppxPackage -Register AppxManifest.xml`) — the standard dev-loop install,
 * which needs only Developer Mode (AllowDevelopmentWithoutDevLicense=1): NOT admin and NOT a
 * trusted signature. (A packed .msix cannot be deployed via `-AllowUnsigned` — 0x80073D2B, its
 * content requires a trusted signature — and trusting the self-signed test cert in LocalMachine
 * would require UAC elevation.)
 */
export function installMsixNative(msixPath: string, identityName: string): MsixInstallResult {
  const layoutDir = path.join(require("os").tmpdir(), `eb-msix-reg-${randomUUID()}`)
  const psScript = [
    `$ErrorActionPreference = 'Stop'`,
    `Add-Type -AssemblyName System.IO.Compression.FileSystem`,
    `$src = '${msixPath.replace(/'/g, "''")}'`,
    `$layout = '${layoutDir.replace(/'/g, "''")}'`,
    `$bundleEx = $null`,
    // A .msixbundle is a container of per-arch .msix packages; register the x64 inner package.
    `if ($src.ToLower().EndsWith('.msixbundle')) {`,
    `    $bundleEx = Join-Path $env:TEMP ('eb-msix-bundle-' + [Guid]::NewGuid().ToString())`,
    `    [System.IO.Compression.ZipFile]::ExtractToDirectory($src, $bundleEx)`,
    `    $inner = Get-ChildItem $bundleEx -Filter *.msix | Where-Object { $_.Name -match 'x64' } | Select-Object -First 1`,
    `    if (-not $inner) { $inner = Get-ChildItem $bundleEx -Filter *.msix | Select-Object -First 1 }`,
    `    if (-not $inner) { Write-Error 'No inner .msix found in bundle'; exit 1 }`,
    `    $src = $inner.FullName`,
    `}`,
    // Extract the package to a loose layout (Add-AppxPackage -Register tolerates AppxBlockMap.xml etc.).
    `if (Test-Path $layout) { Remove-Item $layout -Recurse -Force }`,
    `[System.IO.Compression.ZipFile]::ExtractToDirectory($src, $layout)`,
    `if ($bundleEx) { Remove-Item $bundleEx -Recurse -Force -ErrorAction SilentlyContinue }`,
    // Remove any prior registration of the same package family to avoid version conflicts.
    `$existing = Get-AppxPackage -Name '${identityName}' -ErrorAction SilentlyContinue`,
    `if ($existing) { Remove-AppxPackage -Package $existing.PackageFullName -ErrorAction SilentlyContinue }`,
    `Add-AppxPackage -Register (Join-Path $layout 'AppxManifest.xml')`,
    `$pkg = Get-AppxPackage -Name '${identityName}'`,
    `if (-not $pkg) { Write-Error "Package '${identityName}' not found after registration"; exit 1 }`,
    `Write-Output "PFN:$($pkg.PackageFamilyName)"`,
    `Write-Output "INSTALL_LOCATION:$($pkg.InstallLocation)"`,
  ].join("\n")

  const scriptPath = path.join(require("os").tmpdir(), `.eb-msix-install-${randomUUID()}.ps1`)
  require("fs").writeFileSync(scriptPath, psScript)
  let output: string
  try {
    output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    })
  } catch (err: any) {
    const stderr = err.stderr ? `\nStderr: ${err.stderr}` : ""
    const stdout = err.stdout ? `\nStdout: ${err.stdout}` : ""
    throw new Error(`MSIX install failed: ${err.message}${stderr}${stdout}`)
  } finally {
    try {
      require("fs").unlinkSync(scriptPath)
    } catch {
      // ignore
    }
  }
  const pfnMatch = output.match(/PFN:(\S+)/)
  const locationMatch = output.match(/INSTALL_LOCATION:(.+)/)
  if (!pfnMatch) {
    throw new Error(`PFN not found in powershell output:\n${output}`)
  }
  return {
    packageFamilyName: pfnMatch[1].trim(),
    installLocation: locationMatch ? locationMatch[1].trim() : "",
    certThumbprint: "", // registration uses no signature/cert
  }
}

export function uninstallMsixNative(packageFamilyName: string, _certThumbprint: string): void {
  // Remove the package and the loose layout it was registered from (its InstallLocation — an
  // eb-msix-reg-* temp dir). No cert cleanup needed: registration uses no signature/cert.
  const lines = [
    `$pkg = Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq '${packageFamilyName}' } | Select-Object -First 1`,
    `if ($pkg) {`,
    `  $loc = $pkg.InstallLocation`,
    `  Remove-AppxPackage -Package $pkg.PackageFullName -ErrorAction SilentlyContinue`,
    `  if ($loc -and (Split-Path $loc -Leaf).StartsWith('eb-msix-reg-')) { Remove-Item -LiteralPath $loc -Recurse -Force -ErrorAction SilentlyContinue }`,
    `}`,
  ]
  const scriptPath = path.join(require("os").tmpdir(), `.eb-msix-uninstall-${randomUUID()}.ps1`)
  require("fs").writeFileSync(scriptPath, lines.join("\n"))
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath], { encoding: "utf8" })
  } finally {
    try {
      require("fs").unlinkSync(scriptPath)
    } catch {
      // ignore
    }
  }
}
