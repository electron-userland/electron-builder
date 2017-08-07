import { GithubOptions } from "electron-builder-http/out/publishOptions"
import { httpExecutor } from "electron-builder-util/out/nodeHttpExecutor"
import { MacUpdater } from "electron-updater/out/MacUpdater"
import { EventEmitter } from "events"
import { parse as parseUrl } from "url"
import { createTestApp, validateDownload, writeUpdateConfig } from "../helpers/updaterTestUtil"

class TestNativeUpdater extends EventEmitter {
  private updateUrl: string | null = null

  // noinspection JSMethodCanBeStatic
  checkForUpdates() {
    console.log("TestNativeUpdater.checkForUpdates")
    this.download()
      .catch(error => {
        this.emit("error", error)
      })
  }

  private async download() {
    const data = JSON.parse((await httpExecutor.request({
      ...parseUrl(this.updateUrl!) as any
    }))!!)

    await httpExecutor.request({
      ...parseUrl(data.url) as any
    })
  }

  // noinspection JSMethodCanBeStatic
  setFeedURL(updateUrl: string) {
    // console.log("TestNativeUpdater.setFeedURL " + updateUrl)
    this.updateUrl = updateUrl
  }
}

test.ifAll.ifNotCi.ifMac("mac updates", async () => {
  process.env.TEST_UPDATER_PLATFORM = process.platform
  const mockNativeUpdater = new TestNativeUpdater()
  const mockApp = createTestApp("0.0.1")
  jest.mock("electron", () => {
    return {
      autoUpdater: mockNativeUpdater,
      app: mockApp
    }
  }, {virtual: true})

  const updater = new MacUpdater()
  const options: GithubOptions = {
    provider: "github",
    owner: "develar",
    repo: "onshape-desktop-shell",
  }
  updater.updateConfigPath = await writeUpdateConfig(options)

  updater.on("download-progress", data => {
    // console.log(JSON.stringify(data))
  })

  await validateDownload(updater)
})