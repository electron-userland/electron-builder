import { NodeHttpExecutor, serializeToYaml, TmpDir } from "builder-util"
import { AllPublishOptions, BlockMap, DownloadOptions } from "builder-util-runtime"
import { AppUpdater, NsisUpdater, type VerifyUpdateFile, type VerifyUpdateFileResult } from "electron-updater"
import { NoOpLogger, TestOnlyUpdaterOptions } from "electron-updater/src/AppUpdater"
import { ElectronHttpExecutor } from "electron-updater/src/electronHttpExecutor"
import { createHash } from "crypto"
import { EventEmitter } from "events"
import fsExtra from "fs-extra"
import type { OutgoingHttpHeaders, RequestOptions } from "http"
import * as path from "path"
import { PassThrough } from "stream"
import { gzipSync } from "zlib"
import { assertThat } from "./fileAssert.js"
import { TestAppAdapter } from "./TestAppAdapter.js"
import { type ExpectStatic, type Mock, vi } from "vitest"

const tmpDir = new TmpDir("updater-test-util")

export async function createTestAppAdapter(version = "0.0.1") {
  return new TestAppAdapter(version, await tmpDir.getTempDir())
}

export async function createNsisUpdater(version = "0.0.1") {
  const testAppAdapter = await createTestAppAdapter(version)
  const result = new NsisUpdater(null, testAppAdapter)
  tuneTestUpdater(result)
  return result
}

// to reduce difference in test mode, setFeedURL is not used to set (NsisUpdater also read configOnDisk to load original publisherName)
// The update installers the updater tests download are not Authenticode-signed, and NsisUpdater rejects an update when the config has
// no publisherName, so a config without publisherName opts out of the verification the way electron-builder writes it for
// win.verifyUpdateCodeSignature: false (unless the test sets verifyUpdateCodeSignature itself). Use writeRawUpdateConfig to write the
// config as given.
export async function writeUpdateConfig<T extends AllPublishOptions>(data: T): Promise<string> {
  const options: AllPublishOptions = data
  if (typeof options === "string" || options.publisherName != null || options.verifyUpdateCodeSignature !== undefined) {
    return await writeRawUpdateConfig(options)
  }
  return await writeRawUpdateConfig({ ...options, verifyUpdateCodeSignature: false })
}

/** Writes the update config exactly as given (see {@link writeUpdateConfig}). */
export async function writeRawUpdateConfig<T extends AllPublishOptions>(data: T): Promise<string> {
  const updateConfigPath = path.join(await tmpDir.getTempDir({ prefix: "test-update-config" }), "app-update.yml")
  await fsExtra.outputFile(updateConfigPath, serializeToYaml(data))
  return updateConfigPath
}

export async function validateDownload(expect: ExpectStatic, updater: AppUpdater, expectDownloadPromise = true) {
  const actualEvents = trackEvents(updater)

  const updateCheckResult = await updater.checkForUpdates()
  const assets = (updateCheckResult?.updateInfo as any).assets
  if (assets != null) {
    for (const asset of assets) {
      delete asset.download_count
    }
  }

  expect(updateCheckResult?.updateInfo).toMatchSnapshot()
  if (expectDownloadPromise) {
    // noinspection JSIgnoredPromiseFromCall
    expect(updateCheckResult?.downloadPromise).toBeDefined()
    const downloadResult = await updateCheckResult?.downloadPromise
    await assertThat(expect, downloadResult!.updateFile).isFile()
  } else {
    // An unexpected download outlives the test (and its update server): handle its outcome, so the test fails on the
    // assertion below rather than on an unhandled rejection reported after it
    updateCheckResult?.downloadPromise?.catch(() => undefined)
    expect(updateCheckResult?.downloadPromise).toBeUndefined()
  }

  expect(actualEvents).toMatchSnapshot()
  return updateCheckResult
}

/**
 * What a `verifyUpdateFile` hook saw at the moment it ran. Recorded inside the hook because the interesting facts are
 * about the state of the cache *during* verification — afterwards the failure path empties the whole pending-cache
 * directory, so a post-hoc `pathExists` check cannot tell "never renamed" from "renamed and then wiped".
 */
export type VerifyUpdateFileObservation = {
  updateFilePath: string
  originalUpdateFileName: string
  packageFilePath: string | undefined
  /** the file handed to the verifier was on disk when the verifier ran */
  updateFileExisted: boolean
  /** the installable path this update gets on success */
  finalFilePath: string
  /** a file already sat at the installable path when the verifier ran */
  finalFileExisted: boolean
}

