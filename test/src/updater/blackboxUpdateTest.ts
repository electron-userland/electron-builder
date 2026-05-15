import { ToolsetConfig } from "app-builder-lib"
import { PM } from "app-builder-lib/out/node-module-collector"
import { ParallelsVmManager } from "app-builder-lib/out/vm/ParallelsVm"
import { getWindowsVm, VmManager } from "app-builder-lib/out/vm/vm"
import { GenericServerOptions, Nullish } from "builder-util-runtime"
import { archFromString, DebugLogger, getArchSuffix, isEmptyOrSpaces, log, serializeToYaml, spawn, TmpDir } from "builder-util/out/util"
import { execFileSync, execSync } from "child_process"
import { createHash, randomUUID } from "crypto"
import { Arch, Configuration, Platform } from "electron-builder"
import { DebUpdater, PacmanUpdater, RpmUpdater } from "electron-updater"
import { createReadStream } from "fs"
import { copy, existsSync, move, outputFile, readJsonSync, remove } from "fs-extra"
import { homedir } from "os"
import path from "path"
import { ExpectStatic, TestContext, TestOptions } from "vitest"
import { createLocalServer, getParallelsHostIP, launchAndWaitForQuit, toVmHomePath } from "../helpers/launchAppCrossPlatform"
import { assertPack, EXTENDED_TIMEOUT, modifyPackageJson, PackedContext } from "../helpers/packTester"
import { ELECTRON_VERSION } from "../helpers/testConfig"
import { NEW_VERSION_NUMBER, OLD_VERSION_NUMBER, writeUpdateConfig } from "../helpers/updaterTestUtil"

// Resolve only to a ParallelsVmManager — PwshVmManager (used for code-signing on Linux/Mac via Wine)
// is not capable of installing or running Windows executables and must not be treated as a Windows VM.
const windowsVmPromise: Promise<ParallelsVmManager | undefined> = getWindowsVm(new DebugLogger(false))
  .then(vm => (vm instanceof ParallelsVmManager ? vm : undefined))
  .catch(() => undefined)

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256")
    createReadStream(filePath)
      .on("data", chunk => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject)
  })
}

const optionsForFlakyE2E: TestOptions = { sequential: true, retry: 0, timeout: EXTENDED_TIMEOUT }
// Linux Tests MUST be run in docker containers for proper ephemeral testing environment (e.g. fresh install + update + relaunch)
// Currently this test logic does not handle uninstalling packages (yet)
describe.ifMac.heavy("mac", optionsForFlakyE2E, () => {
  // can test on x64 and also arm64 (via rosetta)
  test("x64", async context => {
    await runTest(context, "zip", "", Arch.x64)
  })
  test("universal", async context => {
    await runTest(context, "zip", "", Arch.universal)
  })
  // only will update on arm64 mac
  test.ifEnv(process.arch === "arm64")("arm64", async context => {
    await runTest(context, "zip", "", Arch.arm64)
  })
})

const winCodeSignVersions: ToolsetConfig["winCodeSign"][] = ["0.0.0", "1.0.0", "1.1.0"]

for (const winCodeSign of winCodeSignVersions) {
  describe(`winCodeSign: ${winCodeSign}`, optionsForFlakyE2E, () => {
    describe.heavy("windows", optionsForFlakyE2E, () => {
      test("nsis", async context => {
        if (process.platform !== "win32" && (await windowsVmPromise) == null) {
          context.skip()
        }
        await runTest(context, "nsis", "", Arch.x64, { winCodeSign })
      })
    })
  })
}

