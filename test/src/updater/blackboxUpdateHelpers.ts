import { ToolsetConfig } from "app-builder-lib"
import { getWindowsVm, ParallelsVmManager, PM, VmManager } from "app-builder-lib/internal"
import { GenericServerOptions, Nullish } from "builder-util-runtime"
import { archFromString, deepAssign, DebugLogger, log, serializeToYaml, spawn, TmpDir } from "builder-util"
import { Arch, Configuration, Platform } from "electron-builder"
import { copy, existsSync, move, outputFile, readJsonSync, remove } from "fs-extra"
import { homedir } from "os"
import path from "path"
import { randomUUID } from "crypto"
import { ExpectStatic, TestContext } from "vitest"
import { createLocalServer, getParallelsHostIP, launchAndWaitForQuit } from "../helpers/launchAppCrossPlatform"
import { assertPack, modifyPackageJson, PackedContext } from "../helpers/packTester"
import { ELECTRON_VERSION } from "../helpers/testConfig"
import { NEW_VERSION_NUMBER, OLD_VERSION_NUMBER, writeUpdateConfig } from "../helpers/updaterTestUtil"
import { cleanupWindowsNative, installWindowsNative, installWindowsVm } from "./blackboxInstallWindows"
import { cleanupLinux, installLinux } from "./blackboxInstallLinux"
import { installMac } from "./blackboxInstallMac"

export const optionsForFlakyE2E = { sequential: true, retry: 1, timeout: 15 * 60 * 1000 } as const

// Resolve only to a ParallelsVmManager — PwshVmManager (used for code-signing on Linux/Mac via Wine)
// is not capable of installing or running Windows executables and must not be treated as a Windows VM.
export const windowsVmPromise: Promise<ParallelsVmManager | undefined> = getWindowsVm(new DebugLogger(false))
  .then(vm => (vm.constructor.name === "ParallelsVmManager" ? (vm as ParallelsVmManager) : undefined))
  .catch(() => undefined)

export type ApplicationUpdatePaths = {
  dir: string
  appPath: string
}

export async function doBuild(
  expect: ExpectStatic,
  outDirs: Array<ApplicationUpdatePaths>,
  target: string,
  arch: Arch,
  tmpDir: TmpDir,
  isWindows: boolean,
  extraConfiguration?: Configuration | null
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
    extraConfig: Partial<Configuration> | Nullish
    packed: (context: PackedContext) => Promise<any>
  }) {
    await assertPack(
      expect,
      "test-app",
      {
        targets: currentPlatform.createTarget(target, arch),
        // Deep-merge so callers can override individual sub-object keys (e.g. nsis.perMachine)
        // without replacing the entire sub-object. publish/files are pinned last so they cannot
        // be accidentally overridden by a caller's extraConfig.
        config: Object.assign(
          deepAssign<Configuration>(
            {
              nativeModules: { npmRebuild: true },
              productName: "TestApp",
              executableName: "TestApp",
              appId: "com.test.app",
              artifactName: "${productName}.${ext}",
              electronLanguages: ["en"],
              extraMetadata: {
                name: "testapp",
                version,
              },
              electronUpdaterCompatibility: "1.1",
              electronFuses: {
                runAsNode: false,
                enableCookieEncryption: false, // don't enable cookie encryption for testing because it adds an additional decryption step to the update process which requires user interaction to unlock the keychain on macOS and can cause timeouts in CI, especially on older macOS versions with slower crypto performance
                enableNodeOptionsEnvironmentVariable: false,
                enableNodeCliInspectArguments: false,
                enableEmbeddedAsarIntegrityValidation: true,
                onlyLoadAppFromAsar: true,
                loadBrowserProcessSpecificV8Snapshot: false,
                grantFileProtocolExtraPrivileges: false,
              },
              compression: "store",
              nsis: {
                artifactName: "${productName} Setup.${ext}",
                // one click installer required. don't run after install otherwise we lose stdout pipe
                oneClick: true,
                runAfterFinish: false,
              },
            },
            extraConfig ?? {}
          ),
          // Always pin publish and files so they can't be accidentally overridden
          {
            publish: {
              provider: "s3",
              bucket: "develar",
              path: "test",
            },
            files: ["**/*", "../**/node_modules/**", "!path/**"],
          }
        ),
      },
      {
        storeDepsLockfileSnapshot: false,
        signedMac: !isWindows,
        signedWin: isWindows,
        packed,
        packageManager: PM.PNPM,
        projectDirCreated: async (projectDir, _tmpDir, runtimeEnv) => {
          // Write .npmrc to app/ — installDependencies runs pnpm with cwd=appDir, so pnpm 10
          // reads this file and uses hoisted layout for the main install.
          await outputFile(path.join(projectDir, "app", ".npmrc"), "node-linker=hoisted")

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
          // Return a post-install hook so the explicit flag runs AFTER installDependencies.
          // pnpm 11 ignores node-linker from .npmrc; the CLI flag here handles that case.
          return async () => {
            await spawn("pnpm", ["install", "--config.node-linker=hoisted"], { cwd: path.join(projectDir, "app"), stdio: "inherit", env: runtimeEnv })
          }
        },
      }
    )
  }

  const build = (version: string, extraConfig: Configuration | Nullish) =>
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
    await build(OLD_VERSION_NUMBER, { ...extraConfiguration, compression: "store" })
    await build(NEW_VERSION_NUMBER, { ...extraConfiguration, compression: "maximum" }) // validate both compressions work while we're at it
  } catch (e: any) {
    await tmpDir.cleanup()
    throw e
  }
}

