import { Arch, Configuration, Platform } from "app-builder-lib"
import { getBinFromUrl } from "app-builder-lib/out/binDownload"
import { doSpawn } from "builder-util"
import { GenericServerOptions, S3Options } from "builder-util-runtime"
import { AppImageUpdater, MacUpdater, NsisUpdater } from "electron-updater"
import { EventEmitter } from "events"
import { move } from "fs-extra"
import * as path from "path"
import { TmpDir } from "temp-file"
import { TestAppAdapter } from "../helpers/TestAppAdapter"
import { nsisDifferentialUpdateFakeSnapshot, nsisWebDifferentialUpdateTestFakeSnapshot } from "../helpers/differentialUpdateTestSnapshotData"
import { PackedContext, assertPack, removeUnstableProperties } from "../helpers/packTester"
import { tuneTestUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil"
import { exec } from "child_process"

/*

rm -rf ~/Documents/onshape-desktop-shell/node_modules/electron-updater && cp -R ~/Documents/electron-builder/packages/electron-updater ~/Documents/onshape-desktop-shell/node_modules/electron-updater && rm -rf ~/Documents/onshape-desktop-shell/node_modules/electron-updater/src && rm -rf ~/Documents/onshape-desktop-shell/node_modules/builder-util-runtime && cp -R ~/Documents/electron-builder/packages/builder-util-runtime ~/Documents/onshape-desktop-shell/node_modules/builder-util-runtime && rm -rf ~/Documents/onshape-desktop-shell/node_modules/builder-util-runtime/src

*/
// %USERPROFILE%\AppData\Roaming\Onshape

// mkdir -p ~/minio-data/onshape
// minio server ~/minio-data

const OLD_VERSION_NUMBER = "1.0.0"

const testAppCacheDirName = "testapp-updater"

test.ifWindows("web installer", async () => {
  let outDirs: Array<string> = []

  async function buildApp(version: string, tmpDir: TmpDir) {
    await assertPack(
      "test-app-one",
      {
        targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
        config: {
          extraMetadata: {
            version,
          },
          // package in any case compressed, customization is explicitly disabled - "do not allow to change compression level to avoid different packages"
          compression: (process.env.COMPRESSION as any) || "store",
          publish: {
            provider: "s3",
            bucket: "develar",
            path: "test",
          },
        },
      },
      {
        signedWin: true,
        packed: context => {
          outDirs.push(context.outDir)
          return Promise.resolve()
        },
        tmpDir,
      }
    )
  }

  if (process.env.__SKIP_BUILD == null) {
    const tmpDir = new TmpDir("differential-updater-test")
    try {
      await buildApp(OLD_VERSION_NUMBER, tmpDir)
      // move dist temporarily out of project dir
      const oldDir = await tmpDir.getTempDir()
      await move(outDirs[0], oldDir)
      outDirs[0] = oldDir

      await buildApp("1.0.1", tmpDir)
    } catch (e: any) {
      // await tmpDir.cleanup()
      throw e
    }

    // move old dist to new project as oldDist - simplify development (no need to guess where old dist located in the temp fs)
    const oldDir = path.join(outDirs[1], "..", "oldDist")
    await move(outDirs[0], oldDir)
    outDirs[0] = oldDir

    await move(path.join(oldDir, "nsis-web", `TestApp-${OLD_VERSION_NUMBER}-x64.nsis.7z`), path.join(getTestUpdaterCacheDir(oldDir), testAppCacheDirName, "package.7z"))
  } else {
    nsisWebDifferentialUpdateTestFakeSnapshot()
    outDirs = [path.join(process.env.TEST_APP_TMP_DIR!, "oldDist"), path.join(process.env.TEST_APP_TMP_DIR!, "dist")]
  }

  await testBlockMap(outDirs[0], path.join(outDirs[1], "nsis-web"), NsisUpdater, "win-unpacked", Platform.WINDOWS)
})

test.ifWindows("nsis", async () => {
  let outDirs: Array<string> = []

  async function buildApp(version: string) {
    await assertPack(
      "test-app-one",
      {
        targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
        config: {
          extraMetadata: {
            version,
          },
          // package in any case compressed, customization is explicitly disabled - "do not allow to change compression level to avoid different packages"
          compression: (process.env.COMPRESSION as any) || "store",
          publish: {
            provider: "s3",
            bucket: "develar",
            path: "test",
          },
        },
      },
      {
        signedWin: true,
        packed: context => {
          outDirs.push(context.outDir)
          return Promise.resolve()
        },
      }
    )
  }

  if (process.env.__SKIP_BUILD == null) {
    await buildApp(OLD_VERSION_NUMBER)

    const tmpDir = new TmpDir("differential-updater-test")
    try {
      // move dist temporarily out of project dir
      const oldDir = await tmpDir.getTempDir()
      await move(outDirs[0], oldDir)
      outDirs[0] = oldDir

      await buildApp("1.0.1")
    } catch (e: any) {
      // await tmpDir.cleanup()
      throw e
    }

    // move old dist to new project as oldDist - simplify development (no need to guess where old dist located in the temp fs)
    const oldDir = path.join(outDirs[1], "..", "oldDist")
    await move(outDirs[0], oldDir)
    outDirs[0] = oldDir

    await move(path.join(oldDir, `Test App ßW Setup ${OLD_VERSION_NUMBER}.exe`), path.join(getTestUpdaterCacheDir(oldDir), testAppCacheDirName, "installer.exe"))
    await move(path.join(oldDir, "Test App ßW Setup 1.0.0.exe.blockmap"), path.join(outDirs[1], "Test App ßW Setup 1.0.0.exe.blockmap"))
  } else {
    nsisDifferentialUpdateFakeSnapshot()

    outDirs = [path.join(process.env.TEST_APP_TMP_DIR!, "oldDist"), path.join(process.env.TEST_APP_TMP_DIR!, "dist")]
  }

  await testBlockMap(outDirs[0], outDirs[1], NsisUpdater, "win-unpacked", Platform.WINDOWS)
})

async function testLinux(arch: Arch) {
  process.env.TEST_UPDATER_ARCH = Arch[arch]

  const outDirs: Array<string> = []
  const tmpDir = new TmpDir("differential-updater-test")
  try {
    await doBuild(outDirs, Platform.LINUX.createTarget(["appimage"], arch), tmpDir)
    exec("open -a '/Applications/Sublime Text.app' " + path.resolve(outDirs[0], ".."))

    process.env.APPIMAGE = path.join(outDirs[0], `Test App ßW-${OLD_VERSION_NUMBER}${arch === Arch.ia32 ? "-i386" : ""}.AppImage`)
    await testBlockMap(outDirs[0], outDirs[1], AppImageUpdater, `linux-${arch === Arch.ia32 ? "ia32-" : ""}unpacked`, Platform.LINUX)
  } finally {
    await tmpDir.cleanup()
  }
}

test.ifDevOrLinuxCi("AppImage", () => testLinux(Arch.x64))

test.ifDevOrLinuxCi("AppImage ia32", () => testLinux(Arch.ia32))

// ifAll.ifMac.ifNotCi todo
test.skip("dmg", async () => {
  const outDirs: Array<string> = []
  const tmpDir = new TmpDir("differential-updater-test")
  if (process.env.__SKIP_BUILD == null) {
    await doBuild(outDirs, Platform.MAC.createTarget(undefined, Arch.x64), tmpDir, {
      mac: {
        electronUpdaterCompatibility: ">=2.17.0",
      },
    })
  } else {
    // todo
  }

  await testBlockMap(outDirs[0], path.join(outDirs[1]), MacUpdater, "mac/Test App ßW.app", Platform.MAC)
})

async function buildApp(
  version: string,
  outDirs: Array<string>,
  targets: Map<Platform, Map<Arch, Array<string>>>,
  extraConfig: Configuration | null | undefined,
  packed: (context: PackedContext) => Promise<any>
) {
  await assertPack(
    "test-app-one",
    {
      targets,
      config: {
        extraMetadata: {
          version,
        },
        ...extraConfig,
        compression: "normal",
        publish: {
          provider: "s3",
          bucket: "develar",
          path: "test",
        },
      },
    },
    {
      packed,
      // packed: context => {
      //   log.error(context, 'packed')
      //   outDirs.push(context.outDir)
      //   return Promise.resolve()
      // },
      // tmpDir,
    }
  )
}

async function doBuild(outDirs: Array<string>, targets: Map<Platform, Map<Arch, Array<string>>>, tmpDir: TmpDir, extraConfig?: Configuration | null) {
  const build = (version: string) =>
    buildApp(version, outDirs, targets, extraConfig, async context => {
      // move dist temporarily out of project dir so each downloader can reference it
      const newDir = await tmpDir.getTempDir({ prefix: version })
      await move(context.outDir, newDir)
      outDirs.push(newDir)
    })
  try {
    await build(OLD_VERSION_NUMBER)
    await build("1.0.1")
    console.warn("test", outDirs)
  } catch (e: any) {
    await tmpDir.cleanup()
    throw e
  }
}

async function checkResult(updater: NsisUpdater) {
  const updateCheckResult = await updater.checkForUpdates()
  const downloadPromise = updateCheckResult?.downloadPromise
  // noinspection JSIgnoredPromiseFromCall
  expect(downloadPromise).not.toBeNull()
  const files = await downloadPromise
  const fileInfo: any = updateCheckResult?.updateInfo.files[0]

  // because port is random
  expect(fileInfo.url).toBeDefined()
  delete fileInfo.url
  expect(removeUnstableProperties(updateCheckResult?.updateInfo)).toMatchSnapshot()
  expect(files!.map(it => path.basename(it))).toMatchSnapshot()
}

class TestNativeUpdater extends EventEmitter {
  // private updateUrl: string | null = null

  // noinspection JSMethodCanBeStatic
  checkForUpdates() {
    console.log("TestNativeUpdater.checkForUpdates")
    // MacUpdater expects this to emit corresponding update-downloaded event
    this.emit("update-downloaded")
    // this.download()
    //   .catch(error => {
    //     this.emit("error", error)
    //   })
  }

  // private async download() {
  // }

  // noinspection JSMethodCanBeStatic
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setFeedURL(_updateUrl: string) {
    // console.log("TestNativeUpdater.setFeedURL " + updateUrl)
    // this.updateUrl = updateUrl
  }
}

function getTestUpdaterCacheDir(oldDir: string) {
  return path.join(oldDir, "updater-cache")
}

async function testBlockMap(oldDir: string, newDir: string, updaterClass: any, appUpdateConfigPath: string, platform: Platform) {
  // log.error({ oldDir, newDir, appUpdateConfigPath }, "testBlockMap")
  const port = 8000 + (updaterClass.name.charCodeAt(0) as number) + Math.floor(Math.random() * 10000)

  // noinspection SpellCheckingInspection
  const httpServerProcess = doSpawn(
    path.join(await getBinFromUrl("ran", "0.1.3", "imfA3LtT6umMM0BuQ29MgO3CJ9uleN5zRBi3sXzcTbMOeYZ6SQeN7eKr3kXZikKnVOIwbH+DDO43wkiR/qTdkg=="), process.platform, "ran"),
    [`-root=${newDir}`, `-port=${port}`, "-gzip=false", "-listdir=true"]
  )
  const mockNativeUpdater = new TestNativeUpdater()
  jest.mock(
    "electron",
    () => {
      return {
        autoUpdater: mockNativeUpdater,
      }
    },
    { virtual: true }
  )

  return await new Promise((resolve, reject) => {
    httpServerProcess.on("error", reject)

    const updater = new updaterClass(null, new TestAppAdapter(OLD_VERSION_NUMBER, getTestUpdaterCacheDir(oldDir)))
    updater._appUpdateConfigPath = path.join(
      oldDir,
      updaterClass === MacUpdater ? `${appUpdateConfigPath}/Contents/Resources` : `${appUpdateConfigPath}/resources`,
      "app-update.yml"
    )
    const doTest = async () => {
      tuneTestUpdater(updater, {
        platform: platform.nodeName as any,
        isUseDifferentialDownload: true,
      })
      updater.logger = console

      const currentUpdaterCacheDirName = (await updater.configOnDisk.value).updaterCacheDirName
      console.warn("currentUpdaterCacheDirName", currentUpdaterCacheDirName)
      if (currentUpdaterCacheDirName == null) {
        throw new Error(`currentUpdaterCacheDirName must be not null, appUpdateConfigPath: ${updater._appUpdateConfigPath}`)
      }

      updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions | S3Options>({
        provider: "generic",
        updaterCacheDirName: currentUpdaterCacheDirName,
        url: `http://127.0.0.1:${port}`,
      })

      await checkResult(updater)
    }

    doTest()
      .then(() => resolve(null))
      .catch(reject)
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
