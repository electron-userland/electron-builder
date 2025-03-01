import { Arch, Configuration, Platform } from "app-builder-lib"
import { getBinFromUrl } from "app-builder-lib/out/binDownload"
import { doSpawn, getArchSuffix } from "builder-util"
import { GenericServerOptions, Nullish, S3Options } from "builder-util-runtime"
import { AppImageUpdater, BaseUpdater, MacUpdater, NoOpLogger, NsisUpdater } from "electron-updater"
import { EventEmitter } from "events"
import { move } from "fs-extra"
import * as path from "path"
import { TmpDir } from "temp-file"
import { TestAppAdapter } from "../helpers/TestAppAdapter"
import { PackedContext, assertPack, removeUnstableProperties } from "../helpers/packTester"
import { tuneTestUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil"
import { mockForNodeRequire } from "vitest-mock-commonjs"
import { ExpectStatic } from "vitest"

/*

rm -rf ~/Documents/onshape-desktop-shell/node_modules/electron-updater && cp -R ~/Documents/electron-builder/packages/electron-updater ~/Documents/onshape-desktop-shell/node_modules/electron-updater && rm -rf ~/Documents/onshape-desktop-shell/node_modules/electron-updater/src && rm -rf ~/Documents/onshape-desktop-shell/node_modules/builder-util-runtime && cp -R ~/Documents/electron-builder/packages/builder-util-runtime ~/Documents/onshape-desktop-shell/node_modules/builder-util-runtime && rm -rf ~/Documents/onshape-desktop-shell/node_modules/builder-util-runtime/src

*/
// %USERPROFILE%\AppData\Roaming\Onshape

// mkdir -p ~/minio-data/onshape
// minio server ~/minio-data

const OLD_VERSION_NUMBER = "1.0.0"

const testAppCacheDirName = "testapp-updater"

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
        signedWin: isWindows,
        packed,
      }
    )
  }

  const build = (version: string) =>
    buildApp(version, targets, extraConfig, async context => {
      // move dist temporarily out of project dir so each downloader can reference it
      const newDir = await tmpDir.getTempDir({ prefix: version })
      await move(context.outDir, newDir)
      outDirs.push(newDir)
    })
  try {
    await build(OLD_VERSION_NUMBER)
    await build("1.0.1")
  } catch (e: any) {
    await tmpDir.cleanup()
    throw e
  }
}

test.ifWindows("web installer", { retry: 2 }, async ({ expect }) => {
  const outDirs: Array<string> = []
  const tmpDir = new TmpDir("differential-updater-test")
  await doBuild(expect, outDirs, Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64), tmpDir, true)

  const oldDir = outDirs[0]
  await move(path.join(oldDir, "nsis-web", `TestApp-${OLD_VERSION_NUMBER}-x64.nsis.7z`), path.join(getTestUpdaterCacheDir(oldDir), testAppCacheDirName, "package.7z"))

  await testBlockMap(expect, outDirs[0], path.join(outDirs[1], "nsis-web"), NsisUpdater, Platform.WINDOWS, Arch.x64)
})

test.ifWindows("nsis", async ({ expect }) => {
  const outDirs: Array<string> = []
  const tmpDir = new TmpDir("differential-updater-test")
  await doBuild(expect, outDirs, Platform.WINDOWS.createTarget(["nsis"], Arch.x64), tmpDir, true)

  const oldDir = outDirs[0]
  // move to new dir so that localhost server can read both blockmaps
  await move(path.join(oldDir, `Test App ßW Setup ${OLD_VERSION_NUMBER}.exe`), path.join(getTestUpdaterCacheDir(oldDir), testAppCacheDirName, "installer.exe"))
  await move(path.join(oldDir, `Test App ßW Setup ${OLD_VERSION_NUMBER}.exe.blockmap`), path.join(outDirs[1], "Test App ßW Setup 1.0.0.exe.blockmap"))

  await testBlockMap(expect, outDirs[0], outDirs[1], NsisUpdater, Platform.WINDOWS, Arch.x64)
})

async function testLinux(expect: ExpectStatic, arch: Arch) {
  process.env.TEST_UPDATER_ARCH = Arch[arch]

  const outDirs: Array<string> = []
  const tmpDir = new TmpDir("differential-updater-test")
  try {
    await doBuild(expect, outDirs, Platform.LINUX.createTarget(["appimage"], arch), tmpDir, false)

    process.env.APPIMAGE = path.join(outDirs[0], `Test App ßW-${OLD_VERSION_NUMBER}${arch === Arch.ia32 ? "-i386" : ""}.AppImage`)
    await testBlockMap(expect, outDirs[0], outDirs[1], AppImageUpdater, Platform.LINUX, arch)
  } finally {
    await tmpDir.cleanup()
  }
}

test.ifLinux("AppImage", ({ expect }) => testLinux(expect, Arch.x64))

// Skipped, electron no longer ships ia32 linux binaries
test.ifLinux.skip("AppImage ia32", ({ expect }) => testLinux(expect, Arch.ia32))

