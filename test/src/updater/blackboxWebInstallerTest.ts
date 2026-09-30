import { TmpDir } from "builder-util"
import { hashFile } from "builder-util-runtime"
import { randomUUID } from "crypto"
import { appendFile, copy, existsSync, outputFile, remove } from "fs-extra"
import { AddressInfo } from "net"
import { homedir } from "os"
import path from "path"
import { TestContext } from "vitest"
import { createLocalServer, getParallelsHostIP, sha256File, toVmHomePath } from "../helpers/launchAppCrossPlatform"
import { readInstalledPackageType, runWindowsInstaller } from "./blackboxInstallWindows"
import { optionsForFlakyE2E, windowsVmPromise } from "./blackboxUpdateHelpers"
import { appExe, buildWebInstaller, packageFileName, resetNativeInstall, storedPackage, stubName } from "./blackboxWebInstallerHelpers"

// ---------------------------------------------------------------------------
// Web installer blackbox E2E test
//
// Flow:
//   1. Build a nsis-web installer (the small stub .exe) and its companion
//      app package (.nsis.7z) via assertPack.
//   2. Serve the .nsis.7z over HTTP so the Parallels VM can reach it via the
//      host bridge IP.
//   3. Run the stub installer inside the VM; it downloads and unpacks the
//      app package, then installs the application.
//   4. Assert the installed executable exists at the expected path.
//
// The test is gated behind describe.heavy() and skips automatically when no
// Windows VM is available, matching the pattern used by blackboxUpdateWinSuite.
// ---------------------------------------------------------------------------

