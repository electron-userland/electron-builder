import { getBinFromUrl } from "app-builder-lib/out/binDownload"
import { GenericServerOptions, Nullish } from "builder-util-runtime"
import { archFromString, doSpawn, getArchSuffix, log, TmpDir } from "builder-util/out/util"
import { Arch, Configuration, Platform } from "electron-builder"
import fs, { existsSync, outputFile } from "fs-extra"
import path from "path"
import { afterAll, beforeAll, describe, expect, ExpectStatic } from "vitest"
import { launchAndWaitForQuit } from "../helpers/launchAppCrossPlatform"
import { assertPack, modifyPackageJson, PackedContext } from "../helpers/packTester"
import { ELECTRON_VERSION } from "../helpers/testConfig"
import { NEW_VERSION_NUMBER, OLD_VERSION_NUMBER, writeUpdateConfig } from "../helpers/updaterTestUtil"
import { execFileSync, execSync, spawn } from "child_process"

// Linux Tests MUST be run in docker containers for proper ephemeral testing environment (e.g. fresh install + update + relaunch)
// Currently this test logic does not handle uninstalling packages (yet)
describe("Electron autoupdate from 1.0.0 to 1.0.1 (live test)", () => {
  const debug = process.env.DEBUG
  beforeAll(() => {
    // Set the environment variable to enable auto-update testing
    process.env.AUTO_UPDATER_TEST = "1"
    process.env.DEBUG = "electron-builder"
  })
  afterAll(() => {
    // Clean up the environment variable after the tests
    delete process.env.AUTO_UPDATER_TEST
    process.env.DEBUG = debug
  })

  // Signing is required for macOS autoupdate
  test.ifMac.ifEnv(process.env.CSC_KEY_PASSWORD)("mac", async () => {
    await runTest("zip")
  })

  test.ifWindows("win", async () => {
    await runTest("nsis")
  })

  // must be sequential in order for process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER to be respected per-test
  describe.runIf(process.platform === "linux")("linux", { sequential: true }, () => {
    test.ifEnv(process.env.RUN_APP_IMAGE_TEST && process.arch === "arm64")("AppImage arm64", async () => {
      await runTest("AppImage", Arch.arm64)
    })

    // only works on x64, so this will fail on arm64 macs due to arch mismatch
    test.ifEnv(process.env.RUN_APP_IMAGE_TEST && process.arch === "x64")("AppImage x64", async () => {
      await runTest("AppImage", Arch.x64)
    })

    // package manager tests specific to each distro (and corresponding docker image)
    for (const distro in packageManagerMap) {
      const { pms, target } = packageManagerMap[distro as keyof typeof packageManagerMap]
      for (const pm of pms) {
        test(`${distro} - (${pm}) download and install`, async context => {
          if (!determineEnvironment(distro)) {
            context.skip()
          }
          process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER = pm
          await runTest(target, Arch.x64)
          delete process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER
        })
      }
    }
  })
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

async function runTest(target: string, arch: Arch = Arch.x64) {
  const tmpDir = new TmpDir("auto-update")
  const outDirs: ApplicationUpdatePaths[] = []
  // 1. Build both versions
  await doBuild(expect, outDirs, Platform.current().createTarget([target], arch), tmpDir, process.platform === "win32")

  const oldAppDir = outDirs[0]
  const newAppDir = outDirs[1]

  const dirPath = oldAppDir.dir
  let appPath: string

  // Setup tests by installing the previous version
  if (target === "AppImage") {
    appPath = path.join(dirPath, `TestApp.AppImage`)
  } else if (target === "deb") {
    appPath = path.join(dirPath, `TestApp.deb`)
    execSync(`sudo dpkg -i "${appPath}"`, { stdio: "inherit" })
  } else if (target === "rpm") {
    appPath = path.join(dirPath, `TestApp.rpm`)
    execSync(`sudo rpm -i --nosignature "${appPath}"`, { stdio: "inherit" })
  } else if (process.platform === "win32") {
    // /S = silent install
    execFileSync(path.join(dirPath, "TestApp.exe"), ['/S'], { stdio: 'inherit' })
    // access installed app's location
    appPath = path.join(process.env['ProgramFiles']!, 'TestApp', "TestApp.exe")
    if (!existsSync(appPath)) {
      throw new Error(`Installed app not found: ${appPath}`)
    }
  } else if (process.platform === "darwin") {
    appPath = path.join(dirPath, `mac${getArchSuffix(arch)}`, `TestApp.app`, "Contents", "MacOS", "TestApp")
  } else {
    throw new Error(`Unsupported target: ${target}`)
  }

  await runTestWithinServer(async (rootDirectory: string, updateConfigPath: string) => {
    // Move app update to the root directory of the server
    await fs.copy(newAppDir.dir, rootDirectory, { recursive: true, overwrite: true })

    const verifyAppVersion = async (expectedVersion: string) => await launchAndWaitForQuit({ appPath, timeoutMs: 15 * 60 * 1000, updateConfigPath, expectedVersion })

    const result = await verifyAppVersion(OLD_VERSION_NUMBER)
    log.debug(result, "Test App version")
    expect(result.version).toMatch(OLD_VERSION_NUMBER)

    // Wait for quitAndInstall to take effect, increase delay if updates are slower (shouldn't be the case for such a small test app)
    const delay = 60 * 1000
    await new Promise(resolve => setTimeout(resolve, delay))

    expect((await verifyAppVersion(NEW_VERSION_NUMBER)).version).toMatch(NEW_VERSION_NUMBER)
  }).finally(async () => {
    // windows needs to release file locks, so a delay seems to be needed
    await new Promise(resolve => setTimeout(resolve, 1000))
    await tmpDir.cleanup()
  })
}

type ApplicationUpdatePaths = {
  dir: string
  appPath: string
}

async function doBuild(
  expect: ExpectStatic,
  outDirs: Array<ApplicationUpdatePaths>,
  targets: Map<Platform, Map<Arch, Array<string>>>,
  tmpDir: TmpDir,
  isWindows: boolean,
  extraConfig?: Configuration | null
) {
  async function buildApp(
    version: string,
    targets: Map<Platform, Map<Arch, Array<string>>>,
    extraConfig: Configuration | Nullish,
    packed: (context: PackedContext) => Promise<any>
  ) {
    await assertPack(
      expect,
      "test-app",
      {
        targets,
        config: {
          artifactName: "${name}.${ext}",
          asar: false, // not necessarily needed, just easier debugging tbh
          electronLanguages: ["en"],
          extraMetadata: {
            version,
          },
          ...extraConfig,
          compression: "store",
          publish: {
            provider: "s3",
            bucket: "develar",
            path: "test",
          },
          files: ["**/*", "node_modules/**", "!path/**"],
          nsis: {
            oneClick: true,
            // perMachine: true,
          },
        },
      },
      {
        isInstallDepsBefore: true,
        storeDepsLockfileSnapshot: false,
        signed: true,
        signedWin: isWindows,
        packed,
        projectDirCreated: projectDir =>
          Promise.all([
            outputFile(path.join(projectDir, ".npmrc"), "node-linker=hoisted"),
            // outputFile(path.join(projectDir, "pnpm-lock.yaml"), ""),
            // outputFile(path.join(projectDir, "app", "pnpm-lock.yaml"), ""),
            modifyPackageJson(
              projectDir,
              data => {
                data.devDependencies = {
                  electron: ELECTRON_VERSION,
                }
                data.dependencies = {
                  "electron-updater": `file:${__dirname}/../../../packages/electron-updater`,
                }
                data.pnpm = {
                  overrides: {
                    "builder-util-runtime": `file:${__dirname}/../../../packages/builder-util-runtime`,
                  },
                }
              },
              true
            ),
            modifyPackageJson(
              projectDir,
              data => {
                data.devDependencies = {
                  electron: ELECTRON_VERSION,
                }
                data.dependencies = {
                  "electron-updater": `file:${__dirname}/../../../packages/electron-updater`,
                }
                data.pnpm = {
                  overrides: {
                    "builder-util-runtime": `file:${__dirname}/../../../packages/builder-util-runtime`,
                  },
                }
              },
              false
            ),
          ]),
      }
    )
  }

  const build = (version: string) =>
    buildApp(version, targets, extraConfig, async context => {
      // move dist temporarily out of project dir so each downloader can reference it
      const dir = await tmpDir.getTempDir({ prefix: version })
      await fs.move(context.outDir, dir)
      const appPath = path.join(dir, path.relative(context.outDir, context.getAppPath(Platform.current(), archFromString(process.arch))))
      outDirs.push({ dir, appPath })
    })
  try {
    await build(OLD_VERSION_NUMBER)
    await build(NEW_VERSION_NUMBER)
  } catch (e: any) {
    await tmpDir.cleanup()
    throw e
  }
}

async function runTestWithinServer(doTest: (rootDirectory: string, updateConfigPath: string) => Promise<void>) {
  const tmpDir = new TmpDir("blackbox-update-test")
  const root = await tmpDir.getTempDir({ prefix: "root" })

  // 65535 is the max port number
  // Math.random() / Math.random() is used to avoid zero
  // Math.floor(((Math.random() / Math.random()) * 1000) % 65535) is used to avoid port number collision
  const port = 8000 + Math.floor(((Math.random() / Math.random()) * 1000) % 65535)
  const serverBin = await getBinFromUrl("ran", "0.1.3", "imfA3LtT6umMM0BuQ29MgO3CJ9uleN5zRBi3sXzcTbMOeYZ6SQeN7eKr3kXZikKnVOIwbH+DDO43wkiR/qTdkg==")
  const httpServerProcess = doSpawn(path.join(serverBin, process.platform, "ran"), [`-root=${root}`, `-port=${port}`, "-gzip=false", "-listdir=true"])

  const updateConfig = await writeUpdateConfig<GenericServerOptions>({
    provider: "generic",
    url: `http://127.0.0.1:${port}`,
  })

  return await new Promise<void>((resolve, reject) => {
    httpServerProcess.on("error", reject)
    doTest(root, updateConfig).then(resolve).catch(reject)
  })
    .then(
      v => {
        httpServerProcess.kill()
        return v
      },
      e => {
        httpServerProcess.kill()
        throw e
      }
    )
    .finally(() => {
      tmpDir.cleanupSync()
    })
}
