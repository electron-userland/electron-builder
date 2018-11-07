import { configureRequestOptionsFromUrl, GithubOptions } from "builder-util-runtime"
import { MacUpdater } from "electron-updater/out/MacUpdater"
import { EventEmitter } from "events"
import { assertThat } from "../helpers/fileAssert"
import { createTestApp, httpExecutor, trackEvents, tuneTestUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil"

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
    const data = JSON.parse((await httpExecutor.request(configureRequestOptionsFromUrl(this.updateUrl!, {})))!!)
    await httpExecutor.request(configureRequestOptionsFromUrl(data.url, {}))
  }

  // noinspection JSMethodCanBeStatic
  setFeedURL(updateUrl: any) {
    // console.log("TestNativeUpdater.setFeedURL " + updateUrl)
    this.updateUrl = updateUrl.url
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

  updater.on("download-progress", () => {
    // console.log(JSON.stringify(data))
  })

  tuneTestUpdater(updater)
  const actualEvents = trackEvents(updater)

  const updateCheckResult = await updater.checkForUpdates()
  // todo when will be updated to use files
  // expect(removeUnstableProperties(updateCheckResult.updateInfo.files)).toMatchSnapshot()
  const files = await updateCheckResult.downloadPromise
  expect(files!!.length).toEqual(1)
  await assertThat(files!![0]).isFile()
  expect(actualEvents).toMatchSnapshot()
})