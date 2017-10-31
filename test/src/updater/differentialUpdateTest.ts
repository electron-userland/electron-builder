import BluebirdPromise from "bluebird-lst"
import { GenericServerOptions, WindowsUpdateInfo } from "builder-util-runtime"
import { BLOCK_MAP_FILE_NAME } from "builder-util-runtime/out/blockMapApi"
import { Arch, Platform } from "electron-builder"
import { NsisUpdater } from "electron-updater/out/NsisUpdater"
import { close, open, read, readFile, rename, writeFile } from "fs-extra-p"
import { createServer } from "http"
import { safeLoad } from "js-yaml"
import * as path from "path"
import { TmpDir } from "temp-file"
import { assertPack } from "../helpers/packTester"
import { createTestApp, tuneNsisUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil"
import { AppImageUpdater } from "electron-updater/out/AppImageUpdater"

test.ifAll.ifDevOrWinCi("web installer", async () => {
  process.env.TEST_UPDATER_PLATFORM = "win32"

  let outDirs: Array<string> = []

  async function buildApp(version: string) {
    await assertPack("test-app-one", {
      targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
      config: {
        extraMetadata: {
          version,
        },
        // package in any case compressed, customization is explicitly disabled - "do not allow to change compression level to avoid different packages"
        compression: process.env.COMPRESSION as any || "store",
        publish: {
          provider: "s3",
          bucket: "develar",
          path: "test",
        },
      },
    }, {
      signed: true,
      packed: async context => {
        const outDir = context.outDir
        outDirs.push(outDir)
        const targetOutDir = path.join(outDir, "nsis-web")
        const updateInfoFile = path.join(targetOutDir, "latest.yml")

        const updateInfo: WindowsUpdateInfo = safeLoad(await readFile(updateInfoFile, "utf-8"))
        const fd = await open(path.join(targetOutDir, `TestApp-${version}-x64.nsis.7z`), "r")
        try {
          const packageInfo = updateInfo.packages!!.x64
          const buffer = Buffer.allocUnsafe(packageInfo.blockMapSize!!)
          await read(fd, buffer, 0, buffer.length, packageInfo.size - buffer.length)
          const inflateRaw: any = BluebirdPromise.promisify(require("zlib").inflateRaw)
          const blockMapData = (await inflateRaw(buffer)).toString()
          await writeFile(path.join(outDir, "win-unpacked", BLOCK_MAP_FILE_NAME), blockMapData)
        }
        finally {
          await close(fd)
        }
      }
    })
  }

  if (process.env.__SKIP_BUILD == null) {
    await buildApp("1.0.0")

    const tmpDir = new TmpDir()
    try {
      // move dist temporarily out of project dir
      const oldDir = await tmpDir.getTempDir()
      await rename(outDirs[0], oldDir)
      outDirs[0] = oldDir

      await buildApp("1.0.1")
    }
    catch (e) {
      await tmpDir.cleanup()
      throw e
    }

    // move old dist to new project as oldDist - simplify development (no need to guess where old dist located in the temp fs)
    const oldDir = path.join(outDirs[1], "..", "oldDist")
    await rename(outDirs[0], oldDir)
    outDirs[0] = oldDir

    await rename(path.join(oldDir, "nsis-web", "TestApp-1.0.0-x64.nsis.7z"), path.join(oldDir, "win-unpacked", "package.7z"))
  }
  else {
    // to  avoid snapshot mismatch (since in this node app is not packed)
    expect({
      win: [
        {
          file: "latest.yml",
          fileContent: {
            version: "1.0.0",
            path: "Test App ßW Web Setup 1.0.0.exe",
            packages: {
              x64: {
                file: "TestApp-1.0.0-x64.nsis.7z"
              }
            },
          }
        },
        {
          file: "Test App ßW Web Setup 1.0.0.exe",
          packageFiles: {
            x64: {
              file: "TestApp-1.0.0-x64.nsis.7z"
            }
          },
          arch: "x64",
          safeArtifactName: "TestApp-WebSetup-1.0.0.exe"
        },
        {
          file: "TestApp-1.0.0-x64.nsis.7z",
          arch: "x64"
        }
      ]
    }).toMatchSnapshot()
    expect({
      win: [
        {
          file: "latest.yml",
          fileContent: {
            version: "1.0.1",
            path: "Test App ßW Web Setup 1.0.1.exe",
            packages: {
              x64: {
                file: "TestApp-1.0.1-x64.nsis.7z"
              }
            },
          }
        },
        {
          file: "Test App ßW Web Setup 1.0.1.exe",
          packageFiles: {
            x64: {
              file: "TestApp-1.0.1-x64.nsis.7z"
            }
          },
          arch: "x64",
          safeArtifactName: "TestApp-WebSetup-1.0.1.exe"
        },
        {
          file: "TestApp-1.0.1-x64.nsis.7z",
          arch: "x64"
        }
      ]
    }).toMatchSnapshot()

    outDirs = [
      path.join(process.env.TEST_APP_TMP_DIR!!, "oldDist"),
      path.join(process.env.TEST_APP_TMP_DIR!!, "dist"),
    ]
  }

  await testBlockMap(outDirs[0], path.join(outDirs[1], "nsis-web"), NsisUpdater)
})

async function testLinux(arch: Arch) {
  process.env.TEST_UPDATER_PLATFORM = "linux"
  process.env.TEST_UPDATER_ARCH = Arch[arch]

  let outDirs: Array<string> = []

  async function buildApp(version: string) {
    await assertPack("test-app-one", {
      targets: Platform.LINUX.createTarget(["appimage"], arch),
      config: {
        extraMetadata: {
          version,
        },
        compression: "normal",
        publish: {
          provider: "s3",
          bucket: "develar",
          path: "test",
        },
      },
    }, {
      packed: async context => {
        outDirs.push(context.outDir)}
    })
  }

  if (process.env.__SKIP_BUILD == null) {
    await buildApp("1.0.0")

    const tmpDir = new TmpDir()
    try {
      // move dist temporarily out of project dir
      const oldDir = await tmpDir.getTempDir()
      await rename(outDirs[0], oldDir)
      outDirs[0] = oldDir

      await buildApp("1.0.1")
    }
    catch (e) {
      await tmpDir.cleanup()
      throw e
    }

    // move old dist to new project as oldDist - simplify development (no need to guess where old dist located in the temp fs)
    const oldDir = path.join(outDirs[1], "..", "oldDist")
    await rename(outDirs[0], oldDir)
    outDirs[0] = oldDir

    // await rename(path.join(oldDir, "TestApp-1.0.0-x86_64.AppImage"), path.join(oldDir, "win-unpacked", "package.7z"))
  }
  else {
    // to  avoid snapshot mismatch (since in this node app is not packed)
    expect({
      win: [
        {
          file: "latest.yml",
          fileContent: {
            version: "1.0.0",
            path: "Test App ßW Web Setup 1.0.0.exe",
            packages: {
              x64: {
                file: "TestApp-1.0.0-x64.nsis.7z"
              }
            },
          }
        },
        {
          file: "Test App ßW Web Setup 1.0.0.exe",
          packageFiles: {
            x64: {
              file: "TestApp-1.0.0-x64.nsis.7z"
            }
          },
          arch: "x64",
          safeArtifactName: "TestApp-WebSetup-1.0.0.exe"
        },
        {
          file: "TestApp-1.0.0-x64.nsis.7z",
          arch: "x64"
        }
      ]
    }).toMatchSnapshot()
    expect({
      win: [
        {
          file: "latest.yml",
          fileContent: {
            version: "1.0.1",
            path: "Test App ßW Web Setup 1.0.1.exe",
            packages: {
              x64: {
                file: "TestApp-1.0.1-x64.nsis.7z"
              }
            },
          }
        },
        {
          file: "Test App ßW Web Setup 1.0.1.exe",
          packageFiles: {
            x64: {
              file: "TestApp-1.0.1-x64.nsis.7z"
            }
          },
          arch: "x64",
          safeArtifactName: "TestApp-WebSetup-1.0.1.exe"
        },
        {
          file: "TestApp-1.0.1-x64.nsis.7z",
          arch: "x64"
        }
      ]
    }).toMatchSnapshot()

    outDirs = [
      path.join(process.env.TEST_APP_TMP_DIR!!, "oldDist"),
      path.join(process.env.TEST_APP_TMP_DIR!!, "dist"),
    ]
  }

  process.env.APPIMAGE = path.join(outDirs[0], "TestApp-1.0.0-x86_64.AppImage")
  await testBlockMap(outDirs[0], path.join(outDirs[1]), AppImageUpdater)
}

test.ifAll.ifDevOrLinuxCi("AppImage", () => testLinux(Arch.x64))

test.ifAll.ifDevOrLinuxCi("AppImage ia32", () => testLinux(Arch.ia32))

// test.ifAll("s3", async () => {
//   if (process.env.OLD_DIST == null) {
//     return
//   }
//
//   const mockApp = createTestApp("0.5.13")
//   jest.mock("electron", () => {
//     return {
//       app: mockApp,
//     }
//   }, {virtual: true})
//
//   const updater = new NsisUpdater()
//   updater.updateConfigPath = await writeUpdateConfig({
//     provider: "s3",
//     bucket: "develar",
//     path: "onshape-test",
//   })
//   tuneNsisUpdater(updater)
//   updater.logger = console
//
//   {
//     (process as any).resourcesPath = path.join(process.env.OLD_DIST!!, "win-unpacked", "resources")
//   }
//
//   await checkResult(updater)
// })

async function checkResult(updater: NsisUpdater) {
  const updateCheckResult = await updater.checkForUpdates()
  const downloadPromise = updateCheckResult.downloadPromise
  expect(downloadPromise).not.toBeNull()
  const files = await downloadPromise
  const fileInfo: any = updateCheckResult.updateInfo.files[0]

  delete fileInfo.sha2
  delete fileInfo.sha512

  // because port is random
  expect(fileInfo.url).toBeDefined()
  delete fileInfo.url

  if (updater instanceof NsisUpdater) {
    expect(fileInfo.packageInfo).toBeDefined()
    delete fileInfo.packageInfo
  }

  expect(fileInfo).toMatchSnapshot()
  expect(files!!.map(it => path.basename(it))).toMatchSnapshot()
}

function testBlockMap(oldDir: string, newDir: string, updaterClass: any) {
  const serveStatic = require("serve-static")
  const finalHandler = require("finalhandler")
  const serve = serveStatic(newDir)

  {
    (process as any).resourcesPath = path.join(oldDir, "win-unpacked", "resources")
  }

  const server = createServer((request, response) => {
    serve(request, response, finalHandler(request, response))
  })

  const mockApp = createTestApp("0.0.1")
  jest.mock("electron", () => {
    return {
      app: mockApp,
    }
  }, {virtual: true})

  return new BluebirdPromise((resolve, reject) => {
    server.on("error", reject)

    server!!.listen(0, "127.0.0.1", 16, () => {
      const updater = new updaterClass()
      tuneNsisUpdater(updater)
      updater.logger = console
      const doTest = async () => {
        const address = server!!.address()
        updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
          provider: "generic",
          url: `http://${address.address}:${address.port}`,
        })

        await checkResult(updater)
      }

      doTest()
        .then(() => resolve())
        .catch(reject)
    })
  })
    .finally(() => {
      server.close()
    })
}