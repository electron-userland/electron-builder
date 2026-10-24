import { AppImageOptions, Configuration, DebOptions, PacmanOptions, RpmOptions, Target, ToolsetConfig } from "app-builder-lib"
import { PM } from "app-builder-lib/internal"
import { readAsarHeader } from "app-builder-lib/src/asar/asar"
import { Arch, Platform } from "electron-builder"
import { DebUpdater, PacmanUpdater, RpmUpdater } from "electron-updater"
import { archFromString, log } from "builder-util"
import { deepAssign, GenericServerOptions } from "builder-util-runtime"
import { execSync } from "child_process"
import { move, readJsonSync } from "fs-extra"
import path from "path"
import { TestContext, TestOptions } from "vitest"
import { launchAndWaitForQuit } from "../helpers/launchAppCrossPlatform"
import { assertPack, EXTENDED_TIMEOUT, modifyPackageJson, PackedContext, readDebCompression } from "../helpers/packTester"
import { readAppImageCompression } from "../helpers/fileAssert"
import { ELECTRON_VERSION, PACMAN_TEST_DEPENDS } from "../helpers/testConfig"
import { OLD_VERSION_NUMBER, writeUpdateConfig } from "../helpers/updaterTestUtil"
import { canRunFlatpak, cleanupFlatpak, installFlatpak } from "./blackboxInstallLinux"

const optionsForInstall: TestOptions = { concurrent: false, retry: 0, timeout: EXTENDED_TIMEOUT }

const STANDARD_COMPRESSIONS: NonNullable<Configuration["compression"]>[] = ["store", "normal", "maximum"]
const APPIMAGE_COMPRESSIONS: AppImageOptions["compression"][] = ["xz", "gzip", "zstd"]
const LEGACY_COMPRESSIONS: AppImageOptions["compression"][] = ["xz", "gzip", "zstd"]
// xz/lzo = forwarded as --compression to FUSE2; zstd/null = flag omitted → mksquashfs defaults to gzip (or xz when compression="maximum")

// flatpak installs and runs the app by its id
const APP_ID = "com.test.app"

// Test runtime check. Can't be executed during test initialization (e.g. `ifEnv`)
const determineEnvironment = (distro: string) => {
  try {
    return execSync(`cat /etc/*release | grep "^ID="`).toString().includes(distro)
  } catch {
    return false
  }
}

