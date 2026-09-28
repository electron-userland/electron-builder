import { NodeHttpExecutor, serializeToYaml, TmpDir } from "builder-util"
import { AllPublishOptions, DownloadOptions } from "builder-util-runtime"
import { AppUpdater, NsisUpdater, type VerifyUpdateFile, type VerifyUpdateFileResult } from "electron-updater"
import { NoOpLogger, TestOnlyUpdaterOptions } from "electron-updater/src/AppUpdater"
import fsExtra from "fs-extra"
import * as path from "path"
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
export async function writeUpdateConfig<T extends AllPublishOptions>(data: T): Promise<string> {
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
    // noinspection JSIgnoredPromiseFromCall
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
  const observation = observations[0]
  expect(observation).toBeDefined()
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
