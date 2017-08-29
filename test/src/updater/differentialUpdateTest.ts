import BluebirdPromise from "bluebird-lst"
import { Arch, Platform } from "electron-builder"
import { GenericServerOptions } from "electron-builder-http/out/publishOptions"
import { NsisUpdater } from "electron-updater/out/NsisUpdater"
import { rename } from "fs-extra-p"
import { createServer } from "http"
import * as path from "path"
import { TmpDir } from "temp-file"
import { assertPack } from "../helpers/packTester"
import { createTestApp, tuneNsisUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil"

process.env.TEST_UPDATER_PLATFORM = "win32"

test.ifAll.ifDevOrWinCi("web installer", async () => {
  const outDirs: Array<string> = []

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
  }

  await testBlockMap(outDirs[0], outDirs[1])
})

function testBlockMap(oldDir: string, newDir: string) {
  const serveStatic = require("serve-static")
  const finalHandler = require("finalhandler")
  const serve = serveStatic(newDir)

  const server = createServer((request, response) => {
    serve(request, response, finalHandler(request, response))
  })

  const mockApp = createTestApp("0.0.1")
  jest.mock("electron", () => {
    return {
      app: mockApp
    }
  }, {virtual: true})

  return new BluebirdPromise((resolve, reject) => {
    server.on("error", reject)

    server!!.listen(0, "127.0.0.1", 16, () => {
      const updater = new NsisUpdater()
      tuneNsisUpdater(updater)
      const doTest = async () => {
        const address = server!!.address()
        updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
          provider: "generic",
          url: `http://${address.address}:${address.port}`,
        })

        const updateCheckResult = await updater.checkForUpdates()
        const downloadPromise = updateCheckResult.downloadPromise
        expect(downloadPromise).not.toBeNull()
        await downloadPromise
        const fileInfo: any = updateCheckResult.fileInfo
        delete fileInfo.sha2
        delete fileInfo.sha512
        delete fileInfo.url
        expect(fileInfo).toMatchSnapshot()
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