const LINUX_TARGETS = ["AppImage", "deb", "rpm", "pacman"]

async function handleInitialInstallPerOS({
  target,
  dirPath,
  arch,
  vm,
  perMachine,
}: {
  target: string
  dirPath: string
  arch: Arch
  vm?: VmManager
  perMachine?: boolean
}): Promise<string> {
  if (LINUX_TARGETS.includes(target)) {
    return installLinux(target, dirPath)
  }
  if (process.platform === "win32") {
    return installWindowsNative(dirPath, perMachine ?? false)
  }
  if (target === "nsis" && vm) {
    return installWindowsVm(dirPath, arch, vm as ParallelsVmManager, perMachine ?? false)
  }
  if (process.platform === "darwin") {
    return installMac(dirPath, arch)
  }
  throw new Error(`Unsupported Update test target: ${target}`)
}

async function handleCleanupPerOS({ target, perMachine }: { target: string; perMachine?: boolean }): Promise<void> {
  if (process.platform === "win32") {
    return cleanupWindowsNative(perMachine)
  }
  cleanupLinux(target)
}

export async function runTestWithinServer(doTest: (rootDirectory: string, updateConfigPath: string) => Promise<void>, vm?: VmManager) {
  const tmpDir = new TmpDir("blackbox-update-test")
  const root = await tmpDir.getTempDir({ prefix: "server-root" })

  // When a VM is in use, the update server must be reachable from inside the VM.
  // Bind to the Parallels host IP specifically so the server is accessible from the VM
  // without exposing it on all interfaces.
  const serverHost = vm ? getParallelsHostIP() : "127.0.0.1"
  if (vm && !serverHost) {
    throw new Error("Cannot determine Parallels host IP for update server — no prl*/bridge* interface found")
  }
  const { server, port } = await createLocalServer(root, serverHost)

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

export async function runTest(
  context: TestContext,
  target: string,
  packageManager: string,
  arch: Arch = Arch.x64,
  toolsets: ToolsetConfig = {},
  extraConfig?: Partial<Configuration>
) {
  const { expect } = context
  const vm = await windowsVmPromise
  if (vm && target === "nsis") {
    console.log("Running Windows test via Parallels VM")
  }

  const tmpDir = new TmpDir("auto-update")
  const outDirs: ApplicationUpdatePaths[] = []
  const shouldRunWindowsTests = process.platform === "win32" || (target === "nsis" && vm != null)
  // Merge toolsets with any caller-supplied config overrides (e.g. nsis.perMachine)
  const buildConfig = deepAssign({ toolsets } as Configuration, extraConfig ?? {})
  await doBuild(expect, outDirs, target, arch, tmpDir, shouldRunWindowsTests, buildConfig)

  const oldAppDir = outDirs[0]
  const newAppDir = outDirs[1]

  const dirPath = oldAppDir.dir
  const perMachine = extraConfig?.nsis?.perMachine

  // Setup tests by installing the previous version
  const appPath = await handleInitialInstallPerOS({ target, dirPath, arch, vm, perMachine })

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
      await handleCleanupPerOS({ target, perMachine })
    } catch (error: any) {
      log.error({ error: error.message }, "Blackbox Updater Test cleanup failed")
      // ignore
    }
  }
  if (queuedError) {
    throw queuedError
  }
}