const appImageToolVersions: ToolsetConfig["appimage"][] = ["0.0.0", "1.0.2", "1.0.3"]
// must be sequential in order for process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER to be respected per-test
describe.heavy.ifLinux("linux", optionsForFlakyE2E, () => {
  for (const appimage of appImageToolVersions) {
    describe(`appimage tool: ${appimage}`, optionsForFlakyE2E, () => {
      test.ifEnv(process.env.RUN_APP_IMAGE_TEST === "true" && process.arch === "arm64")("AppImage - arm64", async context => {
        await runTest(context, "AppImage", "appimage", Arch.arm64, { appimage })
      })

      // only works on x64, so this will fail on arm64 macs due to arch mismatch
      test.ifEnv(process.env.RUN_APP_IMAGE_TEST === "true" && process.arch === "x64")("AppImage - x64", async context => {
        await runTest(context, "AppImage", "appimage", Arch.x64, { appimage })
      })
    })
  }

  // package manager tests specific to each distro (and corresponding docker image)
  for (const distro in packageManagerMap) {
    const { pms, target } = packageManagerMap[distro as keyof typeof packageManagerMap]
    for (const pm of pms) {
      test(`${distro} - (${pm})`, optionsForFlakyE2E, async context => {
        if (!determineEnvironment(distro)) {
          context.skip()
        }
        // skip if already set to avoid interfering with other package manager tests
        if (!isEmptyOrSpaces(process.env.PACKAGE_MANAGER_TO_TEST) && process.env.PACKAGE_MANAGER_TO_TEST !== pm) {
          context.skip()
        }
        await runTest(context, target, pm, Arch.x64)
      })
    }
  }
})

const determineEnvironment = (target: string) => {
  return execSync(`cat /etc/*release | grep "^ID="`).toString().includes(target)
}

const packageManagerMap: {
  [key: string]: {
    pms: string[]
    target: string
  }
} = {
  fedora: {
    pms: ["zypper", "dnf", "yum", "rpm"],
    target: "rpm",
  },
  debian: {
    pms: ["apt", "dpkg"],
    target: "deb",
  },
  arch: {
    pms: ["pacman"],
    target: "pacman",
  },
}

