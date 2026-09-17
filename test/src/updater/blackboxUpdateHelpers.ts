import { ToolsetConfig } from "app-builder-lib"
import { getWindowsVm, ParallelsVmManager, PM, VmManager } from "app-builder-lib/internal"
import { computeUpdateManifestKeyId, GenericServerOptions, Nullish, UpdateInfo, verifyManifestSignatures } from "builder-util-runtime"
import { archFromString, deepAssign, DebugLogger, generateUpdateSigningKeypair, log, serializeToYaml, TmpDir } from "builder-util"
import { Arch, Configuration, Platform } from "electron-builder"
import { copy, emptyDir, existsSync, move, outputFile, readJsonSync, remove } from "fs-extra"
import { homedir } from "os"
import path from "path"
import { randomUUID } from "crypto"
import { ExpectStatic, TestContext } from "vitest"
import { createLocalServer, getParallelsHostIP, launchAndWaitForQuit } from "../helpers/launchAppCrossPlatform"
import { assertPack, EXTENDED_TIMEOUT, modifyPackageJson, PackedContext } from "../helpers/packTester"
import { ELECTRON_VERSION, PACMAN_TEST_DEPENDS } from "../helpers/testConfig"
import { NEW_VERSION_NUMBER, OLD_VERSION_NUMBER, writeUpdateConfig } from "../helpers/updaterTestUtil"
import { cleanupWindowsNative, installWindowsNative, installWindowsVm } from "./blackboxInstallWindows"
import { cleanupLinux, installLinux } from "./blackboxInstallLinux"
import { installMac } from "./blackboxInstallMac"
import { readEmbeddedUpdateConfig, readUpdateManifest, resignManifest, rewriteServedManifests } from "./signedManifestTestUtil"

export const optionsForFlakyE2E = { sequential: true, retry: 2, timeout: EXTENDED_TIMEOUT } as const
// Three builds and two update hops (plus negative launches) instead of two builds and one hop: 15-25 min per
// attempt, so a single retry keeps a genuine failure within the 60-minute job cap of the mac runner.
export const optionsForFlakyMultiHopE2E = { ...optionsForFlakyE2E, retry: 1, timeout: EXTENDED_TIMEOUT * 1.5 } as const

/** Third version for multi-hop (key rotation) update tests: 1.0.0 → 1.0.1 → 1.0.2 */
export const THIRD_VERSION_NUMBER = "1.0.2"

