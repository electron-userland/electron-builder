import BluebirdPromise from "bluebird-lst"
import { GenericServerOptions } from "builder-util-runtime"
import { Arch, Platform } from "electron-builder"
import { NsisUpdater } from "electron-updater/out/NsisUpdater"
import { rename } from "fs-extra-p"
import { createServer } from "http"
import * as path from "path"
import { TmpDir } from "temp-file"
import { assertPack } from "../helpers/packTester"
import { createTestApp, tuneNsisUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil"

process.env.TEST_UPDATER_PLATFORM = "win32"

test.ifAll.ifDevOrWinCi("web installer", async () => {
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
        nsis: {
          differentialPackage: true,
        },
      }
    }, {
      packed: async context => {
        const outDir = context.outDir
        outDirs.push(outDir)
        await rename(path.join(outDir, "nsis-web", "latest.yml"), path.join(outDir, "latest.yml"))
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

    await rename(path.join(oldDir, "TestApp-1.0.0-x64.nsis.zip"), path.join(oldDir, "win-unpacked", "package.zip"))
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
                file: "TestApp-1.0.0-x64.nsis.zip"
              }
            },
            githubArtifactName: "TestApp-WebSetup-1.0.0.exe"
          }
        },
        {
          file: "Test App ßW Web Setup 1.0.0.exe",
          packageFiles: {
            x64: {
              file: "TestApp-1.0.0-x64.nsis.zip"
            }
          },
          arch: "x64",
          safeArtifactName: "TestApp-WebSetup-1.0.0.exe"
        },
        {
          file: "TestApp-1.0.0-x64.nsis.zip",
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
                file: "TestApp-1.0.1-x64.nsis.zip"
              }
            },
            githubArtifactName: "TestApp-WebSetup-1.0.1.exe"
          }
        },
        {
          file: "Test App ßW Web Setup 1.0.1.exe",
          packageFiles: {
            x64: {
              file: "TestApp-1.0.1-x64.nsis.zip"
            }
          },
          arch: "x64",
          safeArtifactName: "TestApp-WebSetup-1.0.1.exe"
        },
        {
          file: "TestApp-1.0.1-x64.nsis.zip",
          arch: "x64"
        }
      ]
    }).toMatchSnapshot()

    outDirs = [
      path.join(process.env.TEST_APP_TMP_DIR!!, "oldDist"),
      path.join(process.env.TEST_APP_TMP_DIR!!, "dist"),
    ]
  }

  await testBlockMap(outDirs[0], outDirs[1])
})

function testBlockMap(oldDir: string, newDir: string) {
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
      const updater = new NsisUpdater()
      tuneNsisUpdater(updater)
      updater.logger = console
      const doTest = async () => {
        const address = server!!.address()
        updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
          provider: "generic",
          url: `http://${address.address}:${address.port}`,
        })

        const updateCheckResult = await updater.checkForUpdates()
        const downloadPromise = updateCheckResult.downloadPromise
        expect(downloadPromise).not.toBeNull()
        const files = await downloadPromise
        const fileInfo: any = updateCheckResult.fileInfo

        delete fileInfo.sha2
        delete fileInfo.sha512

        // because port is random
        expect(fileInfo.url).toBeDefined()
        expect(fileInfo.packageInfo).toBeDefined()
        delete fileInfo.url
        delete fileInfo.packageInfo

        expect(fileInfo).toMatchSnapshot()
        expect(files!!.map(it => path.basename(it))).toMatchSnapshot()
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