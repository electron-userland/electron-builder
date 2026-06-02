import { configureRequestOptionsFromUrl, GithubOptions } from "builder-util-runtime"
import { MacUpdater } from "electron-updater/out/MacUpdater"
import { EventEmitter } from "events"
import { statSync } from "fs"
import { readFile } from "fs/promises"
import { fileURLToPath, pathToFileURL } from "url"
import { assertThat } from "../helpers/fileAssert"
import { createTestAppAdapter, httpExecutor, trackEvents, tuneTestUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil"
import { mockForNodeRequire } from "vitest-mock-commonjs"

const githubOptions: GithubOptions = {
  provider: "github",
  owner: "develar",
  repo: "onshape-desktop-shell",
}

/**
 * Simulates Squirrel.Mac in JSON serverType mode. When setFeedURL receives a
 * file:// URL, it reads the feed JSON from disk, finds the updateTo.url, verifies
 * the ZIP is accessible, then emits update-downloaded.
 */
class TestNativeUpdater extends EventEmitter {
  private feedUrl: string | null = null
  private serverType: string | null = null
  checkForUpdatesCalled = false
  quitAndInstallCalled = false

  checkForUpdates() {
    this.checkForUpdatesCalled = true
    this.simulateSquirrelDownload().catch(error => {
      this.emit("error", error)
    })
  }

  private async simulateSquirrelDownload() {
    const url = this.feedUrl!
    if (url.startsWith("file://")) {
      // Simulate Squirrel.Mac JSON mode: read feed from disk
      const feedContent = JSON.parse(await readFile(fileURLToPath(url), "utf-8"))
      // JSON serverType: look for releases[].updateTo.url
      const release = feedContent.releases?.[0]?.updateTo
      if (!release?.url) {
        throw new Error(`Expected releases[0].updateTo.url in feed, got: ${JSON.stringify(feedContent)}`)
      }
      if (!release.url.startsWith("file://")) {
        throw new Error(`Expected file:// zip URL in feed, got: ${release.url}`)
      }
      // Verify the zip is actually readable (as Squirrel.Mac would read it)
      await readFile(fileURLToPath(release.url))
      this.emit("update-downloaded")
    } else {
      const data = JSON.parse((await httpExecutor.request(configureRequestOptionsFromUrl(url, {})))!)
      await httpExecutor.request(configureRequestOptionsFromUrl(data.url, {}))
    }
  }

  setFeedURL(options: { url: string; serverType?: string }) {
    this.feedUrl = options.url
    this.serverType = options.serverType ?? "default"
  }

  getFeedURL(): string | null {
    return this.feedUrl
  }

  getServerType(): string | null {
    return this.serverType
  }

  quitAndInstall() {
    this.quitAndInstallCalled = true
  }
}

async function setupMacUpdater(version = "0.0.1") {
  const mockNativeUpdater = new TestNativeUpdater()
  mockForNodeRequire("electron", { autoUpdater: mockNativeUpdater })

  const appAdapter = await createTestAppAdapter(version)
  const updater = new MacUpdater(undefined, appAdapter)
  updater.updateConfigPath = await writeUpdateConfig(githubOptions)
  tuneTestUpdater(updater)
  ;(updater as any)._testOnlyOptions.platform = process.platform

  return { updater, mockNativeUpdater, appAdapter }
}

test.ifMac("mac updates", async ({ expect }) => {
  const { updater } = await setupMacUpdater()
  const actualEvents = trackEvents(updater)

  const updateCheckResult = await updater.checkForUpdates()
  const files = await updateCheckResult?.downloadPromise
  expect(files!.length).toEqual(1)
  await assertThat(expect, files![0]).isFile()
  expect(actualEvents).toMatchSnapshot()
})

test.ifMac("setFeedURL is called with a file:// URL and serverType=json", async ({ expect }) => {
  const { updater, mockNativeUpdater } = await setupMacUpdater()

  const updateCheckResult = await updater.checkForUpdates()
  await updateCheckResult?.downloadPromise

  const feedUrl = mockNativeUpdater.getFeedURL()
  expect(feedUrl).not.toBeNull()
  expect(feedUrl).toMatch(/^file:\/\//)
  expect(feedUrl).toMatch(/update-feed\.json$/)
  expect(mockNativeUpdater.getServerType()).toBe("json")
})

test.ifMac("update-feed.json contains JSON-mode feed with file:// ZIP URL and version", async ({ expect }) => {
  const { updater, mockNativeUpdater } = await setupMacUpdater()

  const updateCheckResult = await updater.checkForUpdates()
  await updateCheckResult?.downloadPromise

  const feedUrl = mockNativeUpdater.getFeedURL()!
  const feedContent = JSON.parse(await readFile(fileURLToPath(feedUrl), "utf-8"))

  // Must be JSON serverType format
  expect(feedContent.currentRelease).toBeTruthy()
  expect(feedContent.releases).toHaveLength(1)
  const updateTo = feedContent.releases[0].updateTo
  expect(updateTo.url).toMatch(/^file:\/\//)
  expect(updateTo.url).toMatch(/\.zip$/)
  expect(updateTo.version).toBe(feedContent.currentRelease)
})

test.ifMac("feed version matches the downloaded update version", async ({ expect }) => {
  const { updater, mockNativeUpdater } = await setupMacUpdater()

  const updateCheckResult = await updater.checkForUpdates()
  const files = await updateCheckResult?.downloadPromise

  const feedUrl = mockNativeUpdater.getFeedURL()!
  const feedContent = JSON.parse(await readFile(fileURLToPath(feedUrl), "utf-8"))
  const zipPath = fileURLToPath(feedContent.releases[0].updateTo.url)

  // The ZIP URL must point to the same file that executeDownload resolved
  expect(zipPath).toBe(files![0])
})

test.ifMac("downloaded zip has 0600 permissions", async ({ expect }) => {
  const { updater } = await setupMacUpdater()

  const updateCheckResult = await updater.checkForUpdates()
  const files = await updateCheckResult?.downloadPromise

  const { mode } = statSync(files![0])
  expect(mode & 0o777).toBe(0o600)
})

test.ifMac("update-feed.json has 0600 permissions", async ({ expect }) => {
  const { updater, mockNativeUpdater } = await setupMacUpdater()

  const updateCheckResult = await updater.checkForUpdates()
  await updateCheckResult?.downloadPromise

  const feedPath = fileURLToPath(mockNativeUpdater.getFeedURL()!)
  const { mode } = statSync(feedPath)
  expect(mode & 0o777).toBe(0o600)
})

test.ifMac("autoInstallOnAppQuit=false resolves immediately without calling nativeUpdater.checkForUpdates", async ({ expect }) => {
  const { updater, mockNativeUpdater } = await setupMacUpdater()
  updater.autoInstallOnAppQuit = false

  const updateCheckResult = await updater.checkForUpdates()
  const files = await updateCheckResult?.downloadPromise

  expect(mockNativeUpdater.checkForUpdatesCalled).toBe(false)
  expect(files!.length).toBe(1)
  await assertThat(expect, files![0]).isFile()
})

test.ifMac("autoInstallOnAppQuit=true triggers nativeUpdater.checkForUpdates and awaits update-downloaded", async ({ expect }) => {
  const { updater, mockNativeUpdater } = await setupMacUpdater()
  updater.autoInstallOnAppQuit = true

  const updateCheckResult = await updater.checkForUpdates()
  const files = await updateCheckResult?.downloadPromise

  expect(mockNativeUpdater.checkForUpdatesCalled).toBe(true)
  expect(files!.length).toBe(1)
  await assertThat(expect, files![0]).isFile()
})

test.ifMac("nativeUpdater error during checkForUpdates rejects the download promise", async ({ expect }) => {
  const mockNativeUpdater = new TestNativeUpdater()
  const squirrelError = new Error("Squirrel.Mac: could not locate update bundle")
  mockNativeUpdater.checkForUpdates = function (this: TestNativeUpdater) {
    this.checkForUpdatesCalled = true
    setImmediate(() => this.emit("error", squirrelError))
  }
  mockForNodeRequire("electron", { autoUpdater: mockNativeUpdater })

  const updater = new MacUpdater(undefined, await createTestAppAdapter())
  updater.updateConfigPath = await writeUpdateConfig(githubOptions)
  tuneTestUpdater(updater)
  ;(updater as any)._testOnlyOptions.platform = process.platform
  updater.autoInstallOnAppQuit = true

  const updateCheckResult = await updater.checkForUpdates()
  await expect(updateCheckResult?.downloadPromise).rejects.toThrow("Squirrel.Mac: could not locate update bundle")
})

test.ifMac("quitAndInstall calls nativeUpdater.quitAndInstall when Squirrel already downloaded the update", async ({ expect }) => {
  const { updater, mockNativeUpdater } = await setupMacUpdater()
  updater.autoRunAppAfterInstall = true
  ;(updater as any).squirrelDownloadedUpdate = true

  updater.quitAndInstall()

  expect(mockNativeUpdater.quitAndInstallCalled).toBe(true)
})

test.ifMac("quitAndInstall always calls nativeUpdater.quitAndInstall (autoRunAppAfterInstall is ignored on macOS)", async ({ expect }) => {
  const { updater, mockNativeUpdater } = await setupMacUpdater()
  // Even with autoRunAppAfterInstall=false, macOS must always go through nativeUpdater.quitAndInstall()
  // so that ShipIt receives the signal to apply the staged update.
  updater.autoRunAppAfterInstall = false
  ;(updater as any).squirrelDownloadedUpdate = true

  updater.quitAndInstall()

  expect(mockNativeUpdater.quitAndInstallCalled).toBe(true)
})

test.ifMac("quitAndInstall with no prior Squirrel download triggers nativeUpdater.checkForUpdates", async ({ expect }) => {
  const { updater, mockNativeUpdater } = await setupMacUpdater()

  updater.autoInstallOnAppQuit = false
  const updateCheckResult = await updater.checkForUpdates()
  await updateCheckResult?.downloadPromise

  expect((updater as any).squirrelDownloadedUpdate).toBe(false)

  mockNativeUpdater.checkForUpdatesCalled = false
  updater.quitAndInstall()

  expect(mockNativeUpdater.checkForUpdatesCalled).toBe(true)
})

test.ifMac("update events are emitted in the correct order", async ({ expect }) => {
  const { updater } = await setupMacUpdater()
  const events = trackEvents(updater)

  const updateCheckResult = await updater.checkForUpdates()
  await updateCheckResult?.downloadPromise

  expect(events).toContain("checking-for-update")
  expect(events).toContain("update-available")
  expect(events).toContain("update-downloaded")
  expect(events.indexOf("checking-for-update")).toBeLessThan(events.indexOf("update-available"))
  expect(events.indexOf("update-available")).toBeLessThan(events.indexOf("update-downloaded"))
})

test.ifMac("quitAndInstall called twice only triggers handleUpdateDownloaded once", async ({ expect }) => {
  const { updater } = await setupMacUpdater()

  expect((updater as any).squirrelDownloadedUpdate).toBe(false)

  let handlerCount = 0
  ;(updater as any).handleUpdateDownloaded = () => {
    handlerCount++
  }

  updater.quitAndInstall()
  updater.quitAndInstall()

  ;(updater as any).nativeUpdater.emit("update-downloaded")
  expect(handlerCount).toBe(1)
})

test.ifMac("update-feed.json is stable across repeated checkForUpdates calls (feed is overwritten, not duplicated)", async ({ expect }) => {
  const { updater, mockNativeUpdater } = await setupMacUpdater()

  await (await updater.checkForUpdates())?.downloadPromise
  const firstFeedUrl = mockNativeUpdater.getFeedURL()

  await (await updater.checkForUpdates())?.downloadPromise
  const secondFeedUrl = mockNativeUpdater.getFeedURL()

  expect(firstFeedUrl).toBe(secondFeedUrl)

  const feedContent = JSON.parse(await readFile(fileURLToPath(secondFeedUrl!), "utf-8"))
  expect(feedContent.releases?.[0]?.updateTo?.url).toMatch(/^file:\/\//)
})

test.ifMac("cached differential copy update.zip has 0600 permissions after download", async ({ expect }) => {
  const { updater, mockNativeUpdater } = await setupMacUpdater()

  const updateCheckResult = await updater.checkForUpdates()
  const files = await updateCheckResult?.downloadPromise

  const feedContent = JSON.parse(await readFile(fileURLToPath(mockNativeUpdater.getFeedURL()!), "utf-8"))
  const zipPath = fileURLToPath(feedContent.releases[0].updateTo.url)

  const { mode } = statSync(zipPath)
  expect(mode & 0o777).toBe(0o600)

  expect(statSync(files![0]).mode & 0o777).toBe(0o600)
})

test("pathToFileURL encodes paths with spaces and special characters correctly", ({ expect }) => {
  const pathWithSpaces = "/Users/John Doe/Library/Caches/com.example.app/update.zip"
  const url = pathToFileURL(pathWithSpaces)

  expect(url.href).toMatch(/^file:\/\//)
  expect(url.href).toContain("John%20Doe")
  expect(fileURLToPath(url)).toBe(pathWithSpaces)
})