// Linux Tests MUST be run in docker containers for proper ephemeral testing environment
describe.heavy.ifLinux("linux install", optionsForInstall, () => {
  for (const compression of STANDARD_COMPRESSIONS) {
    describe.ifEnv(process.env.RUN_APP_IMAGE_TEST === "true")(`AppImage toolsets`, optionsForInstall, () => {
      for (const arch of ["x64", "arm64"] as NodeJS.Architecture[]) {
        for (const legacyCompression of LEGACY_COMPRESSIONS) {
          test.ifEnv(arch === process.arch)(`${arch} - toolset: legacy - compression: ${compression} - compressor: override: ${legacyCompression}`, async context => {
            await runInstallTest(context, "appImage", archFromString(arch), { toolsets: { appimage: "0.0.0" }, compression, appImage: { compression: legacyCompression } })
          })
        }
        const toolsetAppImage = ["1.1.0", "1.0.3"] satisfies ToolsetConfig["appimage"][]
        for (const appimage of toolsetAppImage) {
          for (const appImageCompression of APPIMAGE_COMPRESSIONS) {
            test.ifEnv(arch === process.arch)(`${arch} - toolset: ${appimage} - compression: ${compression} - compressor: ${appImageCompression}`, async context => {
              await runInstallTest(context, "appImage", archFromString(arch), { toolsets: { appimage }, compression, appImage: { compression: appImageCompression } })
            })
          }
        }
      }
    })
    describe(`compression: ${compression}`, () => {
      const debCompressions: DebOptions["compression"][] = ["gz", "bzip2", "xz", "zst"]
      // DEB compression tests — debian container only
      for (const fpmCompression of debCompressions) {
        test(`deb - compression: ${compression} - compressor: ${fpmCompression}`, optionsForInstall, async context => {
          if (!determineEnvironment("debian")) {
            context.skip()
          }
          await runInstallTest(context, "deb", Arch.x64, { compression: compression, deb: { compression: fpmCompression } })
        })
      }
      const rpmCompressions: RpmOptions["compression"][] = ["xz", "xzmt", "gzip", "bzip2"]
      for (const fpmCompression of rpmCompressions) {
        // RPM compression tests — fedora container only
        test(`rpm - compression: ${compression} - compressor: ${fpmCompression}`, optionsForInstall, async context => {
          if (!determineEnvironment("fedora")) {
            context.skip()
          }
          await runInstallTest(context, "rpm", Arch.x64, { compression: compression, rpm: { compression: fpmCompression } })
        })
      }
      const pacmanCompressions: PacmanOptions["compression"][] = ["gz", "bzip2", "xz", "zstd"]
      for (const fpmCompression of pacmanCompressions) {
        // Pacman compression tests — arch container only
        test(`pacman - compression: ${compression} - compressor: ${fpmCompression}`, optionsForInstall, async context => {
          if (!determineEnvironment("arch")) {
            context.skip()
          }
          await runInstallTest(context, "pacman", Arch.x64, { compression: compression, pacman: { compression: fpmCompression } })
        })
      }
    })
  }
  // One case, outside the compression loop: default compression, latest appimage toolset. Electron runs
  // with the asar integrity fuses on (see runInstallTest), so a launch that reports its version proves it
  // reads every file of the aligned archive through the rewritten offsets.
  describe.ifEnv(process.env.RUN_APP_IMAGE_TEST === "true")(`AppImage asar.contentAlignment`, optionsForInstall, () => {
    test.ifEnv(process.arch === "x64")(`x64 - toolset: latest - compression: default - compressor: zstd - contentAlignment: 512`, async context => {
      const config: Configuration = { appImage: { compression: "zstd" }, asar: { contentAlignment: 512 } }
      await runInstallTest(context, "appImage", Arch.x64, config, async ctx => {
        const asarFile = path.join(ctx.outDir, "linux-unpacked", "resources", "app.asar")
        const offsets: number[] = []
        const walk = (node: any) => {
          for (const child of Object.values<any>(node.files ?? {})) {
            if (child.files != null) {
              walk(child)
            } else if (child.offset != null && !child.unpacked && child.link == null) {
              offsets.push(parseInt(child.offset, 10))
            }
          }
        }
        walk(JSON.parse((await readAsarHeader(asarFile)).header))
        context.expect(offsets.length).toBeGreaterThan(0)
        context.expect(offsets.filter(offset => offset % 512 !== 0)).toEqual([])
      })
    })
  })

  // The installed app runs in its sandbox, which needs a bubblewrap that can create namespaces. The docker images of the
  // tests above cannot provide that, so this runs where flatpak can run: the "Test Flatpak" job in CI.
  for (const arch of ["x64", "arm64"] as NodeJS.Architecture[]) {
    test.ifEnv(arch === process.arch && canRunFlatpak())(`flatpak - ${arch}`, async context => {
      await runInstallTest(context, "flatpak", archFromString(arch), {})
    })
  }
})

