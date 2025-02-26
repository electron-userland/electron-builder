import { configureRequestOptionsFromUrl, GithubOptions } from "builder-util-runtime"
import { MacUpdater } from "electron-updater/out/MacUpdater"
import { EventEmitter } from "events"
import { assertThat } from "../helpers/fileAssert"
import { createTestAppAdapter, httpExecutor, trackEvents, tuneTestUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil"
import { mockForNodeRequire } from "vitest-mock-commonjs"

class TestNativeUpdater extends EventEmitter {
  private updateUrl: string | null = null

  // noinspection JSMethodCanBeStatic
  checkForUpdates() {
    console.log("TestNativeUpdater.checkForUpdates")
    this.download().catch(error => {
      this.emit("error", error)
    })
  }

  private async download() {
    const data = JSON.parse((await httpExecutor.request(configureRequestOptionsFromUrl(this.updateUrl!, {})))!)
    await httpExecutor.request(configureRequestOptionsFromUrl(data.url, {}))
  }

  // noinspection JSMethodCanBeStatic
  setFeedURL(updateUrl: any) {
    // console.log("TestNativeUpdater.setFeedURL " + updateUrl)
    this.updateUrl = updateUrl.url
  }
}

test.ifMac("mac updates", async ({ expect }) => {
  const mockNativeUpdater = new TestNativeUpdater()

  mockForNodeRequire("electron", {
    autoUpdater: mockNativeUpdater,
  })

  const updater = new MacUpdater(undefined, await createTestAppAdapter())
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
  ;(updater as any)._testOnlyOptions.platform = process.platform
  const actualEvents = trackEvents(updater)

  const updateCheckResult = await updater.checkForUpdates()
  // todo when will be updated to use files
  // expect(removeUnstableProperties(updateCheckResult?.updateInfo.files)).toMatchSnapshot()
  const files = await updateCheckResult?.downloadPromise
  expect(files!.length).toEqual(1)
  await assertThat(expect, files![0]).isFile()
  expect(actualEvents).toMatchSnapshot()
})
