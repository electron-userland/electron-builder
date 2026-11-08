import { serializeToYaml, type TmpDir } from "builder-util"
import { GenericServerOptions } from "builder-util-runtime"
import { createHash } from "crypto"
import { MacUpdater } from "electron-updater"
import { ProviderPlatform } from "electron-updater/src/providers/Provider"
import { EventEmitter } from "events"
import fsExtra from "fs-extra"
import * as http from "http"
import type { IncomingHttpHeaders } from "http"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert.js"
import { createLocalServer } from "../helpers/launchAppCrossPlatform.js"
import { createTestAppAdapter, createVerifyUpdateFileMock, expectVerifyUpdateFileFailure, trackEvents, tuneTestUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil.js"
import { mockForNodeRequire } from "vitest-mock-commonjs"
import { vi } from "vitest"

interface RawResponse {
  statusCode: number
  headers: IncomingHttpHeaders
  body: Buffer
}

// node sends the userinfo of a URL as preemptive Basic auth; pass a URL without it for an unauthenticated request
function rawGet(url: string | URL, headers: Record<string, string> = {}, method = "GET"): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { headers, method }, response => {
      const chunks: Buffer[] = []
      response.on("data", chunk => chunks.push(chunk))
      response.on("end", () => resolve({ statusCode: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }))
      response.on("error", reject)
    })
    request.on("error", reject)
    // fail fast instead of hanging when the proxy server throws in its request handler
    request.setTimeout(5000, () => request.destroy(new Error(`no response from ${request.path}`)))
    request.end()
  })
}

function withoutCredentials(url: string): URL {
  const result = new URL(url)
  result.username = ""
  result.password = ""
  return result
}

// Squirrel.Mac requests the zip with a plain NSURLRequest (no setFeedURL headers): CFNetwork sends it without
// credentials and retries with the credentials in the URL only when the 401 carries a Basic challenge
async function squirrelZipRequest(zipUrl: string): Promise<RawResponse> {
  const first = await rawGet(withoutCredentials(zipUrl))
  if (first.statusCode !== 401 || !first.headers["www-authenticate"]?.startsWith("Basic ")) {
    return first
  }
  return rawGet(zipUrl)
}

class TestNativeUpdater extends EventEmitter {
  quitAndInstallCalls = 0
  feedUrl = ""
  // the headers from setFeedURL (incl. the Basic auth the proxy server requires), which Squirrel.Mac sends with the feed request
  feedHeaders: Record<string, string> = {}

  constructor(private readonly onCheckForUpdates: (nativeUpdater: TestNativeUpdater) => Promise<void> = squirrelDownload) {
    super()
  }

  // noinspection JSMethodCanBeStatic
  checkForUpdates() {
    this.onCheckForUpdates(this).catch(error => {
      this.emit("error", error)
    })
  }

  // noinspection JSMethodCanBeStatic
  setFeedURL(options: { url: string; headers?: Record<string, string> }) {
    this.feedUrl = options.url
    this.feedHeaders = options.headers ?? {}
  }

  quitAndInstall() {
    this.quitAndInstallCalls++
  }
}

async function squirrelDownload(nativeUpdater: TestNativeUpdater): Promise<void> {
  const feed = await rawGet(nativeUpdater.feedUrl, nativeUpdater.feedHeaders)
  if (feed.statusCode !== 200) {
    throw new Error(`feed request failed with ${feed.statusCode}`)
  }
  const zip = await squirrelZipRequest(JSON.parse(feed.body.toString()).url)
  if (zip.statusCode !== 200) {
    throw new Error(`zip request failed with ${zip.statusCode}`)
  }
}

test.ifMac("quitAndInstall handles one future native download", async ({ expect }) => {
  const mockNativeUpdater = new TestNativeUpdater()
  mockForNodeRequire("electron", { autoUpdater: mockNativeUpdater })
  const updater = new MacUpdater(undefined, await createTestAppAdapter())

  updater.quitAndInstall()
  mockNativeUpdater.emit("update-downloaded")
  mockNativeUpdater.emit("update-downloaded")

  expect(mockNativeUpdater.quitAndInstallCalls).toBe(1)
})
const MAC_ZIP_NAME = "TestApp-1.1.0-mac.zip"
const MAC_ZIP_CONTENT = Buffer.from("electron-builder localhost update-server test zip payload — not a real archive")

/**
 * Serves a synthetic mac update (latest-mac.yml + zip) from a localhost static server, for the generic provider.
 */
