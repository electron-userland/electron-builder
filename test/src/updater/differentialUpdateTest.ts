import BluebirdPromise from "bluebird-lst"
import { Arch, Platform } from "electron-builder"
import { GenericServerOptions } from "electron-builder-http/out/publishOptions"
import { NsisUpdater } from "electron-updater/out/NsisUpdater"
import { move } from "fs-extra-p"
import { createServer } from "http"
import * as path from "path"
import { app } from "../helpers/packTester"
import { createTestApp, tuneNsisUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil"

process.env.TEST_UPDATER_PLATFORM = "win32"

test.ifNotCiMac("web installer", app({
  targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
  config: {
    compression: process.env.COMPRESSION as any || "store",
    publish: {
      provider: "s3",
      bucket: "develar",
      path: "test",
    },
    nsis: {
      differentialPackage: true,
    }
  }
}, {
  packed: context => {
    const serveStatic = require("serve-static")
    const finalHandler = require("finalhandler")
    const serve = serveStatic(context.outDir)

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

          await move(path.join(context.outDir, "nsis-web", "latest.yml"), path.join(context.outDir, "latest.yml"))

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
}))