async function runTest(context: TestContext, target: string, packageManager: string, arch: Arch = Arch.x64, toolsets: ToolsetConfig = {}) {
  const { expect } = context
  const vm = await windowsVmPromise
  if (vm && target === "nsis") {
    console.log("Running Windows test via Parallels VM")
  }

  const tmpDir = new TmpDir("auto-update")
  const outDirs: ApplicationUpdatePaths[] = []
  await doBuild(expect, outDirs, target, arch, tmpDir, process.platform === "win32" || (target === "nsis" && vm != null), { toolsets })

  const oldAppDir = outDirs[0]
  const newAppDir = outDirs[1]

  const dirPath = oldAppDir.dir
  // Setup tests by installing the previous version
  const appPath = await handleInitialInstallPerOS({ target, dirPath, arch, vm })

  if (!vm && !existsSync(appPath)) {
    throw new Error(`App not found: ${appPath}`)
  }

  let queuedError: Error | null = null
  try {
    await runTestWithinServer(async (rootDirectory: string, updateConfigPath: string) => {
      // Move app update to the root directory of the server
      await copy(newAppDir.dir, rootDirectory, { recursive: true, overwrite: true })

      // waitForExit: true — don't proceed until the old app fully quits.
      // On Linux (rpm/deb/pacman) the package manager install is synchronous, so exit means install done.
      // On Windows (NSIS) and Mac (zip) the installer runs detached/async, so the app exits before
      // installation completes — the polling loop below handles that case.
      const result = await launchAndWaitForQuit({
        appPath,
        vm,
        timeoutMs: 5 * 60 * 1000,
        updateConfigPath,
        expectedVersion: OLD_VERSION_NUMBER,
        packageManagerToTest: packageManager,
        waitForExit: true,
      })
      log.info({ version: result.version, stdout: result.stdout }, "Initial launch completed")
      expect(result.version).toMatch(OLD_VERSION_NUMBER)
      if (!result.stdout.includes("Update downloaded")) {
        throw new Error(`Update phase did not complete — quitAndInstall was never triggered.\nFull stdout:\n${result.stdout}`)
      }

      // Poll until the installed binary reports the new version.
      // We disable AUTO_UPDATER_TEST so the probe app quits immediately after printing its version
      // (no update cycle triggered), which also prevents a second installer from running in parallel.
      const pollDeadline = Date.now() + 6 * 60 * 1000
      const pollInterval = 5 * 1000
      let newVersion: string | undefined
      while (Date.now() < pollDeadline) {
        try {
          const probe = await launchAndWaitForQuit({
            appPath,
            vm,
            timeoutMs: 30 * 1000,
            updateConfigPath,
            packageManagerToTest: packageManager,
            env: { AUTO_UPDATER_TEST: "" }, // disables updater — app prints version and quits
            // waitForExit: true ensures TestApp.exe is fully released before the next
            // poll iteration, giving the detached NSIS installer an uncontested window
            // to overwrite the binary (Windows locks executables while they are running).
            waitForExit: true,
          })
          newVersion = probe.version
          if (newVersion === NEW_VERSION_NUMBER) {
            break
          }
          log.info({ installedVersion: newVersion, expected: NEW_VERSION_NUMBER }, "Installer still in progress, retrying...")
        } catch (err: any) {
          // NSIS replaces the exe non-atomically: it deletes the old binary before writing the new one,
          // so there is a brief window where TestApp.exe does not exist on disk.
          if (err.code === "ENOENT" && (err.syscall === "spawn" || err.syscall?.startsWith("spawn "))) {
            log.info({ appPath }, "Binary temporarily unavailable (NSIS installer in progress), retrying...")
          } else {
            throw err
          }
        }
        if (Date.now() + pollInterval < pollDeadline) {
          await new Promise(resolve => setTimeout(resolve, pollInterval))
        }
      }
      expect(newVersion).toMatch(NEW_VERSION_NUMBER)
    }, vm)
  } catch (error: any) {
    log.error({ error: error.message }, "Blackbox Updater Test failed to run")
    queuedError = error
  } finally {
    // windows needs to release file locks, so a delay seems to be needed
    await new Promise(resolve => setTimeout(resolve, 1000))
    await tmpDir.cleanup()
    try {
      await handleCleanupPerOS({ target })
    } catch (error: any) {
      log.error({ error: error.message }, "Blackbox Updater Test cleanup failed")
      // ignore
    }
  }
  if (queuedError) {
    throw queuedError
  }
}

type ApplicationUpdatePaths = {
  dir: string
  appPath: string
}