export function createVerifyUpdateFileMock(onVerify: (params: Parameters<VerifyUpdateFile>[0]) => VerifyUpdateFileResult | Promise<VerifyUpdateFileResult>): {
  mock: Mock<VerifyUpdateFile>
  observations: Array<VerifyUpdateFileObservation>
} {
  const observations: Array<VerifyUpdateFileObservation> = []
  const mock = vi.fn<VerifyUpdateFile>(async params => {
    const finalFilePath = path.join(path.dirname(params.updateFilePath), params.originalUpdateFileName)
    observations.push({
      updateFilePath: params.updateFilePath,
      originalUpdateFileName: params.originalUpdateFileName,
      packageFilePath: params.packageFilePath,
      updateFileExisted: await fsExtra.pathExists(params.updateFilePath),
      finalFilePath,
      finalFileExisted: await fsExtra.pathExists(finalFilePath),
    })
    return await onVerify(params)
  })
  return { mock, observations }
}

type ExpectVerifyUpdateFileFailureParams = {
  expect: ExpectStatic
  downloadPromise: Promise<unknown> | null | undefined
  verifyUpdateFile: Mock<VerifyUpdateFile>
  observations: Array<VerifyUpdateFileObservation>
  expectedErrorMessageSubstring: string
}

/**
 * Asserts that a fresh download was aborted by `verifyUpdateFile` without the update ever becoming installable.
 */
export async function expectVerifyUpdateFileFailure({
  expect,
  downloadPromise,
  verifyUpdateFile,
  observations,
  expectedErrorMessageSubstring,
}: ExpectVerifyUpdateFileFailureParams): Promise<VerifyUpdateFileObservation> {
  // Test the external behavior: the download flow, observed from outside, aborts early with the verification error.
  expect(downloadPromise).toBeInstanceOf(Promise)
  await expect(downloadPromise).rejects.toMatchObject({
    code: "ERR_UPDATER_INVALID_UPDATE_FILE",
    message: expect.stringContaining(expectedErrorMessageSubstring),
  })

  // Test the internal behaviors:
  expect(verifyUpdateFile).toHaveBeenCalledTimes(1)
  // guaranteed non-empty by the call-count assertion above: the mock records an observation before it awaits onVerify
  const observation = observations[0]
  // The downloaded bytes were offered to the verifier under a temporary name...
  expect(path.basename(observation.updateFilePath)).toBe(`temp-${observation.originalUpdateFileName}`)
  expect(observation.updateFileExisted).toBe(true)
  // ...and, most importantly, the original filename held nothing at that point: an unverified file is never promoted
  // to the name it would be executed under.
  expect(observation.finalFileExisted).toBe(false)
  // Afterwards neither the temporary nor the original filename survives.
  await assertThat(expect, observation.updateFilePath).doesNotExist()
  await assertThat(expect, observation.finalFilePath).doesNotExist()
  return observation
}

export class TestNodeHttpExecutor extends NodeHttpExecutor {
  async download(url: string, destination: string, options: DownloadOptions): Promise<string> {
    const obj = new URL(url)
    const buffer = await this.downloadToBuffer(obj, options)
    await fsExtra.writeFile(destination, buffer)
    return buffer.toString()
  }
}

export const httpExecutor: TestNodeHttpExecutor = new TestNodeHttpExecutor()

/**
 * Creates a fresh per-test mock for httpExecutor.request.
 * Use this instead of vi.spyOn(httpExecutor, "request") to avoid shared-state
 * race conditions when tests run concurrently.
 *
 * Inject the result into each updater via:
 *   (updater as any).httpExecutor = { request: requestSpy }
 */
export function createMockRequest() {
  return vi.fn().mockRejectedValue(new Error("Unexpected HTTP request – mock it with mockResolvedValueOnce"))
}

export function tuneTestUpdater(updater: AppUpdater, options?: TestOnlyUpdaterOptions) {
  ;(updater as any).httpExecutor = httpExecutor
  ;(updater as any)._testOnlyOptions = {
    platform: "win32",
    ...options,
  }
  updater.logger = new NoOpLogger()
}

export function trackEvents(updater: AppUpdater) {
  const actualEvents: Array<string> = []
  for (const eventName of ["checking-for-update", "update-available", "update-downloaded", "error"] as const) {
    updater.addListener(eventName, () => {
      actualEvents.push(eventName)
    })
  }
  return actualEvents
}
export const OLD_VERSION_NUMBER = "1.0.0"
export const NEW_VERSION_NUMBER = "1.0.1"

export const testAppCacheDirName = "testapp-updater"

/** A block map of one file, `name`, with the given block checksums and sizes. */
export function blockMap(checksums: Array<string>, sizes: Array<number>, offset = 0, name = "file"): BlockMap {
  return { version: "2", files: [{ name, offset, checksums, sizes }] }
}

/** The block map of `data` cut into blocks of `blockSize` bytes (the last one can be shorter). */
export function blockMapOf(data: Buffer, blockSize: number): BlockMap {
  const checksums: Array<string> = []
  const sizes: Array<number> = []
  for (let i = 0; i < data.length; i += blockSize) {
    const block = data.subarray(i, i + blockSize)
    checksums.push(createHash("sha256").update(block).digest("base64"))
    sizes.push(block.length)
  }
  return blockMap(checksums, sizes)
}

