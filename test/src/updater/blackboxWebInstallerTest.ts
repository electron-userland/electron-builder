import { TmpDir } from "builder-util/out/util"
import { execFileSync, execSync } from "child_process"
import { randomUUID } from "crypto"
import { Arch, Platform } from "electron-builder"
import { existsSync, move, outputFile, remove } from "fs-extra"
import { AddressInfo } from "net"
import { homedir } from "os"
import path from "path"
import { TestContext } from "vitest"
import { createLocalServer, getParallelsHostIP, sha256File, toVmHomePath } from "../helpers/launchAppCrossPlatform"
import { assertPack, modifyPackageJson, PackedContext } from "../helpers/packTester"
import { ELECTRON_VERSION } from "../helpers/testConfig"
import { optionsForFlakyE2E, windowsVmPromise } from "./blackboxUpdateHelpers"
import { PM } from "app-builder-lib/out/node-module-collector"
import { spawn } from "builder-util"

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
    let builtDir: string | undefined
    let server: import("http").Server | undefined

    try {
      // -----------------------------------------------------------------------
      // Step 1: Start the HTTP server first so we know the port before building.
      // The appPackageUrl is baked into the installer at build time, so the port
      // must be known upfront.
      // -----------------------------------------------------------------------
      const serverRoot = await tmpDir.getTempDir({ prefix: "pkg-server" })
      ;({ server } = await createLocalServer(serverRoot, serverBindAddress))
      const port = (server.address() as AddressInfo).port
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new Error(`Unsafe port: ${port}`)
      }

      // APP_PACKAGE_URL is a complete URL (no arch suffix appended) because we
      // supply appPackageUrl explicitly — this is the code path fixed by #9655.
      const packageFileName = "TestApp-1.0.0-x64.nsis.7z"
      const appPackageUrl = `http://${packageServerHost}:${port}/${encodeURIComponent(packageFileName)}`

      // -----------------------------------------------------------------------
      // Step 2: Build the nsis-web installer with the server URL baked in.
      // -----------------------------------------------------------------------
      await assertPack(
        expect,
        "test-app",
        {
          targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
          config: {
            productName: "TestApp",
            executableName: "TestApp",
            appId: "com.test.webinstaller",
            artifactName: "${productName}-${version}-${arch}.${ext}",
            extraMetadata: { name: "testapp", version: "1.0.0" },
            electronLanguages: ["en"],
            electronFuses: {
              runAsNode: false,
              enableCookieEncryption: true,
              enableNodeOptionsEnvironmentVariable: false,
              enableNodeCliInspectArguments: false,
              enableEmbeddedAsarIntegrityValidation: true,
              onlyLoadAppFromAsar: true,
              loadBrowserProcessSpecificV8Snapshot: false,
              grantFileProtocolExtraPrivileges: false,
            },
            compression: "store",
            nsisWeb: {
              appPackageUrl,
              artifactName: "TestApp Web Setup.${ext}",
            },
            publish: null,
          },
        },
        {
          packageManager: PM.PNPM,
          packed: async (ctx: PackedContext) => {
            builtDir = await tmpDir.getTempDir({ prefix: "built" })
            await move(ctx.outDir, builtDir)
          },
          projectDirCreated: async (projectDir: string, _tmpDir: TmpDir, runtimeEnv: NodeJS.ProcessEnv) => {
            await modifyPackageJson(
              projectDir,
              data => {
                data.devDependencies = { electron: ELECTRON_VERSION }
              },
              true
            )
            await modifyPackageJson(
              projectDir,
              data => {
                data.pnpm = {
                  supportedArchitectures: { os: ["current"], cpu: ["x64"] },
                }
              },
              false
            )
            await spawn("pnpm", ["install"], { cwd: projectDir, stdio: "inherit", env: runtimeEnv })
          },
        }
      )

      if (!builtDir) {
        throw new Error("Build did not produce output directory")
      }

      // -----------------------------------------------------------------------
      // Step 3: Copy the .nsis.7z app package into the HTTP server root so the
      // installer can download it at install time.
      // -----------------------------------------------------------------------
      const packageSrc = path.join(builtDir, packageFileName)
      const packageDest = path.join(serverRoot, packageFileName)
      await import("fs-extra").then(m => m.copy(packageSrc, packageDest))

      const stubName = "TestApp Web Setup.exe"
      const stubPath = path.join(builtDir, stubName)

      // -----------------------------------------------------------------------
      // Step 4a — Native Windows: run the stub directly and verify locally.
      // -----------------------------------------------------------------------
      if (isNativeWindows) {
        try {
          execSync('taskkill /F /IM "TestApp Web Setup.exe" /T', { stdio: "ignore" })
          await new Promise(r => setTimeout(r, 1000))
        } catch {
          // no lingering process — expected on first run
        }

        const localAppData = process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local")
        const uninstaller = path.join(localAppData, "Programs", "TestApp", "Uninstall TestApp.exe")
        if (existsSync(uninstaller)) {
          console.log("Uninstalling previous TestApp installation")
          execFileSync(uninstaller, ["/S", "/C", "exit"], { stdio: "inherit" })
          await new Promise(r => setTimeout(r, 5000))
        }

        console.log("Running web installer:", stubPath)
        execFileSync(stubPath, ["/S"], { stdio: "inherit" })
        await new Promise(r => setTimeout(r, 3000))

        const installPath = path.join(localAppData, "Programs", "TestApp", "TestApp.exe")
        expect(existsSync(installPath)).toBe(true)
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
      server?.close()
      await tmpDir.cleanup().catch(() => {})
    }
  })
})
