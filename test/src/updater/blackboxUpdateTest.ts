import { getBinFromUrl } from "app-builder-lib/out/binDownload"
import { GenericServerOptions, Nullish } from "builder-util-runtime"
import { archFromString, doSpawn, getArchSuffix, TmpDir } from "builder-util/out/util"
import { Arch, Configuration, Platform } from "electron-builder"
import fs, { outputFile } from "fs-extra"
import path from "path"
import { afterAll, beforeAll, describe, expect, ExpectStatic } from "vitest"
import { launchAndWaitForQuit } from "../helpers/launchAppCrossPlatform"
import { assertPack, modifyPackageJson, PackedContext } from "../helpers/packTester"
import { ELECTRON_VERSION } from "../helpers/testConfig"
import { NEW_VERSION_NUMBER, OLD_VERSION_NUMBER, writeUpdateConfig } from "../helpers/updaterTestUtil"
import { execSync } from "child_process"

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
  describe("linux", () => {
    test("deb", async () => {
      await runTest("deb")
    })
    test("rpm", async () => {
      await runTest("rpm")
    })
    // docker image is x64, so this won't run on arm64 macs
    test.ifEnv(process.arch === "x64")("linux", async () => {
      await runTest("AppImage", Arch.x64)
    })
  })
})

async function runTest(target: string, arch: Arch = Arch.x64) {
  const tmpDir = new TmpDir("auto-update")
  const outDirs: ApplicationUpdatePaths[] = []
  // 1. Build both versions
  await doBuild(expect, outDirs, Platform.current().createTarget([target], arch), tmpDir, process.platform === "win32")

  const oldAppDir = outDirs[0]
  const newAppDir = outDirs[1]

  const dirPath = oldAppDir.dir
  let appPath = oldAppDir.appPath
  // const appPath = oldAppDir.appPath
  // fs.readdir(dirPath, (err, files) => {
  //   if (err) {
  //     console.error("Error reading directory:", err)
  //     return
  //   }

  //   console.log(`Contents of ${dirPath}:`)
  //   files.forEach(file => {
  //     console.log(file)
  //   })
  // })
  if (target === "AppImage") {
    execSync(`apt-get update -yqq && apt-get install -yq file xvfb libatk1.0-0 libatk-bridge2.0-0`, { stdio: "inherit" })
    appPath = path.join(dirPath, `TestApp-${OLD_VERSION_NUMBER}${getArchSuffix(arch)}.AppImage`)
  } else if (target === "deb") {
    appPath = path.join(dirPath, `TestApp-${OLD_VERSION_NUMBER}${getArchSuffix(arch)}.deb`)
    execSync(`sudo dpkg -i "${appPath}"`, { stdio: "inherit" })
  } else if (target === "rpm") {
    appPath = path.join(dirPath, `TestApp-${OLD_VERSION_NUMBER}${getArchSuffix(arch)}.rpm`)
    execSync(`sudo rpm -i --nosignature "${appPath}"`, { stdio: "inherit" })
  } else if (process.platform === "win32") {
    appPath = path.join(dirPath, "win-unpacked", `TestApp.exe`)
    // } else if (process.platform === "darwin") {
    //   appPath = path.join(dirPath, `TestApp-${OLD_VERSION_NUMBER}${getArchSuffix(arch)}.zip`)
  }

  await runTestWithinServer(async (rootDirectory: string, updateConfigPath: string) => {
    // Move app update to the root directory of the server
    await fs.copy(newAppDir.dir, rootDirectory, { recursive: true, overwrite: true })

    const verifyAppVersion = async (expectedVersion: string) => await launchAndWaitForQuit({ appPath, timeoutMs: 5 * 60 * 1000, updateConfigPath, expectedVersion })

    const result = await verifyAppVersion(OLD_VERSION_NUMBER)
    console.log("App version:", result)
    expect(result.version).toMatch(OLD_VERSION_NUMBER)

    // Wait for quitAndInstall to take effect, increase delay if updates are slower (shouldn't be the case for such a small test app)
    const delay = 10 * 1000
    await new Promise(resolve => setTimeout(resolve, delay))

    expect((await verifyAppVersion(NEW_VERSION_NUMBER)).version).toMatch(NEW_VERSION_NUMBER)
  })
  await tmpDir.cleanup()
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
          asar: false,
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
          appImage: {
            // systemIntegration: false,
          },
          nsis: {
            oneClick: true,
            perMachine: false,
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
