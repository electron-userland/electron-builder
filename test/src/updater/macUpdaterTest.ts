import { configureRequestOptionsFromUrl, GithubOptions } from "builder-util-runtime"
import { MacUpdater } from "electron-updater/out/MacUpdater"
import { EventEmitter } from "events"
import { statSync } from "fs"
import { readFile } from "fs/promises"
import * as path from "path"
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
 * Simulates Squirrel.Mac. When setFeedURL receives a file:// URL (our new approach),
 * it reads the feed JSON from disk and verifies the ZIP is accessible, then emits
 * update-downloaded. Falls back to HTTP for legacy test scenarios.
 */
class TestNativeUpdater extends EventEmitter {
  private feedUrl: string | null = null
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
      // Simulate Squirrel.Mac reading the feed JSON and the ZIP via NSURLSession file:// support
      const feedContent = JSON.parse(await readFile(fileURLToPath(url), "utf-8"))
      if (!feedContent.url?.startsWith("file://")) {
        throw new Error(`Expected file:// zip URL in feed, got: ${feedContent.url}`)
      }
      // verify the zip is actually readable (as Squirrel.Mac would read it)
      await readFile(fileURLToPath(feedContent.url))
      this.emit("update-downloaded")
    } else {
      const data = JSON.parse((await httpExecutor.request(configureRequestOptionsFromUrl(url, {})))!)
      await httpExecutor.request(configureRequestOptionsFromUrl(data.url, {}))
    }
  }

  setFeedURL(options: { url: string }) {
    this.feedUrl = options.url
  }

  getFeedURL(): string | null {
    return this.feedUrl
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

test.ifMac("setFeedURL is called with a file:// URL pointing to update-feed.json", async ({ expect }) => {
  const { updater, mockNativeUpdater } = await setupMacUpdater()

  const updateCheckResult = await updater.checkForUpdates()
  await updateCheckResult?.downloadPromise

  const feedUrl = mockNativeUpdater.getFeedURL()
  expect(feedUrl).not.toBeNull()
  expect(feedUrl).toMatch(/^file:\/\//)
  expect(feedUrl).toMatch(/update-feed\.json$/)
})

test.ifMac("update-feed.json contains a file:// URL pointing to the downloaded zip", async ({ expect }) => {
  const { updater, mockNativeUpdater } = await setupMacUpdater()

  const updateCheckResult = await updater.checkForUpdates()
  const files = await updateCheckResult?.downloadPromise

  const feedUrl = mockNativeUpdater.getFeedURL()!
  const feedContent = JSON.parse(await readFile(fileURLToPath(feedUrl), "utf-8"))

  expect(feedContent.url).toMatch(/^file:\/\//)
  expect(feedContent.url).toMatch(/\.zip$/)
  // feed must point to the same file that executeDownload resolved
  expect(fileURLToPath(feedContent.url)).toBe(files![0])
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
  // executeDownload still returns [updateFile]; autoInstallOnAppQuit only controls
  // whether Squirrel.Mac is triggered to fetch + install at download time
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
    // Defer so the once("error") listener in updateDownloaded is registered first
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

  // Simulate Squirrel having already downloaded the update (fires from constructor listener)
  ;(updater as any).squirrelDownloadedUpdate = true

  updater.quitAndInstall()

  expect(mockNativeUpdater.quitAndInstallCalled).toBe(true)
})

test.ifMac("quitAndInstall calls app.quit when autoRunAppAfterInstall=false", async ({ expect }) => {
  const { updater, appAdapter, mockNativeUpdater } = await setupMacUpdater()
  updater.autoRunAppAfterInstall = false
  ;(updater as any).squirrelDownloadedUpdate = true

  let appQuitCalled = false
  ;(appAdapter as any).quit = () => {
    appQuitCalled = true
  }

  updater.quitAndInstall()

  expect(appQuitCalled).toBe(true)
  expect(mockNativeUpdater.quitAndInstallCalled).toBe(false)
})

test.ifMac("quitAndInstall with no prior Squirrel download triggers nativeUpdater.checkForUpdates", async ({ expect }) => {
  const { updater, mockNativeUpdater } = await setupMacUpdater()

  // Download update but skip triggering Squirrel (autoInstallOnAppQuit=false)
  updater.autoInstallOnAppQuit = false
  const updateCheckResult = await updater.checkForUpdates()
  await updateCheckResult?.downloadPromise

  expect((updater as any).squirrelDownloadedUpdate).toBe(false)

  mockNativeUpdater.checkForUpdatesCalled = false
  updater.quitAndInstall()

  // quitAndInstall should invoke checkForUpdates since Squirrel hasn't fetched the update yet
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

test.ifMac("update-feed.json is stable across repeated checkForUpdates calls (feed is overwritten, not duplicated)", async ({ expect }) => {
  const { updater, mockNativeUpdater } = await setupMacUpdater()

  // First update check
  await (await updater.checkForUpdates())?.downloadPromise
  const firstFeedUrl = mockNativeUpdater.getFeedURL()

  // Second update check — feed.json should be overwritten with the same path
  await (await updater.checkForUpdates())?.downloadPromise
  const secondFeedUrl = mockNativeUpdater.getFeedURL()

  // Path must be stable (same file, just overwritten)
  expect(firstFeedUrl).toBe(secondFeedUrl)

  // The feed should still be valid
  const feedContent = JSON.parse(await readFile(fileURLToPath(secondFeedUrl!), "utf-8"))
  expect(feedContent.url).toMatch(/^file:\/\//)
})

test.ifMac("cached differential copy update.zip has 0600 permissions after download", async ({ expect }) => {
  const { updater, mockNativeUpdater } = await setupMacUpdater()

  const updateCheckResult = await updater.checkForUpdates()
  const files = await updateCheckResult?.downloadPromise

  // The update-feed.json points to the downloaded file; update.zip is the differential cache copy
  // which lives one directory above in cacheDir
  const feedUrl = mockNativeUpdater.getFeedURL()!
  const feedDir = path.dirname(fileURLToPath(feedUrl))
  const updateZipPath = path.join(feedDir, "update.zip")

  // update.zip exists (differential cache) and must be restricted
  const { mode } = statSync(updateZipPath)
  expect(mode & 0o777).toBe(0o600)

  // Sanity: the downloaded file itself (served via file://) is also restricted
  expect(statSync(files![0]).mode & 0o777).toBe(0o600)
})

test.ifMac("quitAndInstall called twice only triggers handleUpdateDownloaded once", async ({ expect }) => {
  const { updater } = await setupMacUpdater()

  // Confirm Squirrel has NOT yet downloaded (squirrelDownloadedUpdate=false)
  expect((updater as any).squirrelDownloadedUpdate).toBe(false)

  let handlerCount = 0
  ;(updater as any).handleUpdateDownloaded = () => {
    handlerCount++
  }

  // First call: registers a once() listener and (since autoInstallOnAppQuit is true by default) does NOT call checkForUpdates
  updater.quitAndInstall()
  // Second call: should NOT register a second listener (once() is idempotent per call, but
  // a second quitAndInstall() call would register a second listener if .on() was used instead of .once())
  updater.quitAndInstall()

  // Emit update-downloaded — handler must fire exactly once regardless of how many times quitAndInstall was called
  ;(updater as any).nativeUpdater.emit("update-downloaded")
  expect(handlerCount).toBe(1)
})

test("pathToFileURL encodes paths with spaces and special characters correctly", ({ expect }) => {
  // Verify that pathToFileURL produces a valid file:// URL for paths that contain
  // characters requiring percent-encoding (spaces, parentheses, etc.).
  // This covers the real-world scenario where the OS user account name has a space.
  const pathWithSpaces = "/Users/John Doe/Library/Caches/com.example.app/update.zip"
  const url = pathToFileURL(pathWithSpaces)

  expect(url.href).toMatch(/^file:\/\//)
  expect(url.href).toContain("John%20Doe")
  // Round-trip must restore the original path
  expect(fileURLToPath(url)).toBe(pathWithSpaces)
})