async function doBuild(
  expect: ExpectStatic,
  outDirs: Array<ApplicationUpdatePaths>,
  target: string,
  arch: Arch,
  tmpDir: TmpDir,
  isWindows: boolean,
  extraConfig?: Configuration | null
) {
  const currentPlatform = isWindows ? Platform.WINDOWS : Platform.current()
  async function buildApp({
    version,
    target,
    arch,
    extraConfig,
    packed,
  }: {
    version: string
    target: string
    arch: Arch
    extraConfig: Configuration | Nullish
    packed: (context: PackedContext) => Promise<any>
  }) {
    await assertPack(
      expect,
      "test-app",
      {
        targets: currentPlatform.createTarget(target, arch),
        config: {
          npmRebuild: true,
          productName: "TestApp",
          executableName: "TestApp",
          appId: "com.test.app",
          artifactName: "${productName}.${ext}",
          // asar: false, // not necessarily needed, just easier debugging tbh
          electronLanguages: ["en"],
          extraMetadata: {
            name: "testapp",
            version,
          },
          electronUpdaterCompatibility: "1.1", // anything above 1.0.0 works. This is to allow testing via `link:` protocol with the current workspace electron-updater package version
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
          ...extraConfig,
          compression: "store",
          publish: {
            provider: "s3",
            bucket: "develar",
            path: "test",
          },
          files: ["**/*", "../**/node_modules/**", "!path/**"],
          nsis: {
            artifactName: "${productName} Setup.${ext}",
            // one click installer required. don't run after install otherwise we lose stdout pipe
            oneClick: true,
            runAfterFinish: false,
          },
        },
      },
      {
        storeDepsLockfileSnapshot: false,
        signed: !isWindows,
        signedWin: isWindows,
        packed,
        packageManager: PM.PNPM,
        projectDirCreated: async (projectDir, _tmpDir, runtimeEnv) => {
          // await outputFile(path.join(projectDir, "package-lock.json"), "{}")
          await outputFile(path.join(projectDir, ".npmrc"), "node-linker=hoisted")

          await modifyPackageJson(
            projectDir,
            data => {
              data.devDependencies = {
                electron: ELECTRON_VERSION,
                "node-addon-api": "^8",
              }
              const electronUpdaterPath = (pkg: string) => path.resolve(__dirname, "../../../packages", pkg)
              const updaterPath = electronUpdaterPath("electron-updater")
              const utilPath = electronUpdaterPath("builder-util-runtime")
              data.dependencies = {
                ...data.dependencies,
                sqlite3: "5.1.7", // for testing native dependency handling in auto-update
                "@electron/remote": "2.1.3", // for debugging live application with GUI so that app.getVersion is accessible in renderer process
                "electron-updater": `link:${updaterPath}`,
                ...readJsonSync(path.join(updaterPath, "package.json")).dependencies,
                "builder-util-runtime": `link:${utilPath}`, // needs to be last to overwrite electron-updater's builder-util-runtime dependency for testing with workspace version of builder-util-runtime (workspace:* doesn't resolve and needs to be linked explicitly)
                ...readJsonSync(path.join(utilPath, "package.json")).dependencies,
              }
            },
            true
          )
          await modifyPackageJson(
            projectDir,
            data => {
              data.pnpm = {
                supportedArchitectures: {
                  os: ["current"],
                  cpu: ["x64", "arm64"],
                },
              }
            },
            false
          )
          await spawn("pnpm", ["install"], { cwd: projectDir, stdio: "inherit", env: runtimeEnv })
        },
      }
    )
  }

  const build = (version: string) =>
    buildApp({
      version,
      target,
      arch,
      extraConfig,
      packed: async context => {
        // move dist temporarily out of project dir so each downloader can reference it
        const dir = await tmpDir.getTempDir({ prefix: version })
        await move(context.outDir, dir)
        const appPath = path.join(dir, path.relative(context.outDir, context.getAppPath(Platform.current(), archFromString(process.arch))))
        outDirs.push({ dir, appPath })
      },
    })
  try {
    await build(OLD_VERSION_NUMBER)
    await build(NEW_VERSION_NUMBER)
  } catch (e: any) {
    await tmpDir.cleanup()
    throw e
  }
}