describe.heavy("web installer (nsis-web) blackbox", optionsForFlakyE2E, () => {
  test("web installer downloads and installs app via HTTP server", async (context: TestContext) => {
    const { expect } = context
    const isNativeWindows = process.platform === "win32"
    const vm = await windowsVmPromise

    if (!isNativeWindows && vm == null) {
      context.skip()
      return
    }

    // Determine where the HTTP server should bind and which host the app package
    // URL should reference. On native Windows both are localhost. On macOS with
    // Parallels the server must be reachable from the VM via the bridge IP.
    let packageServerHost: string
    let serverBindAddress: string

    if (isNativeWindows) {
      packageServerHost = "127.0.0.1"
      serverBindAddress = "127.0.0.1"
    } else {
      const hostIP = getParallelsHostIP()
      if (!hostIP) {
        throw new Error("Cannot determine Parallels host IP — no prl*/bridge* interface found")
      }
      if (!/^[\d.]+$/.test(hostIP)) {
        throw new Error(`Unsafe hostIP: ${hostIP}`)
      }
      packageServerHost = hostIP
      serverBindAddress = "0.0.0.0"
    }

    const tmpDir = new TmpDir("web-installer-e2e")
    let server: import("http").Server | undefined
    // URLs the web installer requests from the server
    const requests: Array<string> = []

    try {
      // -----------------------------------------------------------------------
      // Step 1: Start the HTTP server first so we know the port before building.
      // The appPackageUrl is baked into the installer at build time, so the port
      // must be known upfront.
      // -----------------------------------------------------------------------
      const serverRoot = await tmpDir.getTempDir({ prefix: "pkg-server" })
      ;({ server } = await createLocalServer(serverRoot, serverBindAddress, url => requests.push(url)))
      const port = (server.address() as AddressInfo).port
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new Error(`Unsafe port: ${port}`)
      }

      // APP_PACKAGE_URL is a complete URL (no arch suffix appended) because we
      // supply appPackageUrl explicitly — this is the code path fixed by #9655.
      const appPackageUrl = `http://${packageServerHost}:${port}/${encodeURIComponent(packageFileName)}`

      // -----------------------------------------------------------------------
      // Step 2: Build the nsis-web installer with the server URL baked in.
      // -----------------------------------------------------------------------
      const builtDir = await buildWebInstaller(expect, tmpDir, { nsisWeb: { appPackageUrl }, publish: null })

      // -----------------------------------------------------------------------
      // Step 3: Copy the .nsis.7z app package into the HTTP server root so the
      // installer can download it at install time.
      // -----------------------------------------------------------------------
      // nsis-web writes artifacts into an "nsis-web" subdirectory of outDir
      const nsisWebDir = path.join(builtDir, "nsis-web")
      const packageSrc = path.join(nsisWebDir, packageFileName)
      const packageDest = path.join(serverRoot, packageFileName)
      await copy(packageSrc, packageDest)

      const stubPath = path.join(nsisWebDir, stubName)

      // -----------------------------------------------------------------------
      // Step 4a — Native Windows: run the stub directly and verify locally.
      // -----------------------------------------------------------------------
      if (isNativeWindows) {
        await resetNativeInstall()

        // An explicit appPackageUrl can serve the package of any build, so the download isn't checked against the package the stub
        // was built with: serve one that differs from it and still extracts (data after the archive is ignored, like the blockmap
        // appended to every nsis-web package).
        await appendFile(packageDest, "\nserved package\n")
        const servedSha512 = await hashFile(packageDest)
        expect(servedSha512).not.toBe(await hashFile(packageSrc))

        // A copy of the stub without the package next to it, so that it downloads the package from appPackageUrl.
        const stubCopy = path.join(await tmpDir.getTempDir({ prefix: "stub" }), stubName)
        await copy(stubPath, stubCopy)
        console.log("Running web installer:", stubCopy)
        // asynchronously: the stub downloads from the server of this process
        const exitCode = await runWindowsInstaller(stubCopy, ["/S"])
        await new Promise(r => setTimeout(r, 3000))

        expect(exitCode).toBe(0)
        expect(new Set(requests)).toEqual(new Set([`/${packageFileName}`]))
        expect(existsSync(appExe)).toBe(true)
        expect(await readInstalledPackageType(appExe)).toBe("nsis-web")
        // the stub stores the package it installed for differential updates
        expect(await hashFile(storedPackage)).toBe(servedSha512)
        return
      }

      // -----------------------------------------------------------------------
      // Step 4b — Parallels VM: deliver the stub over HTTP and run via PowerShell.
      // \\Mac\Home\ hangs on large binary reads, so we HTTP-deliver the stub too.
      // -----------------------------------------------------------------------
      const expectedSha256 = await sha256File(stubPath)
      if (!/^[0-9a-f]{64}$/i.test(expectedSha256)) {
        throw new Error(`Unexpected SHA-256 value: ${expectedSha256}`)
      }

      // Serve the stub with a URL-safe name from the same server root.
      await import("fs-extra").then(m => m.copy(stubPath, path.join(serverRoot, "TestApp+Web+Setup.exe")))

      const scriptPath = path.join(homedir(), `.eb-webinstaller-${randomUUID()}.ps1`)
      const psScript = [
        `$tmpDir = $null`,
        `try {`,
        `    $tmpDir = Join-Path $env:TEMP ([Guid]::NewGuid().ToString())`,
        `    New-Item -ItemType Directory -Path $tmpDir | Out-Null`,
        `    $dest = Join-Path $tmpDir 'TestApp-Web-Setup.exe'`,
        `    Invoke-WebRequest -Uri 'http://${packageServerHost}:${port}/TestApp+Web+Setup.exe' -OutFile $dest -UseBasicParsing`,
        `    if (-not (Test-Path $dest)) { Write-Error 'Stub download failed'; exit 1 }`,
        `    $actualHash = (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower()`,
        `    if ($actualHash -ne '${expectedSha256}') { Write-Error ('Hash mismatch: ' + $actualHash); exit 1 }`,
        `    Write-Output ('HASH_OK:true')`,
        `    Unblock-File -Path $dest -ErrorAction SilentlyContinue`,
        `    Stop-Process -Name 'TestApp Web Setup' -Force -ErrorAction SilentlyContinue`,
        `    Start-Sleep -Seconds 1`,
        `    $lad = [Environment]::GetFolderPath('LocalApplicationData')`,
        `    $uninstaller = Join-Path $lad 'Programs\\TestApp\\Uninstall TestApp.exe'`,
        `    if (Test-Path $uninstaller) {`,
        `        Start-Process -FilePath $uninstaller -ArgumentList '/S','/C','exit' -Wait`,
        `        Start-Sleep -Seconds 5`,
        `    }`,
        `    $proc = Start-Process -FilePath $dest -ArgumentList '/S' -PassThru`,
        `    $finished = $proc.WaitForExit(300000)`,
        `    if (-not $finished) { $proc.Kill() | Out-Null; Write-Error 'Web installer timed out'; exit 1 }`,
        `    Write-Output ('INSTALLER_EXIT:' + $proc.ExitCode)`,
        `    if ($proc.ExitCode -ne 0) { Write-Error ('Installer exited with code ' + $proc.ExitCode); exit 1 }`,
        `    Start-Sleep -Seconds 3`,
        `    $installPath = Join-Path $lad 'Programs\\TestApp\\TestApp.exe'`,
        `    Write-Output ('APP_EXISTS:' + (Test-Path $installPath))`,
        `    if (-not (Test-Path $installPath)) { Write-Error 'App not installed at expected path'; exit 1 }`,
        `} finally {`,
        `    if ($tmpDir) { Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue }`,
        `}`,
      ].join("\n")

      await outputFile(scriptPath, psScript)
      const winScriptPath = toVmHomePath(scriptPath)
      try {
        const result = await vm!.exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", winScriptPath], { timeout: 360000 })
        console.log("Web installer output:", result)
        expect(result).toContain("HASH_OK:true")
        expect(result).toContain("INSTALLER_EXIT:0")
        expect(result).toContain("APP_EXISTS:True")
      } finally {
        await remove(scriptPath).catch(() => {})
      }
    } finally {
      if (isNativeWindows) {
        await resetNativeInstall().catch(error => console.warn("Failed to uninstall TestApp", error))
      }
      server?.close()
      await tmpDir.cleanup().catch(() => {})
    }
  })
})