/** A version to build, optionally with configuration that applies to that build only (e.g. its `updateManifest` keys). */
export type VersionBuild = { version: string; extraConfig?: Partial<Configuration> | Nullish }

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
  extraConfiguration?: Configuration | null,
  versions: Array<string | VersionBuild> = [OLD_VERSION_NUMBER, NEW_VERSION_NUMBER]
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
              electronUpdaterCompatibility: ">=2.16",
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
              pacman: {
                depends: PACMAN_TEST_DEPENDS,
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
        // pnpm 11 reads its own settings from pnpm-workspace.yaml alone (neither `node-linker` in .npmrc nor the `pnpm` key of
        // package.json is consulted any more), so packTester writes these next to app/package.json for the install. Hoisted from the
        // start, the install keeps the sqlite3 binary that @electron/rebuild produces right after it: the former follow-up
        // `pnpm install --config.node-linker=hoisted` re-linked node_modules from the store (dropping that binary) and, under pnpm 11,
        // failed outright with ERR_PNPM_IGNORED_BUILDS for sqlite3 (strictDepBuilds).
        packageManagerSettings: { nodeLinker: "hoisted", supportedArchitectures: { os: ["current"], cpu: ["x64", "arm64"] } },
        projectDirCreated: async projectDir => {
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
    // first build uses "store", later builds use "maximum" — validates both compressions work while we're at it
    let isFirstBuild = true
    for (const entry of versions) {
      const { version, extraConfig } = typeof entry === "string" ? { version: entry, extraConfig: null } : entry
      // shallow merge on purpose: a per-version block (e.g. `updateManifest`) replaces the shared one wholesale
      // (deepAssign would union arrays such as signingKey lists)
      await build(version, { ...extraConfiguration, ...extraConfig, compression: isFirstBuild ? "store" : "maximum" })
      isFirstBuild = false
    }
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

/** (Re)writes the runtime update config the fixture app reads (`autoUpdater.updateConfigPath`), e.g. to change the trust list between hops. */
export async function writeServedUpdateConfig(updateConfigPath: string, config: GenericServerOptions): Promise<void> {
  await outputFile(updateConfigPath, serializeToYaml(config))
}

/**
 * Serves `rootDirectory` over HTTP and writes the runtime update config (generic provider pointing at that
 * server, merged with `extraUpdateConfig` — e.g. `updateManifestPublicKey`) the fixture app is launched with.
 * `doTest` also receives the server config so a scenario can rewrite the update config between hops via
 * {@link writeServedUpdateConfig}.
 */
export async function runTestWithinServer(
  doTest: (rootDirectory: string, updateConfigPath: string, serverConfig: GenericServerOptions) => Promise<void>,
  vm?: VmManager,
  extraUpdateConfig?: Partial<GenericServerOptions> | null
) {
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

  const serverConfig: GenericServerOptions = { ...extraUpdateConfig, provider: "generic", url: `http://${serverHost}:${port}` }
  let updateConfig: string
  let vmConfigDir: string | undefined
  if (vm) {
    // Write config to home dir → \\Mac\Home\... which Parallels always shares.
    // System temp → \\Mac\Host\private\var\folders\... requires "All Disks" sharing and may be inaccessible.
    vmConfigDir = path.join(homedir(), `.eb-update-test-${randomUUID()}`)
    updateConfig = path.join(vmConfigDir, "app-update.yml")
    await writeServedUpdateConfig(updateConfig, serverConfig)
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
    doTest(root, updateConfig, serverConfig).then(resolve).catch(reject)
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

      await updateHop(expect, { appPath, vm, updateConfigPath, packageManager, fromVersion: OLD_VERSION_NUMBER, toVersion: NEW_VERSION_NUMBER })
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

/**
 * One full update hop: launch the installed app (must report `fromVersion`), wait until it has downloaded the
 * update and quit into the installer, then poll until the installed binary reports `toVersion`.
 * `assertLaunch` runs against the update launch's stdout before polling (e.g. to check updater log lines).
 */
export async function updateHop(
  expect: ExpectStatic,
  {
    appPath,
    vm,
    updateConfigPath,
    packageManager,
    fromVersion,
    toVersion,
    assertLaunch,
  }: {
    appPath: string
    vm: VmManager | undefined
    updateConfigPath: string
    packageManager: string
    fromVersion: string
    toVersion: string
    assertLaunch?: (stdout: string) => void
  }
): Promise<void> {
  // waitForExit: true — don't proceed until the old app fully quits.
  // On Linux (rpm/deb/pacman) the package manager install is synchronous, so exit means install done.
  // On Windows (NSIS) and Mac (zip) the installer runs detached/async, so the app exits before
  // installation completes — the polling loop below handles that case.
  const result = await launchAndWaitForQuit({
    appPath,
    vm,
    timeoutMs: 5 * 60 * 1000,
    updateConfigPath,
    expectedVersion: fromVersion,
    packageManagerToTest: packageManager,
    waitForExit: true,
  })
  log.info({ version: result.version, stdout: result.stdout }, "Initial launch completed")
  expect(result.version).toMatch(fromVersion)
  if (!result.stdout.includes("Update downloaded")) {
    throw new Error(`Update phase did not complete — quitAndInstall was never triggered.\nFull stdout:\n${result.stdout}`)
  }
  if (assertLaunch != null) {
    await result.assert(() => assertLaunch(result.stdout))
  }

  await pollUntilNewVersionInstalled(expect, { appPath, vm, updateConfigPath, packageManagerToTest: packageManager, expectedVersion: toVersion })
}

/**
 * Poll until the installed binary reports the new version.
 * AUTO_UPDATER_TEST is disabled so the probe app quits immediately after printing its version
 * (no update cycle triggered), which also prevents a second installer from running in parallel.
 */
async function pollUntilNewVersionInstalled(
  expect: ExpectStatic,
  {
    appPath,
    vm,
    updateConfigPath,
    packageManagerToTest,
    expectedVersion = NEW_VERSION_NUMBER,
  }: { appPath: string; vm: VmManager | undefined; updateConfigPath: string; packageManagerToTest: string; expectedVersion?: string }
): Promise<void> {
  const pollDeadline = Date.now() + 6 * 60 * 1000
  const pollInterval = 5 * 1000
  let newVersion: string | undefined
  while (Date.now() < pollDeadline) {
    try {
      const probe = await launchAndWaitForQuit({
        appPath,
        vm,
        // A cold relaunch of the freshly-extracted update can be slow (Gatekeeper verification,
        // embedded-asar integrity validation, slow CI crypto), so give each probe a generous
        // window. A single timeout is not fatal — the surrounding poll loop retries until the
        // pollDeadline, so the worst case is bounded by pollDeadline, not by this value.
        timeoutMs: 60 * 1000,
        updateConfigPath,
        packageManagerToTest,
        env: { AUTO_UPDATER_TEST: "" }, // disables updater — app prints version and quits
        // waitForExit: true ensures TestApp.exe is fully released before the next
        // poll iteration, giving the detached NSIS installer an uncontested window
        // to overwrite the binary (Windows locks executables while they are running).
        waitForExit: true,
      })
      newVersion = probe.version
      if (newVersion === expectedVersion) {
        break
      }
      log.info({ installedVersion: newVersion, expected: expectedVersion, stdout: probe.stdout, stderr: probe.stderr }, "Installer still in progress, retrying...")
    } catch (err: any) {
      // NSIS replaces the exe non-atomically: it deletes the old binary before writing the new one,
      // so there is a brief window where TestApp.exe does not exist on disk.
      if (err.code === "ENOENT" && (err.syscall === "spawn" || err.syscall?.startsWith("spawn "))) {
        log.info({ appPath }, "Binary temporarily unavailable (NSIS installer in progress), retrying...")
      } else if (typeof err.message === "string" && err.message.startsWith("Timeout after")) {
        // A single probe launch stalled (no APP_VERSION printed before the timeout). Surface
        // exactly what the app emitted (the message embeds STDOUT/STDERR) and keep polling
        // instead of failing the whole test on the first slow launch.
        log.info({ appPath, detail: err.message }, "Probe launch timed out, retrying...")
      } else {
        throw err
      }
    }
    if (Date.now() + pollInterval < pollDeadline) {
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }
  }
  expect(newVersion).toMatch(expectedVersion)
}

/**
 * Full install-on-next-launch update cycle (#7807):
 *   1. launch the old version with AUTO_UPDATER_TEST_NEXT_LAUNCH=true — the update is downloaded and
 *      quitAndInstall({ waitUntilNextLaunch: true }) queues it and quits WITHOUT running the installer
 *   2. probe that the installed binary still reports the old version (nothing was installed on quit)
 *   3. relaunch, installing the pending update:
 *      - "automatic": AUTO_UPDATER_TEST_AUTO_INSTALL_ON_NEXT_LAUNCH=true — autoInstallEvent: "onNextLaunch"
 *        installs at startup on its own (supported by NSIS and AppImage only)
 *      - "explicit": AUTO_UPDATER_TEST_INSTALL_PENDING=true — the app calls
 *        installPendingUpdateIfAvailable() itself; the only pending-install path for deb/rpm/pacman,
 *        whose doInstall elevates via pkexec/sudo and must not prompt at startup
 *   4. poll until the installed binary reports the new version
 *   5. "explicit" only: relaunch once more and assert installPendingUpdateIfAvailable() reports false
 *      now that nothing is pending
 */
export async function runInstallOnNextLaunchTest(
  context: TestContext,
  target: string,
  packageManager: string,
  arch: Arch,
  toolsets: ToolsetConfig,
  installMode: "automatic" | "explicit",
  extraConfig?: Partial<Configuration>
) {
  const { expect } = context
  const vm = await windowsVmPromise
  if (vm && target === "nsis") {
    console.log("Running Windows install-on-next-launch test via Parallels VM")
  }

  const tmpDir = new TmpDir("install-on-next-launch")
  const outDirs: ApplicationUpdatePaths[] = []
  const shouldRunWindowsTests = process.platform === "win32" || (target === "nsis" && vm != null)
  const buildConfig = deepAssign({ toolsets } as Configuration, extraConfig ?? {})
  await doBuild(expect, outDirs, target, arch, tmpDir, shouldRunWindowsTests, buildConfig)

  const oldAppDir = outDirs[0]
  const newAppDir = outDirs[1]

  // Setup tests by installing the previous version
  const appPath = await handleInitialInstallPerOS({ target, dirPath: oldAppDir.dir, arch, vm })
  if (!vm && !existsSync(appPath)) {
    throw new Error(`App not found: ${appPath}`)
  }

  let queuedError: Error | null = null
  try {
    await runTestWithinServer(async (rootDirectory: string, updateConfigPath: string) => {
      // Move app update to the root directory of the server
      await copy(newAppDir.dir, rootDirectory, { recursive: true, overwrite: true })

      // 1. Download the update and queue it for the next launch — the app must quit without installing.
      const queueResult = await launchAndWaitForQuit({
        appPath,
        vm,
        timeoutMs: 5 * 60 * 1000,
        updateConfigPath,
        expectedVersion: OLD_VERSION_NUMBER,
        packageManagerToTest: packageManager,
        waitForExit: true,
        env: { AUTO_UPDATER_TEST_NEXT_LAUNCH: "true" },
      })
      log.info({ version: queueResult.version }, "Queue-for-next-launch launch completed")
      await queueResult.assert(() => {
        expect(queueResult.version).toMatch(OLD_VERSION_NUMBER)
        expect(queueResult.stdout).toContain("Update downloaded")
        expect(queueResult.stdout).toContain("Deferring install to next launch on explicit quitAndInstall")
        expect(queueResult.stdout).toContain("Update is marked for install on next launch")
      })

      // 2. The installer must NOT have run — the installed binary still reports the old version.
      const probe = await launchAndWaitForQuit({
        appPath,
        vm,
        timeoutMs: 60 * 1000,
        updateConfigPath,
        packageManagerToTest: packageManager,
        env: { AUTO_UPDATER_TEST: "" }, // disables updater — app prints version and quits
        waitForExit: true,
      })
      await probe.assert(() => expect(probe.version).toMatch(OLD_VERSION_NUMBER))

      // 3. Relaunch — the pending update is re-validated against the update server and installed.
      const installResult = await launchAndWaitForQuit({
        appPath,
        vm,
        timeoutMs: 5 * 60 * 1000,
        updateConfigPath,
        expectedVersion: OLD_VERSION_NUMBER,
        packageManagerToTest: packageManager,
        waitForExit: true,
        env: installMode === "automatic" ? { AUTO_UPDATER_TEST_AUTO_INSTALL_ON_NEXT_LAUNCH: "true" } : { AUTO_UPDATER_TEST_INSTALL_PENDING: "true" },
      })
      log.info({ version: installResult.version, installMode }, "Pending-install launch completed")
      await installResult.assert(() => {
        expect(installResult.stdout).toContain("Installing pending update")
        if (installMode === "explicit") {
          expect(installResult.stdout).toContain("INSTALL_PENDING_RESULT: true")
        }
      })

      // 4. Wait until the installed binary reports the new version (NSIS/AppImage installers run detached).
      await pollUntilNewVersionInstalled(expect, { appPath, vm, updateConfigPath, packageManagerToTest: packageManager })

      // 5. Nothing is pending anymore — the explicit call must report false and leave the app intact.
      if (installMode === "explicit") {
        const negativeResult = await launchAndWaitForQuit({
          appPath,
          vm,
          timeoutMs: 2 * 60 * 1000,
          updateConfigPath,
          expectedVersion: NEW_VERSION_NUMBER,
          packageManagerToTest: packageManager,
          waitForExit: true,
          env: { AUTO_UPDATER_TEST_INSTALL_PENDING: "true" },
        })
        await negativeResult.assert(() => {
          expect(negativeResult.version).toMatch(NEW_VERSION_NUMBER)
          expect(negativeResult.stdout).toContain("INSTALL_PENDING_RESULT: false")
        })
      }
    }, vm)
  } catch (error: any) {
    log.error({ error: error.message }, "Install-on-next-launch blackbox test failed to run")
    queuedError = error
  } finally {
    // windows needs to release file locks, so a delay seems to be needed
    await new Promise(resolve => setTimeout(resolve, 1000))
    await tmpDir.cleanup()
    try {
      await handleCleanupPerOS({ target })
    } catch (error: any) {
      log.error({ error: error.message }, "Install-on-next-launch blackbox test cleanup failed")
      // ignore
    }
  }
  if (queuedError) {
    throw queuedError
  }
}

// ---------------------------------------------------------------------------------------------------------
// Signed update manifests (Ed25519) — see website/docs/features/signed-update-manifests.md
// ---------------------------------------------------------------------------------------------------------

/** Line the fixture app logs (via `[updater]`) when a manifest passed signature verification. */
export const manifestVerifiedMarker = (version: string) => `Update manifest signature verified for version ${version}`
/** Substring of the warning the updater logs when no `updateManifestPublicKey` is configured at all. */
export const MANIFEST_VERIFICATION_DISABLED_MARKER = "verification is disabled"

interface ScenarioContext {
  expect: ExpectStatic
  vm: VmManager | undefined
  /** installed (old) app binary, updated in place by every hop */
  appPath: string
  /** build output per version, in build order */
  outDirs: Array<ApplicationUpdatePaths>
  packageManager: string
  rootDirectory: string
  updateConfigPath: string
  serverConfig: GenericServerOptions
}

/**
 * Shared skeleton of every blackbox update scenario: build all versions, install the first one, serve the
 * second one and run `scenario`; cleanup mirrors {@link runTest}.
 */
async function runUpdateScenario(
  context: TestContext,
  {
    target,
    packageManager,
    arch,
    toolsets,
    extraConfig,
    builds,
    tmpDirPrefix,
    initialUpdateConfig,
    scenario,
  }: {
    target: string
    packageManager: string
    arch: Arch
    toolsets: ToolsetConfig
    extraConfig?: Partial<Configuration>
    builds: Array<VersionBuild>
    tmpDirPrefix: string
    /** merged into the served update config, derived from the builds (e.g. the trust list embedded into the installed version) */
    initialUpdateConfig: (outDirs: Array<ApplicationUpdatePaths>) => Promise<Partial<GenericServerOptions>>
    scenario: (ctx: ScenarioContext) => Promise<void>
  }
): Promise<void> {
  const { expect } = context
  const vm = await windowsVmPromise
  if (vm && target === "nsis") {
    console.log(`Running Windows ${tmpDirPrefix} test via Parallels VM`)
  }

  const tmpDir = new TmpDir(tmpDirPrefix)
  const outDirs: ApplicationUpdatePaths[] = []
  const shouldRunWindowsTests = process.platform === "win32" || (target === "nsis" && vm != null)
  const buildConfig = deepAssign({ toolsets } as Configuration, extraConfig ?? {})
  await doBuild(expect, outDirs, target, arch, tmpDir, shouldRunWindowsTests, buildConfig, builds)
  expect(outDirs.length).toBe(builds.length)

  const extraUpdateConfig = await initialUpdateConfig(outDirs)

  // Setup tests by installing the previous version
  const appPath = await handleInitialInstallPerOS({ target, dirPath: outDirs[0].dir, arch, vm })
  if (!vm && !existsSync(appPath)) {
    throw new Error(`App not found: ${appPath}`)
  }

  let queuedError: Error | null = null
  try {
    await runTestWithinServer(
      async (rootDirectory: string, updateConfigPath: string, serverConfig: GenericServerOptions) => {
        // Serve the first update
        await copy(outDirs[1].dir, rootDirectory, { recursive: true, overwrite: true })
        await scenario({ expect, vm, appPath, outDirs, packageManager, rootDirectory, updateConfigPath, serverConfig })
      },
      vm,
      extraUpdateConfig
    )
  } catch (error: any) {
    log.error({ error: error.message }, `Blackbox ${tmpDirPrefix} test failed to run`)
    queuedError = error
  } finally {
    // windows needs to release file locks, so a delay seems to be needed
    await new Promise(resolve => setTimeout(resolve, 1000))
    await tmpDir.cleanup()
    try {
      await handleCleanupPerOS({ target })
    } catch (error: any) {
      log.error({ error: error.message }, `Blackbox ${tmpDirPrefix} test cleanup failed`)
      // ignore
    }
  }
  if (queuedError) {
    throw queuedError
  }
}

/**
 * Launches the installed app against a served manifest it must refuse: the updater has to fail with
 * `expectedErrorCode` before anything is downloaded, and the installed version must be unchanged afterwards.
 */
async function expectRejectedUpdate(
  { expect, appPath, vm, updateConfigPath, packageManager }: ScenarioContext,
  { installedVersion, expectedErrorCode }: { installedVersion: string; expectedErrorCode: string }
): Promise<void> {
  const result = await launchAndWaitForQuit({
    appPath,
    vm,
    timeoutMs: 5 * 60 * 1000,
    updateConfigPath,
    expectedVersion: installedVersion,
    packageManagerToTest: packageManager,
    waitForExit: true,
  })
  log.info({ version: result.version, expectedErrorCode }, "Rejected-update launch completed")
  await result.assert(() => {
    expect(result.version).toMatch(installedVersion)
    // the fixture prints `Error in auto-updater: <util.inspect(err)>`, which includes the `code` property
    expect(result.stdout).toContain(expectedErrorCode)
    expect(result.stdout).not.toContain("Update downloaded")
    expect(result.stdout).not.toContain(MANIFEST_VERIFICATION_DISABLED_MARKER)
  })

  // nothing may have been installed
  const probe = await launchAndWaitForQuit({
    appPath,
    vm,
    timeoutMs: 60 * 1000,
    updateConfigPath,
    packageManagerToTest: packageManager,
    env: { AUTO_UPDATER_TEST: "" }, // disables updater — app prints version and quits
    waitForExit: true,
  })
  await probe.assert(() => expect(probe.version).toMatch(installedVersion))
}

/** Asserts the manifest of a build is signed by exactly `publicKeyPems` (in order), legacy `signature` included. */
function assertManifestSignedBy(expect: ExpectStatic, info: UpdateInfo, version: string, publicKeyPems: Array<string>): void {
  expect(info.version).toBe(version)
  expect(info.signatures?.map(it => it.keyId)).toEqual(publicKeyPems.map(computeUpdateManifestKeyId))
  expect(info.signature).toBe(info.signatures![0].signature)
  for (const publicKeyPem of publicKeyPems) {
    expect(verifyManifestSignatures(info, [publicKeyPem])).toMatchObject({ ok: true, keyId: computeUpdateManifestKeyId(publicKeyPem) })
  }
}

/** Asserts the trust list electron-builder embedded into a build's `app-update.yml` (string for one key, list for several). */
async function assertEmbeddedTrustList(expect: ExpectStatic, dist: ApplicationUpdatePaths, publicKeyPems: Array<string>): Promise<string | Array<string>> {
  const embedded = await readEmbeddedUpdateConfig(dist.dir)
  const expected = publicKeyPems.length === 1 ? publicKeyPems[0] : publicKeyPems
  expect(embedded.updateManifestPublicKey).toEqual(expected)
  return expected
}

/**
 * Signed update manifest end-to-end: both versions are built with the same runtime-generated Ed25519 key, the
 * installed app trusts the key electron-builder embedded into its `app-update.yml`, verifies the served
 * `latest*.yml` and installs the update.
 */
export async function runSignedManifestTest(context: TestContext, target: string, packageManager: string, arch: Arch = Arch.x64, toolsets: ToolsetConfig = {}): Promise<void> {
  const keyA = generateUpdateSigningKeypair()
  const signedByA: Partial<Configuration> = { updateManifest: { signingKey: keyA.privateKeyPem } }

  await runUpdateScenario(context, {
    target,
    packageManager,
    arch,
    toolsets,
    tmpDirPrefix: "signed-manifest",
    builds: [
      { version: OLD_VERSION_NUMBER, extraConfig: signedByA },
      { version: NEW_VERSION_NUMBER, extraConfig: signedByA },
    ],
    initialUpdateConfig: async outDirs => {
      const { expect } = context
      assertManifestSignedBy(expect, await readUpdateManifest(outDirs[0].dir), OLD_VERSION_NUMBER, [keyA.publicKeyPem])
      assertManifestSignedBy(expect, await readUpdateManifest(outDirs[1].dir), NEW_VERSION_NUMBER, [keyA.publicKeyPem])
      await assertEmbeddedTrustList(expect, outDirs[1], [keyA.publicKeyPem])
      // The fixture reads the served config instead of the embedded app-update.yml, so the installed
      // version's trust list is carried over verbatim.
      const updateManifestPublicKey = await assertEmbeddedTrustList(expect, outDirs[0], [keyA.publicKeyPem])
      return { updateManifestPublicKey }
    },
    scenario: async ctx => {
      const { expect } = ctx
      await updateHop(expect, {
        ...ctx,
        fromVersion: OLD_VERSION_NUMBER,
        toVersion: NEW_VERSION_NUMBER,
        assertLaunch: stdout => {
          expect(stdout).toContain(manifestVerifiedMarker(NEW_VERSION_NUMBER))
          expect(stdout).not.toContain(MANIFEST_VERIFICATION_DISABLED_MARKER)
        },
      })
    },
  })
}

/**
 * Key rotation end-to-end (docs: "Key rotation"), with two runtime-generated Ed25519 keys A and B:
 *   v1 1.0.0 signed by A (trusts A)   →   v2 1.0.1 signed by [A, B] (trusts [A, B])   →   v3 1.0.2 signed by B (trusts B)
 *
 * Before the first hop, the installed v1 must refuse the served v2 dist when its manifest is
 *   - re-signed by B only  → ERR_UPDATER_MANIFEST_SIGNATURE_INVALID (v1 does not trust B yet)
 *   - left unsigned         → ERR_UPDATER_MANIFEST_NOT_SIGNED
 * and stay at 1.0.0. Then 1.0.0 → 1.0.1 verifies through A's signature of the dual-signed manifest, and — with the
 * trust list of the freshly installed v2 — 1.0.1 → 1.0.2 verifies through B alone.
 */
export async function runKeyRotationTest(context: TestContext, target: string, packageManager: string, arch: Arch = Arch.x64, toolsets: ToolsetConfig = {}): Promise<void> {
  const keyA = generateUpdateSigningKeypair()
  const keyB = generateUpdateSigningKeypair()

  await runUpdateScenario(context, {
    target,
    packageManager,
    arch,
    toolsets,
    tmpDirPrefix: "key-rotation",
    builds: [
      { version: OLD_VERSION_NUMBER, extraConfig: { updateManifest: { signingKey: keyA.privateKeyPem } } },
      // bridge release: dual-signed, old key first so it also fills the legacy `signature`; trust list derived → [A, B]
      { version: NEW_VERSION_NUMBER, extraConfig: { updateManifest: { signingKey: [keyA.privateKeyPem, keyB.privateKeyPem] } } },
      { version: THIRD_VERSION_NUMBER, extraConfig: { updateManifest: { signingKey: keyB.privateKeyPem } } },
    ],
    initialUpdateConfig: async outDirs => {
      const { expect } = context
      assertManifestSignedBy(expect, await readUpdateManifest(outDirs[0].dir), OLD_VERSION_NUMBER, [keyA.publicKeyPem])
      assertManifestSignedBy(expect, await readUpdateManifest(outDirs[1].dir), NEW_VERSION_NUMBER, [keyA.publicKeyPem, keyB.publicKeyPem])
      assertManifestSignedBy(expect, await readUpdateManifest(outDirs[2].dir), THIRD_VERSION_NUMBER, [keyB.publicKeyPem])
      await assertEmbeddedTrustList(expect, outDirs[1], [keyA.publicKeyPem, keyB.publicKeyPem])
      await assertEmbeddedTrustList(expect, outDirs[2], [keyB.publicKeyPem])
      const updateManifestPublicKey = await assertEmbeddedTrustList(expect, outDirs[0], [keyA.publicKeyPem])
      return { updateManifestPublicKey }
    },
    scenario: async ctx => {
      const { expect, outDirs, rootDirectory, updateConfigPath, serverConfig } = ctx

      // Negative 1: the served v2 manifest is signed by B only — v1 trusts only A.
      let restore = await rewriteServedManifests(rootDirectory, info => resignManifest(info, [keyB.privateKeyPem]))
      await expectRejectedUpdate(ctx, { installedVersion: OLD_VERSION_NUMBER, expectedErrorCode: "ERR_UPDATER_MANIFEST_SIGNATURE_INVALID" })
      await restore()

      // Negative 2: the served v2 manifest carries no signature at all.
      restore = await rewriteServedManifests(rootDirectory, info => resignManifest(info, []))
      await expectRejectedUpdate(ctx, { installedVersion: OLD_VERSION_NUMBER, expectedErrorCode: "ERR_UPDATER_MANIFEST_NOT_SIGNED" })
      await restore()

      // Hop 1: the original dual-signed v2 manifest verifies through A.
      await updateHop(expect, {
        ...ctx,
        fromVersion: OLD_VERSION_NUMBER,
        toVersion: NEW_VERSION_NUMBER,
        assertLaunch: stdout => {
          expect(stdout).toContain(manifestVerifiedMarker(NEW_VERSION_NUMBER))
          expect(stdout).not.toContain(MANIFEST_VERIFICATION_DISABLED_MARKER)
        },
      })

      // The installed app is now v2, whose app-update.yml trusts [A, B]; the served config mirrors it.
      const { updateManifestPublicKey } = await readEmbeddedUpdateConfig(outDirs[1].dir)
      expect(updateManifestPublicKey).toEqual([keyA.publicKeyPem, keyB.publicKeyPem])
      await writeServedUpdateConfig(updateConfigPath, { ...serverConfig, updateManifestPublicKey })

      // Hop 2: v3 is signed by B only. Reset the served root first: fs-extra `copy` cannot overwrite the relative
      // framework symlinks of the unpacked mac app (`Versions/Current -> A`) with themselves and throws
      // "Cannot copy 'A' to a subdirectory of itself". Nothing is running between hops and the server reads lazily.
      await emptyDir(rootDirectory)
      await copy(outDirs[2].dir, rootDirectory, { recursive: true, overwrite: true })
      assertManifestSignedBy(expect, await readUpdateManifest(rootDirectory), THIRD_VERSION_NUMBER, [keyB.publicKeyPem])
      await updateHop(expect, {
        ...ctx,
        fromVersion: NEW_VERSION_NUMBER,
        toVersion: THIRD_VERSION_NUMBER,
        assertLaunch: stdout => {
          expect(stdout).toContain(manifestVerifiedMarker(THIRD_VERSION_NUMBER))
          expect(stdout).not.toContain(MANIFEST_VERIFICATION_DISABLED_MARKER)
        },
      })
    },
  })
}
