import { describe, it, expect, ExpectStatic } from "vitest"
import { ChildProcessWithoutNullStreams, spawn } from "child_process"
import path from "path"
import { Platform, Arch, Configuration } from "electron-builder"
import fs, { outputJson } from "fs-extra"
import { NEW_VERSION_NUMBER, OLD_VERSION_NUMBER } from "../helpers/updaterTestUtil"
import { getBinFromUrl } from "app-builder-lib/out/binDownload"
import { GenericServerOptions, Nullish } from "builder-util-runtime"
import { doSpawn, getArchSuffix, TmpDir } from "builder-util/out/util"
import { writeUpdateConfig } from "../helpers/updaterTestUtil"
import { PackedContext, assertPack, modifyPackageJson } from "../helpers/packTester"
import { ELECTRON_VERSION } from "../helpers/testConfig"
import { fileURLToPath } from "url"

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
        },
      },
      {
        isInstallDepsBefore: true,
        signed: true,
        signedWin: isWindows,
        packed,
        projectDirCreated: projectDir =>
          Promise.all([
            modifyPackageJson(projectDir, data => {
              data.devDependencies = {
                ...(data.devDependencies || {}),
                electron: ELECTRON_VERSION,
              }
              data.dependencies = {
                ...(data.devDependencies || {}),
                "electron-updater": `file:${__dirname}/../../../packages/electron-updater/out`,
                "builder-util-runtime": `file:${__dirname}/../../../packages/builder-util-runtime/out`,
              }
            }),
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

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function launchAppAndGetVersion(executablePath: string, updateConfigPath?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = doSpawn(executablePath, [], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        AUTO_UPDATER_TEST: "1",
        AUTO_UPDATER_TEST_CONFIG_PATH: updateConfigPath,
      },
    }) as ChildProcessWithoutNullStreams

    let stdout = ""

    child.stdout.on("data", data => {
      const str = data.toString()
      stdout += str

      const match = str.match(/APP_VERSION:\s*(\d+\.\d+\.\d+)/)
      if (match) {
        resolve(match[1])
        child.kill()
      }
    })

    child.stderr.on("data", data => {
      console.error("stderr:", data.toString())
    })

    child.on("exit", code => {
      if (!stdout.includes("APP_VERSION")) {
        reject(new Error("App exited without logging version."))
      }
    })

    setTimeout(() => reject(new Error("Timeout: App did not log version")), 15000)
  })
}

describe("Electron autoupdate from 1.0.0 to 1.0.1 (live test)", () => {
  test.ifEnv(process.env.CSC_KEY_PASSWORD && process.platform === "darwin")("mac", async () => {
    const tmpDir = new TmpDir("windows-auto-update")
    const outDirs: string[] = []

    // 1. Build both versions
    await doBuild(expect, outDirs, Platform.current().createTarget(["zip"], Arch.x64), tmpDir, process.platform === "win32")

    const oldAppDir = outDirs[0]
    const newAppDir = outDirs[1]

    console.error("Old app dir:", oldAppDir)
    console.error("New app dir:", newAppDir)
    const app = (dir: string, version: string) => path.join(dir, "mac", `TestApp.app`, "Contents", "MacOS", "TestApp")

    await runTestWithinServer(async (rootDirectory: string, updateConfigPath: string) => {
      // Move app update to the root directory of the server
      await fs.copy(newAppDir, rootDirectory, { recursive: true, overwrite: true })

      const oldExePath = app(oldAppDir, OLD_VERSION_NUMBER)
      const versionBefore = await launchAppAndGetVersion(oldExePath, updateConfigPath)
      expect(versionBefore).toBe(OLD_VERSION_NUMBER)

      // Wait for quitAndInstall to take effect
      await wait(8000) // increase if updates are slower

      // Relaunch app and verify new version
      const versionAfter = await launchAppAndGetVersion(oldExePath, undefined)
      expect(versionAfter).toBe(NEW_VERSION_NUMBER)
    })
  })
})

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
