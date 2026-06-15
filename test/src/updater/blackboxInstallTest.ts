import { AppImageOptions, Configuration, DebOptions, PacmanOptions, RpmOptions, Target, ToolsetConfig } from "app-builder-lib"
import { PM } from "app-builder-lib/internal"
import { Arch, Platform } from "electron-builder"
import { DebUpdater, PacmanUpdater, RpmUpdater } from "electron-updater"
import { archFromString, log, spawn } from "builder-util"
import { deepAssign, GenericServerOptions } from "builder-util-runtime"
import { execSync } from "child_process"
import { move, outputFile, readJsonSync } from "fs-extra"
import path from "path"
import { TestContext, TestOptions } from "vitest"
import { launchAndWaitForQuit } from "../helpers/launchAppCrossPlatform"
import { assertPack, EXTENDED_TIMEOUT, modifyPackageJson, PackedContext, readDebCompression } from "../helpers/packTester"
import { readAppImageCompression } from "../helpers/fileAssert"
import { ELECTRON_VERSION } from "../helpers/testConfig"
import { OLD_VERSION_NUMBER, writeUpdateConfig } from "../helpers/updaterTestUtil"

const optionsForInstall: TestOptions = { sequential: true, retry: 0, timeout: EXTENDED_TIMEOUT }

const STANDARD_COMPRESSIONS: Configuration["compression"][] = ["store", "normal", "maximum"]
const APPIMAGE_COMPRESSIONS: AppImageOptions["compression"][] = ["xz", "gzip", "zstd"]
const LEGACY_COMPRESSIONS: AppImageOptions["compression"][] = ["xz", "gzip", "zstd"]
// xz/lzo = forwarded as --compression to FUSE2; zstd/null = flag omitted → mksquashfs defaults to gzip (or xz when compression="maximum")

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
        for (const appimage of ["1.0.2", "1.0.3"] as ToolsetConfig["appimage"][]) {
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
})

async function runInstallTest(context: TestContext, target: ConstructorParameters<typeof Target>[0], arch: Arch, extraConfig: Configuration): Promise<void> {
  const { expect, tmpDir } = context

  let artifactsDir: string | undefined

  const config = deepAssign<Configuration>(
    {
      nativeModules: { npmRebuild: true },
      productName: "TestApp",
      executableName: "TestApp",
      appId: "com.test.app",
      artifactName: "${productName}.${ext}",
      electronLanguages: ["en"],
      extraMetadata: {
        name: "testapp",
        version: OLD_VERSION_NUMBER,
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
      publish: {
        provider: "s3",
        bucket: "develar",
        path: "test",
      },
      files: ["**/*", "../**/node_modules/**", "!path/**"],
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
        artifactsDir = await tmpDir.getTempDir({ prefix: "artifacts" })
        await move(ctx.outDir, artifactsDir)
      },
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
          await spawn("pnpm", ["install", "--config.node-linker=hoisted"], { cwd: path.join(projectDir, "app"), env: runtimeEnv })
        }
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
  } else {
    throw new Error(`Unsupported install test target: ${target}`)
  }

  // A dummy update config is required by launchAndWaitForQuit even when the updater is disabled.
  // AUTO_UPDATER_TEST="" makes the test app print its version and exit immediately.
  const updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: "http://localhost:0" })

  const appimageToolset = (extraConfig as any).toolsets?.appimage
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
  })

  log.info({ version: result.version, compression: config[target]?.compression ?? config.compression, target }, "Install test launch completed")
  if (result.version == null) {
    throw new Error("App did not report version after launch")
  }
  expect(result.version).toMatch(OLD_VERSION_NUMBER)
}