/** {@link blockMapOf} as an update server serves it: gzipped JSON. */
export function gzippedBlockMapOf(data: Buffer, blockSize: number): Buffer {
  return gzipSync(JSON.stringify(blockMapOf(data, blockSize)))
}

/** A request sent by a {@link FakeNetRequest}: the first one, and one more for each redirect it follows itself. */
export interface FakeNetSentRequest {
  readonly url: string
  readonly headers: OutgoingHttpHeaders
}

/** How the fake host answers a request: with a redirect, or with a response. */
export type FakeNetAnswer = { readonly location: string } | { readonly statusCode: number; readonly headers?: Record<string, string>; readonly body?: Buffer }

export interface FakeNetRequestOptions {
  readonly url?: string
  readonly headers?: OutgoingHttpHeaders
  /** like Electron's net, "follow" by default */
  readonly redirect?: string
  /** without it, the request is never answered */
  readonly answer?: (url: string, headers: OutgoingHttpHeaders) => FakeNetAnswer
  readonly sent?: Array<FakeNetSentRequest>
}

/**
 * Stands in for Electron's net ClientRequest. Like the real one it never emits "socket", and with autoDestroy it would emit "close"
 * as soon as the request body is sent, long before the response. A redirect is reported as a "redirect" event: with
 * `redirect: "manual"` the request is then cancelled unless followRedirect() was called during the event, with "follow" it
 * goes on to the new URL, with the same headers, unless it was aborted.
 */
export class FakeNetRequest extends EventEmitter {
  aborted = false
  private url: string
  private readonly headers: OutgoingHttpHeaders
  private redirectCount = 0
  private isFollowRedirectCalled = false

  constructor(private readonly options: FakeNetRequestOptions = {}) {
    super()
    this.url = options.url ?? "https://example.com/"
    // like net.request, the headers are copied when the request is created
    this.headers = { ...options.headers }
  }

  end(): void {
    this.send()
  }

  followRedirect(): void {
    this.isFollowRedirectCalled = true
  }

  abort(): void {
    if (!this.aborted) {
      this.aborted = true
      this.emit("abort")
    }
  }

  private send(): void {
    const { answer: answerRequest, sent } = this.options
    if (answerRequest == null) {
      return
    }
    sent?.push({ url: this.url, headers: this.headers })
    setImmediate(() => {
      if (this.aborted) {
        return
      }
      const answer = answerRequest(this.url, this.headers)
      if ("location" in answer) {
        // Chromium's limit
        if (++this.redirectCount > 20) {
          this.emit("error", new Error("net::ERR_TOO_MANY_REDIRECTS"))
          return
        }
        this.isFollowRedirectCalled = false
        this.emit("redirect", 302, "GET", answer.location, {})
        if (this.aborted) {
          return
        }
        if (this.options.redirect === "manual" && !this.isFollowRedirectCalled) {
          this.emit("error", new Error("Redirect was cancelled"))
          return
        }
        this.url = answer.location
        this.send()
        return
      }
      const response = Object.assign(new PassThrough(), { statusCode: answer.statusCode, headers: answer.headers ?? {} })
      this.emit("response", response)
      response.end(answer.body)
    })
  }
}

/** An ElectronHttpExecutor whose requests are {@link FakeNetRequest}s answered by `answer`; `sent` lists what they sent. */
export class FakeElectronHttpExecutor extends ElectronHttpExecutor {
  readonly sent: Array<FakeNetSentRequest> = []
  /** createRequest throws for these URLs, as net.request does for options it cannot make a request of */
  readonly unrequestableUrls = new Set<string>()

  constructor(private readonly answer: (url: string, headers: OutgoingHttpHeaders) => FakeNetAnswer) {
    super()
  }

  // the return type of the overridden method is Electron's ClientRequest, which the fake does not implement
  createRequest(options: RequestOptions, callback: (response: any) => void): any {
    // like net.request: `host` (with its port) wins over `hostname` and `port`
    const host = options.host ?? `${options.hostname}${options.port == null ? "" : `:${options.port}`}`
    const redirect = "redirect" in options && typeof options.redirect === "string" ? options.redirect : undefined
    const url = `${options.protocol}//${host}${options.path}`
    // like net.request, which throws (rather than failing the request) for a protocol other than http: and https:
    if (options.protocol !== "http:" && options.protocol !== "https:") {
      throw new Error(`Protocol "${options.protocol}" not supported`)
    }
    if (this.unrequestableUrls.has(url)) {
      throw new Error(`Cannot create a request for ${url}`)
    }
    const request = new FakeNetRequest({ url, headers: options.headers, redirect, answer: this.answer, sent: this.sent })
    request.on("response", callback)
    return request
  }
}
