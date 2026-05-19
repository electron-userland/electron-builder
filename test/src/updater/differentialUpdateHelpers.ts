import { Arch, Configuration, Platform } from "app-builder-lib"
import { getArchSuffix } from "builder-util"
import { GenericServerOptions, Nullish, S3Options } from "builder-util-runtime"
import { AppImageUpdater, BaseUpdater, MacUpdater } from "electron-updater"
import { EventEmitter } from "events"
import { move } from "fs-extra"
import * as path from "path"
import { TmpDir } from "temp-file"
import { TestAppAdapter } from "../helpers/TestAppAdapter"
import { PackedContext, assertPack, removeUnstableProperties } from "../helpers/packTester"
import { NEW_VERSION_NUMBER, OLD_VERSION_NUMBER, tuneTestUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil"
import { mockForNodeRequire } from "vitest-mock-commonjs"
import { ExpectStatic } from "vitest"
import { createLocalServer } from "../helpers/launchAppCrossPlatform"
import { ToolsetConfig } from "app-builder-lib/src/configuration"

export async function doBuild(
  expect: ExpectStatic,
  outDirs: Array<string>,
  targets: Map<Platform, Map<Arch, Array<string>>>,
  tmpDir: TmpDir,
  toolsets?: ToolsetConfig | null,
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
          toolsets,
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
        signedWin: toolsets?.winCodeSign != null,
        packed,
      }
    )
  }

  const build = (version: string) =>
    buildApp(version, targets, extraConfig, async context => {
      const newDir = await tmpDir.getTempDir({ prefix: version })
      await move(context.outDir, newDir)
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

export function getTestUpdaterCacheDir(oldDir: string) {
  return path.join(oldDir, "updater-cache")
}

export async function checkResult(expect: ExpectStatic, updater: BaseUpdater) {
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

export async function testBlockMap(expect: ExpectStatic, oldDir: string, newDir: string, updaterClass: any, platform: Platform, arch: Arch, productFilename?: string) {
  const appUpdateConfigPath = path.join(
    `${platform.buildConfigurationKey}${getArchSuffix(arch)}${platform === Platform.MAC ? "" : "-unpacked"}`,
    platform === Platform.MAC ? `${productFilename}.app` : ""
  )
  const { server, port } = await createLocalServer(newDir)

  // Mac uses electron's native autoUpdater to serve updates to, we mock here since electron API isn't available within jest runtime
  const mockNativeUpdater = new TestNativeUpdater()
  mockForNodeRequire("electron", {
    autoUpdater: mockNativeUpdater,
  })

  return await new Promise<void>((resolve, reject) => {
    server.on("error", reject)

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
      server.close()
      return v
    },
    e => {
      server.close()
      throw e
    }
  )
}

export async function testLinux(expect: ExpectStatic, arch: Arch, toolset: ToolsetConfig["appimage"]) {
  process.env.TEST_UPDATER_ARCH = Arch[arch]

  const outDirs: Array<string> = []
  const tmpDir = new TmpDir("differential-updater-test")
  try {
    await doBuild(expect, outDirs, Platform.LINUX.createTarget(["appimage"], arch), tmpDir, { appimage: toolset })

    process.env.APPIMAGE = path.join(outDirs[0], `Test App ßW-${OLD_VERSION_NUMBER}${arch === Arch.ia32 ? "-i386" : ""}.AppImage`)
    await testBlockMap(expect, outDirs[0], outDirs[1], AppImageUpdater, Platform.LINUX, arch)
  } finally {
    await tmpDir.cleanup()
  }
}