async function serveMacUpdate(tmpDir: TmpDir, prefix: string): Promise<{ port: number; close: () => void }> {
  const sha512 = createHash("sha512").update(MAC_ZIP_CONTENT).digest("base64")
  const root = await tmpDir.getTempDir({ prefix })
  await fsExtra.outputFile(
    path.join(root, "latest-mac.yml"),
    serializeToYaml({
      version: "1.1.0",
      files: [{ url: MAC_ZIP_NAME, sha512, size: MAC_ZIP_CONTENT.length }],
      path: MAC_ZIP_NAME,
      sha512,
      releaseDate: "2024-01-01T00:00:00.000Z",
    })
  )
  await fsExtra.outputFile(path.join(root, MAC_ZIP_NAME), MAC_ZIP_CONTENT)
  const { server, port } = await createLocalServer(root)
  return {
    port,
    close: () => server.close(),
  }
}

test.ifMac("mac updates", async ({ expect, tmpDir }) => {
  const mockNativeUpdater = new TestNativeUpdater()

  mockForNodeRequire("electron", {
    autoUpdater: mockNativeUpdater,
  })

  // MacUpdater then proxies the downloaded zip to the (mocked) Squirrel.Mac updater
  const { port, close } = await serveMacUpdate(tmpDir, "mac-updater-test")

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
    const { updateFile, packageFile } = (await updateCheckResult!.downloadPromise)!
    expect(packageFile).toBeUndefined()
    await assertThat(expect, updateFile).isFile()
    expect(actualEvents).toMatchSnapshot()
  } finally {
    close()
  }
})

test.ifMac("mac updates abort when verifyUpdateFile rejects the downloaded temp zip", async ({ expect, tmpDir }) => {
  const mockNativeUpdater = new TestNativeUpdater()

  mockForNodeRequire("electron", {
    autoUpdater: mockNativeUpdater,
  })

  const { port, close } = await serveMacUpdate(tmpDir, "mac-updater-verify-hook-test")

  try {
    const updater = new MacUpdater(undefined, await createTestAppAdapter())
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
      provider: "generic",
      url: `http://127.0.0.1:${port}`,
    })

    const { mock, observations } = createVerifyUpdateFileMock(() => ({ response: "failure", message: "custom verification failed" }))
    updater.verifyUpdateFile = mock

    tuneTestUpdater(updater)
    updater._testOnlyOptions!.platform = process.platform as ProviderPlatform
    const actualEvents = trackEvents(updater)
    const updateCheckResult = await updater.checkForUpdates()

    const observation = await expectVerifyUpdateFileFailure({
      expect,
      downloadPromise: updateCheckResult?.downloadPromise,
      verifyUpdateFile: mock,
      observations,
      expectedErrorMessageSubstring: "custom verification failed",
    })

    expect(observation.originalUpdateFileName).toBe(MAC_ZIP_NAME)
    expect(actualEvents).toEqual(["checking-for-update", "update-available", "error"])
  } finally {
    close()
  }
})

test.ifMac("mac update proxy requires the credentials on every route", async ({ expect, tmpDir }) => {
  const probes: Record<string, RawResponse> = {}
  let zipUrl = ""
  const probe = async (nativeUpdater: TestNativeUpdater) => {
    const authorization = nativeUpdater.feedHeaders.Authorization
    const pass = Buffer.from(authorization.slice("Basic ".length), "base64").toString("ascii").slice("autoupdater:".length)
    const wrongPass = pass.replace(/^./, c => (c === "0" ? "1" : "0"))
    const basic = (password: string) => ({ Authorization: `Basic ${Buffer.from(`autoupdater:${password}`).toString("base64")}` })

    probes.feedWithoutCredentials = await rawGet(nativeUpdater.feedUrl)
    probes.feedWithWrongPassword = await rawGet(nativeUpdater.feedUrl, basic(wrongPass))
    probes.feedWithShortHeader = await rawGet(nativeUpdater.feedUrl, { Authorization: "Basic x" })
    probes.feed = await rawGet(nativeUpdater.feedUrl, nativeUpdater.feedHeaders)
    zipUrl = JSON.parse(probes.feed.body.toString()).url
    probes.zipWithoutCredentials = await rawGet(withoutCredentials(zipUrl))
    probes.zipWithWrongPassword = await rawGet(withoutCredentials(zipUrl), basic(wrongPass))
    probes.unknownPathWithCredentials = await rawGet(new URL("/other.zip", zipUrl))
    probes.feedPost = await rawGet(nativeUpdater.feedUrl, nativeUpdater.feedHeaders, "POST")
    probes.zipHead = await rawGet(zipUrl, {}, "HEAD")
    probes.zipPost = await rawGet(zipUrl, {}, "POST")
    // a HEAD or POST on the zip route must not have completed the download
    downloadSettledBeforeZip = downloadSettled
    // last: serving the zip completes the download
    probes.zip = await squirrelZipRequest(zipUrl)
  }
  let downloadSettled = false
  let downloadSettledBeforeZip: boolean | undefined
  // the download resolves once the zip response is sent, which can be before the probe has read it
  let probing: Promise<void> = Promise.resolve()
  const mockNativeUpdater = new TestNativeUpdater(nativeUpdater => (probing = probe(nativeUpdater)))
  mockForNodeRequire("electron", { autoUpdater: mockNativeUpdater })

  const { port, close } = await serveMacUpdate(tmpDir, "mac-updater-proxy-auth-test")
  try {
    const updater = new MacUpdater(undefined, await createTestAppAdapter())
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
      provider: "generic",
      url: `http://127.0.0.1:${port}`,
    })
    tuneTestUpdater(updater)
    updater._testOnlyOptions!.platform = process.platform as ProviderPlatform

    const updateCheckResult = await updater.checkForUpdates()
    await updateCheckResult?.downloadPromise?.finally(() => (downloadSettled = true))
    await probing

    for (const name of ["feedWithoutCredentials", "feedWithWrongPassword", "feedWithShortHeader", "zipWithoutCredentials", "zipWithWrongPassword"]) {
      expect(probes[name].statusCode, name).toBe(401)
      expect(probes[name].headers["www-authenticate"], name).toBe('Basic realm="electron-updater"')
      expect(probes[name].body.length, name).toBe(0)
    }
    expect(probes.feed.statusCode).toBe(200)
    const parsedZipUrl = new URL(zipUrl)
    expect(parsedZipUrl.username).toBe("autoupdater")
    expect(parsedZipUrl.password).toMatch(/^[0-9a-f]{128}$/)
    expect(probes.unknownPathWithCredentials.statusCode).toBe(404)
    for (const name of ["feedPost", "zipHead", "zipPost"]) {
      expect(probes[name].statusCode, name).toBe(405)
      expect(probes[name].headers.allow, name).toBe("GET")
    }
    expect(downloadSettledBeforeZip).toBe(false)
    expect(probes.zip.statusCode).toBe(200)
    expect(probes.zip.body).toEqual(MAC_ZIP_CONTENT)
  } finally {
    close()
  }
})

