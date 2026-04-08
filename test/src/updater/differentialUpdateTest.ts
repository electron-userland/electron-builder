<<<<<<< HEAD
import { Arch, Platform } from "app-builder-lib"
import { getArchSuffix } from "builder-util"
=======
import { Arch, Configuration, Platform } from "app-builder-lib"
import { getBinFromUrl } from "app-builder-lib"
import { doSpawn, getArchSuffix } from "builder-util"
import { GenericServerOptions, Nullish, S3Options } from "builder-util-runtime"
import { AppImageUpdater, BaseUpdater, MacUpdater, NsisUpdater } from "electron-updater"
import { EventEmitter } from "events"
<<<<<<< HEAD
>>>>>>> fb7cff668 (esm complete on tests as well?)
import { move } from "fs-extra"
=======
import * as fsExtra from "fs-extra"
>>>>>>> 8a2e4e97f (tmp save. migrating fs-extra to namespace import)
import * as path from "path"
import { TmpDir } from "temp-file"
import { EXTENDED_TIMEOUT } from "../helpers/packTester"
import { OLD_VERSION_NUMBER, testAppCacheDirName } from "../helpers/updaterTestUtil"
import { MacUpdater } from "electron-updater"
import { ExpectStatic } from "vitest"
<<<<<<< HEAD
import { doBuild, getTestUpdaterCacheDir, testBlockMap } from "./differentialUpdateHelpers"
=======
import { getRanLocalServerPath } from "../helpers/launchAppCrossPlatform.js"
import { ToolsetConfig } from "app-builder-lib/out/configuration.js"

async function doBuild(
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
      // move dist temporarily out of project dir so each downloader can reference it
      const newDir = await tmpDir.getTempDir({ prefix: version })
      await fsExtra.move(context.outDir, newDir)
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

const winCodeSignVersions: ToolsetConfig["winCodeSign"][] = ["0.0.0", "1.0.0", "1.1.0"]

for (const winCodeSign of winCodeSignVersions) {
  describe.ifWindows(`winCodeSign: ${winCodeSign}`, { sequential: true }, () => {
    test("web installer", async ({ expect }) => {
      const outDirs: Array<string> = []
      const tmpDir = new TmpDir("differential-updater-test")
      // need to build both in order for this to run on both arm64 and x64 windows
      await doBuild(expect, outDirs, Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64, Arch.arm64), tmpDir, { winCodeSign })

      const oldDir = outDirs[0]
      await fsExtra.move(
        path.join(oldDir, "nsis-web", `TestApp-${OLD_VERSION_NUMBER}${getArchSuffix(archFromString(process.arch), "universal")}.nsis.7z`),
        path.join(getTestUpdaterCacheDir(oldDir), testAppCacheDirName, "package.7z")
      )

      await testBlockMap(expect, outDirs[0], path.join(outDirs[1], "nsis-web"), NsisUpdater, Platform.WINDOWS, archFromString(process.arch))
    })

    test("nsis", async ({ expect }) => {
      const outDirs: Array<string> = []
      const tmpDir = new TmpDir("differential-updater-test")
      await doBuild(expect, outDirs, Platform.WINDOWS.createTarget(["nsis"], Arch.x64), tmpDir, { winCodeSign })

      const oldDir = outDirs[0]
      // move to new dir so that localhost server can read both blockmaps
      await fsExtra.move(path.join(oldDir, `Test App ßW Setup ${OLD_VERSION_NUMBER}.exe`), path.join(getTestUpdaterCacheDir(oldDir), testAppCacheDirName, "installer.exe"))
      await fsExtra.move(path.join(oldDir, `Test App ßW Setup ${OLD_VERSION_NUMBER}.exe.blockmap`), path.join(outDirs[1], "Test App ßW Setup 1.0.0.exe.blockmap"))

      await testBlockMap(expect, outDirs[0], outDirs[1], NsisUpdater, Platform.WINDOWS, Arch.x64)
    })
  })
}

async function testLinux(expect: ExpectStatic, arch: Arch, toolset: ToolsetConfig["appimage"]) {
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

const appimageToolsetVersions: ToolsetConfig["appimage"][] = ["0.0.0", "1.0.2"]
const supportedArchs = [
  Arch.x64,
  Arch.arm64,
  // Arch.ia32 // Skipped, electron no longer ships ia32 linux binaries
]
describe.ifLinux("AppImage", { sequential: true }, () => {
  for (const appimage of appimageToolsetVersions) {
    for (const arch of supportedArchs) {
      test(`${Arch[arch]} - toolset: ${appimage}`, ({ expect }) => testLinux(expect, arch, appimage))
    }
  }
})
>>>>>>> 8a2e4e97f (tmp save. migrating fs-extra to namespace import)

async function testMac(expect: ExpectStatic, arch: Arch) {
  process.env.TEST_UPDATER_ARCH = Arch[arch]

  const outDirs: Array<string> = []
  const tmpDir = new TmpDir("differential-updater-test")
  try {
    await doBuild(expect, outDirs, Platform.MAC.createTarget(["zip"], arch), tmpDir, null, {
      mac: {
        electronUpdaterCompatibility: ">=2.17.0",
      },
    })

    // move to new dir so that localhost server can read both blockmaps
    const oldDir = outDirs[0]
    const blockmap = `Test App ßW-${OLD_VERSION_NUMBER}${getArchSuffix(arch)}-mac.zip.blockmap`
    await fsExtra.move(path.join(oldDir, blockmap), path.join(outDirs[1], blockmap))
    await fsExtra.move(path.join(oldDir, `Test App ßW-${OLD_VERSION_NUMBER}${getArchSuffix(arch)}-mac.zip`), path.join(getTestUpdaterCacheDir(oldDir), testAppCacheDirName, "update.zip"))

    await testBlockMap(expect, outDirs[0], outDirs[1], MacUpdater, Platform.MAC, arch, "Test App ßW")
  } finally {
    await tmpDir.cleanup()
  }
}

test.ifMac("Mac Intel", ({ expect }) => testMac(expect, Arch.x64))
// builds 2 archs, so double the timeout?
test.ifMac("Mac universal", { timeout: 2 * EXTENDED_TIMEOUT }, ({ expect }) => testMac(expect, Arch.universal))

// only run on arm64 macs, otherwise of course no files can be found to be updated to (due to arch mismatch)
test.ifMac.ifEnv(process.arch === "arm64")("Mac arm64", ({ expect }) => testMac(expect, Arch.arm64))