async function handleInitialInstallPerOS({ target, dirPath, arch, vm }: { target: string; dirPath: string; arch: Arch; vm?: VmManager }): Promise<string> {
  let appPath: string
  if (target === "AppImage") {
    appPath = path.join(dirPath, `TestApp.AppImage`)
  } else if (target === "deb") {
    DebUpdater.installWithCommandRunner(
      "dpkg",
      path.join(dirPath, `TestApp.deb`),
      commandWithArgs => {
        execSync(commandWithArgs.join(" "), { stdio: "inherit" })
      },
      console
    )
    appPath = path.join("/opt", "TestApp", "TestApp")
  } else if (target === "rpm") {
    RpmUpdater.installWithCommandRunner(
      "zypper",
      path.join(dirPath, `TestApp.rpm`),
      commandWithArgs => {
        execSync(commandWithArgs.join(" "), { stdio: "inherit" })
      },
      console
    )
    appPath = path.join("/opt", "TestApp", "TestApp")
  } else if (target === "pacman") {
    PacmanUpdater.installWithCommandRunner(
      path.join(dirPath, `TestApp.pacman`),
      commandWithArgs => {
        execSync(commandWithArgs.join(" "), { stdio: "inherit" })
      },
      console
    )
    // execSync(`sudo pacman -Syyu --noconfirm`, { stdio: "inherit" })
    // execSync(`sudo pacman -U --noconfirm "${path.join(dirPath, `TestApp.pacman`)}"`, { stdio: "inherit" })
    appPath = path.join("/opt", "TestApp", "TestApp")
  } else if (process.platform === "win32") {
    // Kill any lingering NSIS installer processes left over from previous test retries.
    // Without this, ALLOW_ONLY_ONE_INSTALLER_INSTANCE aborts the new installer (mutex conflict),
    // and lingering mid-replacement processes cause ENOENT at the first probe launch.
    try {
      execSync('taskkill /F /IM "TestApp Setup.exe" /T', { stdio: "ignore" })
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch {
      // no matching process — expected on the first run
    }

    // access installed app's location
    const localProgramsPath = path.join(process.env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local"), "Programs", "TestApp")
    // this is to clear dev environment when not running on an ephemeral GH runner.
    // Reinstallation will otherwise fail due to "uninstall" message prompt, so we must uninstall first (hence the setTimeout delay)
    const uninstaller = path.join(localProgramsPath, "Uninstall TestApp.exe")
    if (existsSync(uninstaller)) {
      console.log("Uninstalling", uninstaller)
      execFileSync(uninstaller, ["/S", "/C", "exit"], { stdio: "inherit" })
      await new Promise(resolve => setTimeout(resolve, 5000))
    }

    const installerPath = path.join(dirPath, "TestApp Setup.exe")
    console.log("Installing windows", installerPath)
    // Don't use /S for silent install as we lose stdout pipe
    execFileSync(installerPath, ["/S"], { stdio: "inherit" })

    appPath = path.join(localProgramsPath, "TestApp.exe")
  } else if (target === "nsis" && vm) {
    // Running on macOS host with Parallels VM — install and locate app inside the VM.
    try {
      await vm.exec("taskkill", ["/F", "/IM", "TestApp Setup.exe", "/T"])
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch {
      // no matching process — expected on the first run
    }
    // Query LOCALAPPDATA once; used for both the uninstaller check and the install path.
    const localAppData = (await vm.exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::GetFolderPath('LocalApplicationData')"])).trim()
    const uninstallerPath = `${localAppData}\\Programs\\TestApp\\Uninstall TestApp.exe`
    try {
      await vm.exec(uninstallerPath, ["/S", "/C", "exit"])
      await new Promise(resolve => setTimeout(resolve, 5000))
    } catch {
      // no previous installation — expected on first run
    }
    // Use HTTP to deliver the installer: getParallelsHostIP() returns the Mac's bridge IP
    // (e.g. 10.211.55.2) which is reachable from the VM. \\Mac\Home\ hangs on large binary reads.
    const hostIP = getParallelsHostIP()
    if (!hostIP) {
      throw new Error("Cannot determine Parallels host IP for installer delivery — no prl*/bridge* interface found")
    }

    // Validate values that will be interpolated into the PowerShell script.
    // Both are internally generated (not user input), but guard against unexpected values.
    if (!/^[\d.]+$/.test(hostIP)) {
      throw new Error(`Unsafe hostIP: ${hostIP}`)
    }

    // Compute the installer hash on the Mac side before serving so the Windows side can verify it.
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
      `    $lad = [Environment]::GetFolderPath('LocalApplicationData')`,
      `    $installPath = Join-Path $lad 'Programs\\TestApp\\TestApp.exe'`,
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
      const installResult = await vm.exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", winScriptPath], { timeout: 300000 })
      console.log("Installer output:", installResult)
    } finally {
      installerServer.close()
      await remove(scriptPath).catch(() => {})
    }
    appPath = `${localAppData}\\Programs\\TestApp\\TestApp.exe`
  } else if (process.platform === "darwin") {
    appPath = path.join(dirPath, `mac${getArchSuffix(arch)}`, `TestApp.app`, "Contents", "MacOS", "TestApp")
  } else {
    throw new Error(`Unsupported Update test target: ${target}`)
  }
  return appPath
}

async function handleCleanupPerOS({ target }: { target: string }) {
  // TODO: ignore for now, this doesn't block CI, but proper uninstall logic should be implemented
  if (target === "deb") {
    //   execSync("dpkg -r testapp", { stdio: "inherit" });
  } else if (target === "rpm") {
    // execSync(`zypper rm -y testapp`, { stdio: "inherit" })
  } else if (target === "pacman") {
    execSync(`pacman -R --noconfirm testapp`, { stdio: "inherit" })
  } else if (process.platform === "win32") {
    // Kill any lingering NSIS installer processes before running the uninstaller,
    // so the uninstaller isn't blocked by a still-running update installer holding file locks.
    try {
      execSync('taskkill /F /IM "TestApp Setup.exe" /T', { stdio: "ignore" })
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch {
      // no matching process — ignore
    }

    // access installed app's location
    const localProgramsPath = path.join(process.env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local"), "Programs", "TestApp")
    const uninstaller = path.join(localProgramsPath, "Uninstall TestApp.exe")
    console.log("Uninstalling", uninstaller)
    execFileSync(uninstaller, ["/S", "/C", "exit"], { stdio: "inherit" })
    await new Promise(resolve => setTimeout(resolve, 5000))
  } else if (process.platform === "darwin") {
    // ignore, nothing to uninstall, it's running/updating out of the local `dist` directory
  }
}

async function runTestWithinServer(doTest: (rootDirectory: string, updateConfigPath: string) => Promise<void>, vm?: VmManager) {
  const tmpDir = new TmpDir("blackbox-update-test")
  const root = await tmpDir.getTempDir({ prefix: "server-root" })

  // When a VM is in use, the update server must be reachable from inside the VM.
  // Bind to the Parallels host IP specifically so the server is accessible from the VM
  // without exposing it on all interfaces.
  const serverHost = vm ? getParallelsHostIP() : "127.0.0.1"
  if (vm && !serverHost) {
    throw new Error("Cannot determine Parallels host IP for update server — no prl*/bridge* interface found")
  }
  const { server, port } = await createLocalServer(root, serverHost!)

  const serverConfig: GenericServerOptions = { provider: "generic", url: `http://${serverHost}:${port}` }
  let updateConfig: string
  let vmConfigDir: string | undefined
  if (vm) {
    // Write config to home dir → \\Mac\Home\... which Parallels always shares.
    // System temp → \\Mac\Host\private\var\folders\... requires "All Disks" sharing and may be inaccessible.
    vmConfigDir = path.join(homedir(), `.eb-update-test-${randomUUID()}`)
    updateConfig = path.join(vmConfigDir, "app-update.yml")
    await outputFile(updateConfig, serializeToYaml(serverConfig))
  } else {
    updateConfig = await writeUpdateConfig<GenericServerOptions>(serverConfig)
  }

  const cleanup = () => {
    try {
      tmpDir.cleanupSync()
    } catch (error) {
      console.error("Failed to cleanup tmpDir", error)
    }
    try {
      server.close()
    } catch (error) {
      console.error("Failed to close server", error)
    }
    if (vmConfigDir) {
      remove(vmConfigDir).catch(() => {})
    }
  }

  return await new Promise<void>((resolve, reject) => {
    server.on("error", reject)
    doTest(root, updateConfig).then(resolve).catch(reject)
  }).then(
    v => {
      cleanup()
      return v
    },
    e => {
      cleanup()
      throw e
    }
  )
}