test.ifMac("mac update proxy server failing to listen rejects the download", async ({ expect, tmpDir }) => {
  const mockNativeUpdater = new TestNativeUpdater()
  mockForNodeRequire("electron", { autoUpdater: mockNativeUpdater })

  const { port, close } = await serveMacUpdate(tmpDir, "mac-updater-proxy-listen-error-test")
  // the update server above is already listening, so the next listen is the proxy server's
  const listen = vi.spyOn(http.Server.prototype, "listen").mockImplementationOnce(function (this: http.Server) {
    process.nextTick(() => this.emit("error", new Error("listen EADDRNOTAVAIL: address not available 127.0.0.1")))
    return this
  })
  try {
    const updater = new MacUpdater(undefined, await createTestAppAdapter())
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
      provider: "generic",
      url: `http://127.0.0.1:${port}`,
    })
    tuneTestUpdater(updater)
    updater._testOnlyOptions!.platform = process.platform as ProviderPlatform
    const actualEvents = trackEvents(updater)

    const updateCheckResult = await updater.checkForUpdates()
    await expect(updateCheckResult?.downloadPromise).rejects.toMatchObject({ code: "ERR_UPDATER_MAC_PROXY_SERVER_FAILED" })
    expect(listen).toHaveBeenCalledTimes(1)
    expect(actualEvents).toEqual(["checking-for-update", "update-available", "error"])
  } finally {
    listen.mockRestore()
    close()
  }
})

test.ifMac("a second mac download closes the previous proxy server, so its credentials stop working", async ({ expect, tmpDir }) => {
  const feeds: { url: string; headers: Record<string, string> }[] = []
  const mockNativeUpdater = new TestNativeUpdater(nativeUpdater => {
    feeds.push({ url: nativeUpdater.feedUrl, headers: nativeUpdater.feedHeaders })
    return squirrelDownload(nativeUpdater)
  })
  mockForNodeRequire("electron", { autoUpdater: mockNativeUpdater })

  const { port, close } = await serveMacUpdate(tmpDir, "mac-updater-proxy-replaced-test")
  try {
    const updater = new MacUpdater(undefined, await createTestAppAdapter())
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
      provider: "generic",
      url: `http://127.0.0.1:${port}`,
    })
    tuneTestUpdater(updater)
    updater._testOnlyOptions!.platform = process.platform as ProviderPlatform

    const updateCheckResult = await updater.checkForUpdates()
    await updateCheckResult?.downloadPromise
    // served from the download cache: only the proxy server and its credentials are replaced
    await updater.downloadUpdate()

    expect(feeds).toHaveLength(2)
    const [first, second] = feeds
    expect(second.headers.Authorization).not.toBe(first.headers.Authorization)
    // the first server is closed; should the second one get its port, it still rejects the first credentials
    const stale = await rawGet(first.url, first.headers).then(
      response => response.statusCode,
      (error: NodeJS.ErrnoException) => error.code
    )
    expect([401, "ECONNREFUSED"]).toContain(stale)
    expect((await rawGet(second.url, first.headers)).statusCode).toBe(401)
    expect((await rawGet(second.url, second.headers)).statusCode).toBe(200)
  } finally {
    close()
  }
})
