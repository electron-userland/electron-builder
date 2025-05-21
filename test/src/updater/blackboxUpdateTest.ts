import { getBinFromUrl } from "app-builder-lib/out/binDownload"
import { GenericServerOptions, Nullish } from "builder-util-runtime"
import { doSpawn, getArchSuffix, TmpDir } from "builder-util/out/util"
import { Arch, Configuration, Platform } from "electron-builder"
import fs, { outputFile } from "fs-extra"
import path from "path"
import { describe, expect, ExpectStatic } from "vitest"
import { launchAndWaitForQuit } from "../helpers/launchAppCrossPlatform"
import { assertPack, modifyPackageJson, PackedContext } from "../helpers/packTester"
import { ELECTRON_VERSION } from "../helpers/testConfig"
import { NEW_VERSION_NUMBER, OLD_VERSION_NUMBER, writeUpdateConfig } from "../helpers/updaterTestUtil"

describe("Electron autoupdate from 1.0.0 to 1.0.1 (live test)", () => {
  // Signing is required for macOS autoupdate
  test.ifMac.ifEnv(process.env.CSC_KEY_PASSWORD)("mac", async () => {
    await runTest()
  })
  test.ifWindows("win", async () => {
    await runTest()
  })
  test.ifLinux("linux", async () => {
    await runTest()
  })
})

async function runTest() {
  const tmpDir = new TmpDir("auto-update")
  const outDirs: string[] = []

  const targetArch = process.arch === "arm64" ? Arch.arm64 : Arch.x64
  // 1. Build both versions
  await doBuild(expect, outDirs, Platform.current().createTarget(["zip"], targetArch), tmpDir, process.platform === "win32")

  const oldAppDir = outDirs[0]
  const newAppDir = outDirs[1]

  await runTestWithinServer(async (rootDirectory: string, updateConfigPath: string) => {
    // Move app update to the root directory of the server
    await fs.copy(newAppDir, rootDirectory, { recursive: true, overwrite: true })

    const appPath = getAppPath(oldAppDir, targetArch)
    const verifyAppVersion = async (expectedVersion: string) => await launchAndWaitForQuit({ appPath, updateConfigPath, expectedVersion })

    console.log("Old version", await verifyAppVersion(OLD_VERSION_NUMBER))

    // Wait for quitAndInstall to take effect, increase delay if updates are slower (shouldn't be the case for such a small test app)
    const delay = 10 * 1000
    await new Promise(resolve => setTimeout(resolve, delay))

    console.log("New version", await verifyAppVersion(NEW_VERSION_NUMBER))
  })
  await tmpDir.cleanup()
}

async function doBuild(
  expect: ExpectStatic,
  outDirs: Array<string>,
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
      const newDir = await tmpDir.getTempDir({ prefix: version })
      await fs.move(context.outDir, newDir)
      outDirs.push(newDir)
    })
  try {
    await build(OLD_VERSION_NUMBER)
    await build(NEW_VERSION_NUMBER)
  } catch (e: any) {
    await tmpDir.cleanup()
    throw e
  }
}

const getAppPath = (dir: string, arch: Arch) => {
  if (process.platform === "darwin") {
    return path.join(dir, `mac${getArchSuffix(arch)}`, `TestApp.app`)
  }
  if (process.platform === "linux") {
    return path.join(dir, `linux${getArchSuffix(arch)}-unpacked`, `TestApp`)
  }
  if (process.platform === "win32") {
    return path.join(dir, `win${getArchSuffix(arch)}-unpacked`, `TestApp.exe`)
  }
  throw new Error(`Unsupported platform: ${process.platform}`)
}

async function runTestWithinServer(doTest: (rootDirectory: string, updateConfigPath: string) => Promise<void>) {
  const tmpDir = new TmpDir("blackbox-update-test")
  const root = await tmpDir.getTempDir({ prefix: "root" })

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
  }).then(
    v => {
      httpServerProcess.kill()
      return v
    },
    e => {
      httpServerProcess.kill()
      throw e
    }
  )
}