async function runInstallTest(
  context: TestContext,
  target: ConstructorParameters<typeof Target>[0],
  arch: Arch,
  extraConfig: Configuration,
  verifyPacked?: (ctx: PackedContext) => Promise<void>
): Promise<void> {
  const { expect, tmpDir } = context

  let artifactsDir: string | undefined

  const config = deepAssign<Configuration>(
    {
      nativeModules: { npmRebuild: true },
      productName: "TestApp",
      executableName: "TestApp",
      appId: APP_ID,
      artifactName: "${productName}.${ext}",
      electronLanguages: ["en"],
      extraMetadata: {
        name: "testapp",
        version: OLD_VERSION_NUMBER,
      },
      electronUpdaterCompatibility: ">=2.16",
      pacman: {
        depends: PACMAN_TEST_DEPENDS,
      },
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
      publish: {
        provider: "s3",
        bucket: "develar",
        path: "test",
      },
      fileOptions: {
        files: ["**/*", "../**/node_modules/**", "!path/**"],
        // electron-updater and builder-util-runtime are `link:`ed from this repository (see projectDirCreated below), so their files
        // and dependencies resolve into the repository, outside the temporary test workspace: allow exactly that tree
        allowExternalLinks: [path.resolve(__dirname, "../../..")],
      },
    },
    extraConfig
  )
  await assertPack(
    expect,
    "test-app",
    {
      targets: Platform.LINUX.createTarget(target, arch),
      config,
    },
    {
      storeDepsLockfileSnapshot: false,
      packageManager: PM.PNPM,
      packed: async (ctx: PackedContext) => {
        await verifyPacked?.(ctx)
        artifactsDir = await tmpDir.getTempDir({ prefix: "artifacts" })
        await move(ctx.outDir, artifactsDir)
      },
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
            const ebPackagePath = (pkg: string) => path.resolve(__dirname, "../../../packages", pkg)
            const updaterPath = ebPackagePath("electron-updater")
            const utilPath = ebPackagePath("builder-util-runtime")
            data.dependencies = {
              ...data.dependencies,
              sqlite3: "5.1.7",
              "@electron/remote": "2.1.3",
              "electron-updater": `link:${updaterPath}`,
              ...readJsonSync(path.join(updaterPath, "package.json")).dependencies,
              "builder-util-runtime": `link:${utilPath}`,
              ...readJsonSync(path.join(utilPath, "package.json")).dependencies,
            }
          },
          true
        )
      },
    }
  )

  if (!artifactsDir) {
    throw new Error("Build did not produce an artifacts directory")
  }

  let appPath: string

  if (target === "appImage") {
    const artifactPath = path.join(artifactsDir, "TestApp.AppImage")

    // Verify the compression header in the squashfs superblock matches the configured value
    const actualCompression = await readAppImageCompression(artifactPath)
    expect(actualCompression).toMatchSnapshot()

    appPath = artifactPath
  } else if (target === "deb") {
    const debPath = path.join(artifactsDir, "TestApp.deb")
    const actualCompression = await readDebCompression(debPath)
    expect(actualCompression).toMatchSnapshot()
    DebUpdater.installWithCommandRunner(
      "dpkg",
      debPath,
      commandWithArgs => {
        execSync(commandWithArgs.join(" "), { stdio: "inherit" })
      },
      console
    )
    appPath = "/opt/TestApp/TestApp"
  } else if (target === "rpm") {
    RpmUpdater.installWithCommandRunner(
      "zypper",
      path.join(artifactsDir, "TestApp.rpm"),
      commandWithArgs => {
        execSync(commandWithArgs.join(" "), { stdio: "inherit" })
      },
      console
    )
    appPath = "/opt/TestApp/TestApp"
  } else if (target === "pacman") {
    PacmanUpdater.installWithCommandRunner(
      path.join(artifactsDir, "TestApp.pacman"),
      commandWithArgs => {
        execSync(commandWithArgs.join(" "), { stdio: "inherit" })
      },
      console
    )
    appPath = "/opt/TestApp/TestApp"
  } else if (target === "flatpak") {
    appPath = installFlatpak(path.join(artifactsDir, "TestApp.flatpak"), APP_ID)
  } else {
    throw new Error(`Unsupported install test target: ${target}`)
  }

  // A dummy update config is required by launchAndWaitForQuit even when the updater is disabled.
  // AUTO_UPDATER_TEST="" makes the test app print its version and exit immediately.
  const updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: "http://localhost:0" })

  const appimageToolset = extraConfig.toolsets?.appimage
  // FUSE2 AppImages require /dev/fuse to mount their squashfs, which isn't available in standard
  // Docker containers. APPIMAGE_EXTRACT_AND_RUN=1 tells the legacy runtime to extract and run
  // without FUSE, avoiding the "Syntax error" shell-fallback failure.
  const isLegacyToolset = appimageToolset == null || appimageToolset === "0.0.0"
  const result = await launchAndWaitForQuit({
    appPath,
    timeoutMs: 2 * 60 * 1000,
    updateConfigPath,
    packageManagerToTest: "",
    env: {
      AUTO_UPDATER_TEST: "",
      ...(isLegacyToolset ? { APPIMAGE_EXTRACT_AND_RUN: "1" } : {}),
    },
    waitForExit: true,
  }).finally(() => {
    // the packages above are installed into a throwaway container; this one is in the user's flatpak installation
    if (target === "flatpak") {
      cleanupFlatpak(APP_ID)
    }
  })

  // flatpak has no compression option of its own
  const compression = target === "flatpak" ? config.compression : (config[target]?.compression ?? config.compression)
  log.info({ version: result.version, compression, target }, "Install test launch completed")
  if (result.version == null) {
    throw new Error("App did not report version after launch")
  }
  expect(result.version).toMatch(OLD_VERSION_NUMBER)
}
