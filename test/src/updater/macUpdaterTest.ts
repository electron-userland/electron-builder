import { serializeToYaml, TmpDir } from "builder-util"
import { configureRequestOptionsFromUrl, GenericServerOptions } from "builder-util-runtime"
import { createHash } from "crypto"
import { MacUpdater } from "electron-updater"
import { EventEmitter } from "events"
import fsExtra from "fs-extra"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert.js"
import { createLocalServer } from "../helpers/launchAppCrossPlatform.js"
import { createTestAppAdapter, httpExecutor, trackEvents, tuneTestUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil.js"
import { mockForNodeRequire } from "vitest-mock-commonjs"

class TestNativeUpdater extends EventEmitter {
  private updateUrl: string | null = null
  // Squirrel.Mac sends the headers from setFeedURL (incl. the Basic auth the proxy server requires) with
  // every request — mirror that here so the mock can authenticate against MacUpdater's local proxy.
  private headers: Record<string, string> = {}

  // noinspection JSMethodCanBeStatic
  checkForUpdates() {
    console.log("TestNativeUpdater.checkForUpdates")
    this.download().catch(error => {
      this.emit("error", error)
    })
  }

  private async download() {
    const data = JSON.parse((await httpExecutor.request(configureRequestOptionsFromUrl(this.updateUrl!, { headers: this.headers })))!)
    await httpExecutor.request(configureRequestOptionsFromUrl(data.url, { headers: this.headers }))
  }

  // noinspection JSMethodCanBeStatic
  setFeedURL(updateUrl: any) {
    // console.log("TestNativeUpdater.setFeedURL " + updateUrl)
    this.updateUrl = updateUrl.url
    this.headers = updateUrl.headers ?? {}
  }
}

test.ifMac("mac updates", async ({ expect }) => {
  const mockNativeUpdater = new TestNativeUpdater()

  mockForNodeRequire("electron", {
    autoUpdater: mockNativeUpdater,
  })

  // serve a synthetic mac update (latest-mac.yml + zip) from a localhost static server via the
  // generic provider — MacUpdater then proxies the downloaded zip to the (mocked) Squirrel.Mac updater
  const zipName = "TestApp-1.1.0-mac.zip"
  const zipContent = Buffer.from("electron-builder localhost update-server test zip payload — not a real archive")
  const sha512 = createHash("sha512").update(zipContent).digest("base64")
  const tmpDir = new TmpDir("mac-updater-test")
  const root = await tmpDir.getTempDir()
  await fsExtra.outputFile(
    path.join(root, "latest-mac.yml"),
    serializeToYaml({
      version: "1.1.0",
      files: [{ url: zipName, sha512, size: zipContent.length }],
      path: zipName,
      sha512,
      releaseDate: "2024-01-01T00:00:00.000Z",
    })
  )
  await fsExtra.outputFile(path.join(root, zipName), zipContent)
  const { server, port } = await createLocalServer(root)

  try {
    const updater = new MacUpdater(undefined, await createTestAppAdapter())
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
      provider: "generic",
      url: `http://127.0.0.1:${port}`,
    })

    updater.on("download-progress", () => {
      // console.log(JSON.stringify(data))
    })

    tuneTestUpdater(updater)
    ;(updater as any)._testOnlyOptions.platform = process.platform
    const actualEvents = trackEvents(updater)

    const updateCheckResult = await updater.checkForUpdates()
    // todo when will be updated to use files
    // expect(removeUnstableProperties(updateCheckResult?.updateInfo.files)).toMatchSnapshot()
    const { updateFile, packageFile } = (await updateCheckResult?.downloadPromise)!
    expect(packageFile).toBeUndefined()
    await assertThat(expect, updateFile).isFile()
    expect(actualEvents).toMatchSnapshot()
  } finally {
    server.close()
    await tmpDir.cleanup()
  }
})