async function testMac(expect: ExpectStatic, arch: Arch) {
  process.env.TEST_UPDATER_ARCH = Arch[arch]

  const outDirs: Array<string> = []
  const tmpDir = new TmpDir("differential-updater-test")
  try {
    await doBuild(expect, outDirs, Platform.MAC.createTarget(["zip"], arch), tmpDir, false, {
      mac: {
        electronUpdaterCompatibility: ">=2.17.0",
      },
    })

    // move to new dir so that localhost server can read both blockmaps
    const oldDir = outDirs[0]
    const blockmap = `Test App ßW-${OLD_VERSION_NUMBER}${getArchSuffix(arch)}-mac.zip.blockmap`
    await move(path.join(oldDir, blockmap), path.join(outDirs[1], blockmap))
    await move(path.join(oldDir, `Test App ßW-${OLD_VERSION_NUMBER}${getArchSuffix(arch)}-mac.zip`), path.join(getTestUpdaterCacheDir(oldDir), testAppCacheDirName, "update.zip"))

    await testBlockMap(expect, outDirs[0], outDirs[1], MacUpdater, Platform.MAC, arch, "Test App ßW")
  } finally {
    await tmpDir.cleanup()
  }
}

test.ifMac("Mac Intel", ({ expect }) => testMac(expect, Arch.x64))
test.ifMac("Mac universal", ({ expect }) => testMac(expect, Arch.universal))

// only run on arm64 macs, otherwise of course no files can be found to be updated to (due to arch mismatch)
test.ifMac.ifEnv(process.arch === "arm64")("Mac arm64", ({ expect }) => testMac(expect, Arch.arm64))

async function checkResult(expect: ExpectStatic, updater: BaseUpdater) {
  // disable automatic install otherwise mac updater will permanently wait on mocked electron's native updater to receive update (mocked server can't install)
  updater.autoInstallOnAppQuit = false

  const updateCheckResult = await updater.checkForUpdates()
  const downloadPromise = updateCheckResult?.downloadPromise
  // noinspection JSIgnoredPromiseFromCall
  expect(downloadPromise).not.toBeNull()
  const files = await downloadPromise
  const fileInfo: any = updateCheckResult?.updateInfo.files[0]

  // delete url because port is random
  expect(fileInfo.url).toBeDefined()
  delete fileInfo.url
  expect(removeUnstableProperties(updateCheckResult?.updateInfo)).toMatchSnapshot()
  expect(files!.map(it => path.basename(it))).toMatchSnapshot()
}

class TestNativeUpdater extends EventEmitter {
  checkForUpdates() {
    console.log("TestNativeUpdater.checkForUpdates")
    // MacUpdater expects this to emit corresponding update-downloaded event
    this.emit("update-downloaded")
  }
  setFeedURL(updateConfig: any) {
    console.log("TestNativeUpdater.setFeedURL " + updateConfig.url)
  }
  getFeedURL() {
    console.log("TestNativeUpdater.getFeedURL")
  }
  quitAndInstall() {
    console.log("TestNativeUpdater.quitAndInstall")
  }
}

function getTestUpdaterCacheDir(oldDir: string) {
  return path.join(oldDir, "updater-cache")
}

async function testBlockMap(expect: ExpectStatic, oldDir: string, newDir: string, updaterClass: any, platform: Platform, arch: Arch, productFilename?: string) {
  const appUpdateConfigPath = path.join(
    `${platform.buildConfigurationKey}${getArchSuffix(arch)}${platform === Platform.MAC ? "" : "-unpacked"}`,
    platform === Platform.MAC ? `${productFilename}.app` : ""
  )
  const port = 8000 + (updaterClass.name.charCodeAt(0) as number) + Math.floor(Math.random() * 10000)

  const serverBin = await getBinFromUrl("ran", "0.1.3", "imfA3LtT6umMM0BuQ29MgO3CJ9uleN5zRBi3sXzcTbMOeYZ6SQeN7eKr3kXZikKnVOIwbH+DDO43wkiR/qTdkg==")
  const httpServerProcess = doSpawn(path.join(serverBin, process.platform, "ran"), [`-root=${newDir}`, `-port=${port}`, "-gzip=false", "-listdir=true"])

  // Mac uses electron's native autoUpdater to serve updates to, we mock here since electron API isn't available within jest runtime
  const mockNativeUpdater = new TestNativeUpdater()

  mockForNodeRequire("electron", {
    autoUpdater: mockNativeUpdater,
  })

  return await new Promise<void>((resolve, reject) => {
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
      updater.logger = new NoOpLogger()

      const currentUpdaterCacheDirName = (await updater.configOnDisk.value).updaterCacheDirName
      if (currentUpdaterCacheDirName == null) {
        throw new Error(`currentUpdaterCacheDirName must be not null, appUpdateConfigPath: ${updater._appUpdateConfigPath}`)
      }

      updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions | S3Options>({
        provider: "generic",
        updaterCacheDirName: currentUpdaterCacheDirName,
        url: `http://127.0.0.1:${port}`,
      })

      await checkResult(expect, updater)
    }

    doTest().then(resolve).catch(reject)
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
