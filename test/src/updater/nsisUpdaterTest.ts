import { GenericServerOptions, S3Options } from "builder-util-runtime"
import { NsisUpdater, UpdateCheckResult } from "electron-updater"
import fs from "fs"
import fsExtra from "fs-extra"
import { createHash } from "crypto"
import * as http from "http"
import type { Socket } from "net"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert.js"
import { removeUnstableProperties } from "../helpers/packTester.js"
import {
  createNsisUpdater,
  createTestAppAdapter,
  createVerifyUpdateFileMock,
  expectVerifyUpdateFileFailure,
  trackEvents,
  tuneTestUpdater,
  validateDownload,
  writeRawUpdateConfig,
  writeUpdateConfig,
} from "../helpers/updaterTestUtil.js"
import { createLocalServer } from "../helpers/launchAppCrossPlatform.js"
import { serializeToYaml, TmpDir } from "builder-util"
import { afterEach, ExpectStatic, vi } from "vitest"

const config = { retry: 3 }

// The current user cannot write to `files` or create files in `dirs`: NsisUpdater finds out by trying (Node's fs.access does not read
// Windows ACLs), and those attempts fail with `code`. Every other path is opened as usual. Restore with vi.restoreAllMocks().
function denyWrites(files: Array<string>, dirs: Array<string>, code = "EACCES") {
  const openSync = fs.openSync
  return vi.spyOn(fs, "openSync").mockImplementation((file: fs.PathLike, flags?: fs.OpenMode, mode?: fs.Mode | null) => {
    const target = String(file)
    if ((flags === "r+" && files.includes(target)) || (flags === "wx" && dirs.includes(path.dirname(target)))) {
      throw Object.assign(new Error(`${code}: open '${target}'`), { code })
    }
    return openSync(file, flags ?? "r", mode)
  })
}

// All update payloads are served from an in-repo localhost static server (createLocalServer) via the
// generic provider — the exact download path the s3/spaces providers resolve to at runtime (see
// providerFactory.ts / providerFactoryTest.ts). GitHub/GitLab/Keygen/Bitbucket request-building and
// response-parsing are covered offline in test/src/provider/*ProviderTest.ts with mocked channel data.
const UPDATE_VERSION = "1.1.0"
const INSTALLER_CONTENT = Buffer.from("electron-builder localhost update-server test installer payload — not a real executable")
// fixed date so updateInfo snapshots stay deterministic
const RELEASE_DATE = "2024-01-01T00:00:00.000Z"

function installerName(version: string) {
  return `TestApp Setup ${version}.exe`
}

function channelYml(options: { version?: string; sha512?: string; stagingPercentage?: number; webInstallerPackage?: { fileName: string; content: Buffer } } = {}): string {
  const version = options.version ?? UPDATE_VERSION
  const fileName = installerName(version)
  const sha512 = options.sha512 ?? createHash("sha512").update(INSTALLER_CONTENT).digest("base64")
  const info: any = {
    version,
    files: [{ url: fileName, sha512, size: INSTALLER_CONTENT.length }],
    path: fileName,
    sha512,
    releaseDate: RELEASE_DATE,
  }
  if (options.stagingPercentage != null) {
    info.stagingPercentage = options.stagingPercentage
  }
  if (options.webInstallerPackage != null) {
    const { fileName: packageFileName, content } = options.webInstallerPackage
    info.packages = {
      [process.arch]: {
        file: packageFileName,
        path: packageFileName,
        sha512: createHash("sha512").update(content).digest("base64"),
        size: content.length,
      },
    }
  }
  return serializeToYaml(info)
}

/**
 * Writes the given files into a temp dir and serves them over a localhost static server.
 * Pass file paths relative to the server root (subdirectories are supported).
 */
async function serveUpdate(files: Record<string, string | Buffer>): Promise<{ url: string; close: () => Promise<void> }> {
  const tmpDir = new TmpDir("nsis-updater-local-server")
  const root = await tmpDir.getTempDir()
  for (const [name, content] of Object.entries(files)) {
    await fsExtra.outputFile(path.join(root, name), content)
  }
  const { server, port } = await createLocalServer(root)
  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      server.close()
      await tmpDir.cleanup()
    },
  }
}

function serveDefaultUpdate() {
  return serveUpdate({
    "latest.yml": channelYml(),
    [installerName(UPDATE_VERSION)]: INSTALLER_CONTENT,
  })
}

test("downgrade (disallowed, beta)", config, async ({ expect }) => {
  // served version is older than the current beta app version — no update must be offered
  const { url, close } = await serveUpdate({ "latest.yml": channelYml({ version: "1.0.0" }) })
  try {
    const updater = await createNsisUpdater("1.5.2-beta.4")
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url })

    const actualEvents: Array<string> = []
    const expectedEvents = ["checking-for-update", "update-not-available"] as const
    for (const eventName of expectedEvents) {
      updater.addListener(eventName, () => {
        actualEvents.push(eventName)
      })
    }

    const updateCheckResult = await updater.checkForUpdates()
    expect(removeUnstableProperties(updateCheckResult?.updateInfo)).toMatchSnapshot()
    // noinspection JSIgnoredPromiseFromCall
    expect(updateCheckResult?.downloadPromise).toBeUndefined()

    expect(actualEvents).toEqual(expectedEvents)
  } finally {
    await close()
  }
})

test("file url generic", config, async ({ expect }) => {
  const { url, close } = await serveDefaultUpdate()
  try {
    const updater = await createNsisUpdater()
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url })
    await validateDownload(expect, updater)
  } finally {
    await close()
  }
})

// verifyUpdateFile is an inherited property, see baseUpdaterUnitTest.ts for test coverage on the parent class.
test("file url generic aborts when verifyUpdateFile rejects the downloaded temp file", config, async ({ expect }) => {
  const { url, close } = await serveDefaultUpdate()
  try {
    const updater = await createNsisUpdater()
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url })
    const { mock, observations } = createVerifyUpdateFileMock(() => ({ response: "failure", message: "custom verification failed" }))
    updater.verifyUpdateFile = mock

    const actualEvents = trackEvents(updater)
    const updateCheckResult = await updater.checkForUpdates()

    const observation = await expectVerifyUpdateFileFailure({
      expect,
      downloadPromise: updateCheckResult?.downloadPromise,
      verifyUpdateFile: mock,
      observations,
      expectedErrorMessageSubstring: "custom verification failed",
    })
    expect(observation.originalUpdateFileName).toBe(installerName(UPDATE_VERSION))
    expect(actualEvents).toEqual(["checking-for-update", "update-available", "error"])
  } finally {
    await close()
  }
})

test("web installer passes packageFilePath to verifyUpdateFile", config, async ({ expect }) => {
  const packageFileName = `TestApp-${UPDATE_VERSION}.nsis.7z`
  const packageContent = Buffer.from("electron-builder localhost update-server test nsis-web package payload")
  const { url, close } = await serveUpdate({
    "latest.yml": channelYml({ webInstallerPackage: { fileName: packageFileName, content: packageContent } }),
    [installerName(UPDATE_VERSION)]: INSTALLER_CONTENT,
    [packageFileName]: packageContent,
  })
  try {
    const updater = await createNsisUpdater()
    updater.disableWebInstaller = false
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url })

    let packageFileExistedDuringVerification = false
    const { mock, observations } = createVerifyUpdateFileMock(async params => {
      packageFileExistedDuringVerification = await fsExtra.pathExists(params.packageFilePath!)
      return { response: "failure", message: "custom verification failed" }
    })
    updater.verifyUpdateFile = mock

    const updateCheckResult = await updater.checkForUpdates()
    const observation = await expectVerifyUpdateFileFailure({
      expect,
      downloadPromise: updateCheckResult?.downloadPromise,
      verifyUpdateFile: mock,
      observations,
      expectedErrorMessageSubstring: "custom verification failed",
    })

    expect(observation.originalUpdateFileName).toBe(installerName(UPDATE_VERSION))
    expect(path.basename(observation.packageFilePath!)).toBe(`package-${UPDATE_VERSION}.7z`)
    expect(packageFileExistedDuringVerification).toBe(true)
    await assertThat(expect, observation.packageFilePath!).doesNotExist()
  } finally {
    await close()
  }
})

test("verifyUpdateFile also gates a cached update reused after an app relaunch", config, async ({ expect }) => {
  const { url, close } = await serveDefaultUpdate()
  try {
    // both updaters share one app adapter, so the second one reads the cache the first one wrote — the
    // cross-launch branch of validateDownloadedPath (update-info.json + re-hash), not the in-session one
    const appAdapter = await createTestAppAdapter()
    const updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url })

    const firstLaunch = new NsisUpdater(null, appAdapter)
    tuneTestUpdater(firstLaunch)
    firstLaunch.updateConfigPath = updateConfigPath
    const accepting = createVerifyUpdateFileMock(() => ({ response: "success" }))
    firstLaunch.verifyUpdateFile = accepting.mock
    const firstDownload = await (await firstLaunch.checkForUpdates())?.downloadPromise
    await assertThat(expect, firstDownload!.updateFile).isFile()

    // a fresh updater instance, as after a restart: nothing is downloaded again, but the verifier must still run
    const secondLaunch = new NsisUpdater(null, appAdapter)
    tuneTestUpdater(secondLaunch)
    secondLaunch.updateConfigPath = updateConfigPath
    const rejecting = createVerifyUpdateFileMock(() => ({ response: "failure", message: "stale cached file rejected" }))
    secondLaunch.verifyUpdateFile = rejecting.mock

    await expect((await secondLaunch.checkForUpdates())?.downloadPromise).rejects.toMatchObject({
      code: "ERR_UPDATER_INVALID_UPDATE_FILE",
      message: expect.stringContaining("stale cached file rejected"),
    })

    expect(rejecting.mock).toHaveBeenCalledTimes(1)
    expect(rejecting.observations[0].updateFilePath).toBe(firstDownload!.updateFile)
    await assertThat(expect, firstDownload!.updateFile).doesNotExist()
  } finally {
    await close()
  }
})

test("the installer signature is verified again for a cached update reused after an app relaunch", config, async ({ expect }) => {
  const { url, close } = await serveDefaultUpdate()
  try {
    const appAdapter = await createTestAppAdapter()
    const updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url })

    const firstLaunch = new NsisUpdater(null, appAdapter)
    tuneTestUpdater(firstLaunch)
    firstLaunch.updateConfigPath = updateConfigPath
    const firstDownload = await (await firstLaunch.checkForUpdates())?.downloadPromise
    await assertThat(expect, firstDownload!.updateFile).isFile()

    // a fresh updater instance, as after a restart: nothing is downloaded again, but the signature is verified again
    const secondLaunch = new NsisUpdater(null, appAdapter)
    tuneTestUpdater(secondLaunch)
    secondLaunch.updateConfigPath = updateConfigPath
    const verifySignature = vi.spyOn(secondLaunch as any, "verifySignature").mockResolvedValue({ response: "failure", message: "signed by someone else" })

    await expect((await secondLaunch.checkForUpdates())?.downloadPromise).rejects.toMatchObject({
      code: "ERR_UPDATER_INVALID_SIGNATURE",
      message: expect.stringContaining("signed by someone else"),
    })

    expect(verifySignature).toHaveBeenCalledWith(firstDownload!.updateFile, expect.anything())
    await assertThat(expect, firstDownload!.updateFile).doesNotExist()
  } finally {
    await close()
  }
})

test("verifyUpdateFile also gates an update reused from the cache in the same session", config, async ({ expect }) => {
  const { url, close } = await serveDefaultUpdate()
  try {
    const updater = await createNsisUpdater()
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url })

    // first round: the verifier accepts, so the update lands in the cache under its real filename
    const accepting = createVerifyUpdateFileMock(() => ({ response: "success" }))
    updater.verifyUpdateFile = accepting.mock
    const firstDownload = await (await updater.checkForUpdates())?.downloadPromise
    expect(accepting.mock).toHaveBeenCalledTimes(1)
    await assertThat(expect, firstDownload!.updateFile).isFile()

    // second round: nothing is downloaded again, but the verifier must still get to inspect the cached file
    const rejecting = createVerifyUpdateFileMock(() => ({ response: "failure", message: "cached file rejected" }))
    updater.verifyUpdateFile = rejecting.mock
    const actualEvents = trackEvents(updater)
    await expect((await updater.checkForUpdates())?.downloadPromise).rejects.toMatchObject({
      code: "ERR_UPDATER_INVALID_UPDATE_FILE",
      message: expect.stringContaining("cached file rejected"),
    })

    expect(rejecting.mock).toHaveBeenCalledTimes(1)
    const [observation] = rejecting.observations
    // the cached file is re-verified at its real name — there is no temporary name to quarantine it under
    expect(observation.updateFilePath).toBe(firstDownload!.updateFile)
    expect(observation.updateFileExisted).toBe(true)
    // and a rejected cached file does not survive to be installed
    await assertThat(expect, observation.updateFilePath).doesNotExist()
    expect(actualEvents).toEqual(["checking-for-update", "update-available", "error"])
  } finally {
    await close()
  }
})

// TestNodeHttpExecutor.download() buffers the response without streaming through DigestTransform,
// so the sha512 of the payload is never validated — a mismatch cannot be observed with the test
// executor. Requires a streaming executor to work correctly.
test.skip("sha512 mismatch error event", config, async ({ expect }) => {
  const { url, close } = await serveUpdate({
    "beta.yml": channelYml({ sha512: Buffer.alloc(64, 1).toString("base64") }),
    [installerName(UPDATE_VERSION)]: INSTALLER_CONTENT,
  })
  try {
    const updater = await createNsisUpdater()
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url, channel: "beta" })

    const actualEvents = trackEvents(updater)

    const updateCheckResult = await updater.checkForUpdates()
    expect(removeUnstableProperties(updateCheckResult?.updateInfo)).toMatchSnapshot()
    await assertThat(expect, updateCheckResult?.downloadPromise).throws()

    expect(actualEvents).toMatchSnapshot()
  } finally {
    await close()
  }
})

test("file url generic - manual download", config, async ({ expect }) => {
  const { url, close } = await serveDefaultUpdate()
  try {
    const updater = await createNsisUpdater()
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url })
    updater.autoDownload = false

    const actualEvents = trackEvents(updater)

    const updateCheckResult = await updater.checkForUpdates()
    expect(removeUnstableProperties(updateCheckResult?.updateInfo)).toMatchSnapshot()
    // noinspection JSIgnoredPromiseFromCall
    expect(updateCheckResult?.downloadPromise).toBeNull()
    expect(actualEvents).toMatchSnapshot()

    await assertThat(expect, (await updater.downloadUpdate()).updateFile).isFile()
  } finally {
    await close()
  }
})

// https://github.com/electron-userland/electron-builder/issues/1045
test("checkForUpdates several times", config, async ({ expect }) => {
  const { url, close } = await serveDefaultUpdate()
  try {
    const updater = await createNsisUpdater()
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url })

    const actualEvents = trackEvents(updater)

    for (let i = 0; i < 10; i++) {
      //noinspection JSIgnoredPromiseFromCall
      void updater.checkForUpdates()
    }

    async function checkForUpdates() {
      const updateCheckResult = await updater.checkForUpdates()
      expect(removeUnstableProperties(updateCheckResult?.updateInfo)).toMatchSnapshot()
      await checkDownloadPromise(expect, updateCheckResult)
    }

    await checkForUpdates()
    // we must not download the same file again
    await checkForUpdates()

    expect(actualEvents).toMatchSnapshot()
  } finally {
    await close()
  }
})

async function checkDownloadPromise(expect: ExpectStatic, updateCheckResult: UpdateCheckResult | null) {
  return await assertThat(expect, (await updateCheckResult!.downloadPromise)!.updateFile).isFile()
}

test("test error", config, async ({ expect }) => {
  const updater = await createNsisUpdater("0.0.1")
  const actualEvents = trackEvents(updater)

  await assertThat(expect, updater.checkForUpdates()).throws()
  expect(actualEvents).toMatchSnapshot()
})

// TestNodeHttpExecutor.download() buffers the full response before writing — onProgress is never
// called, so progressEvents is always empty. Requires a streaming executor to work correctly.
test.skip("test download progress", config, async ({ expect }) => {
  const { url, close } = await serveDefaultUpdate()
  try {
    const updater = await createNsisUpdater("0.0.1")
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url })
    updater.autoDownload = false

    const progressEvents: Array<any> = []

    updater.signals.progress(it => progressEvents.push(it))

    await updater.checkForUpdates()
    await updater.downloadUpdate()

    expect(progressEvents.length).toBeGreaterThanOrEqual(1)

    const lastEvent = progressEvents.pop()

    expect(lastEvent.percent).toBe(100)
    expect(lastEvent.bytesPerSecond).toBeGreaterThan(1)
    expect(lastEvent.transferred).toBe(lastEvent.total)
  } finally {
    await close()
  }
})

// Without PowerShell (any non-Windows host), the built-in Authenticode verifier cannot verify the update, so it fails closed:
// before v27 it skipped the verification with a warning and accepted the update. Verifying a genuinely signed installer is
// covered by the real-certificate e2e tests in windowsExecutableCodeSignatureVerifierTest.
test.ifNotWindows("fails closed when the signature cannot be verified (no PowerShell)", config, async ({ expect }) => {
  const { url, close } = await serveDefaultUpdate()
  try {
    const updater = await createNsisUpdater("0.0.1")
    updater.updateConfigPath = await writeUpdateConfig({
      provider: "generic",
      url,
      publisherName: ["CN=Vladimir Krivosheev, O=Vladimir Krivosheev, L=Grunwald, S=Bayern, C=DE"],
    })
    const actualEvents = trackEvents(updater)
    const updateCheckResult = await updater.checkForUpdates()
    await expect(updateCheckResult?.downloadPromise).rejects.toMatchObject({
      code: "ERR_UPDATER_SIGNATURE_UNVERIFIABLE",
      message: expect.stringContaining("Cannot verify the Authenticode signature of the update"),
    })
    expect(actualEvents).toEqual(["checking-for-update", "update-available", "error"])
  } finally {
    await close()
  }
})

// the served installer payload is not Authenticode-signed, so the real Windows verifier must reject it
test.ifWindows("invalid signature", config, async ({ expect }) => {
  const { url, close } = await serveDefaultUpdate()
  try {
    const updater = await createNsisUpdater("0.0.1")
    updater.updateConfigPath = await writeUpdateConfig({
      provider: "generic",
      url,
      publisherName: ["CN=Foo Bar, O=Foo Bar"],
    })
    const actualEvents = trackEvents(updater)
    await assertThat(
      expect,
      updater.checkForUpdates().then((it): any => it?.downloadPromise)
    ).throws()
    expect(actualEvents).toMatchSnapshot()
  } finally {
    await close()
  }
})

test.ifWindows("test custom signature verifier", config, async ({ expect }) => {
  const { url, close } = await serveDefaultUpdate()
  try {
    const updater = await createNsisUpdater("1.0.2")
    updater.updateConfigPath = await writeUpdateConfig({
      provider: "generic",
      url,
      publisherName: ["CN=Vladimir Krivosheev, O=Vladimir Krivosheev, L=Grunwald, S=Bayern, C=DE"],
    })
    updater.verifyUpdateFileAuthenticodeSignature = (_publisherName: string[], _path: string) => {
      return Promise.resolve({ response: "success" })
    }
    await validateDownload(expect, updater)
  } finally {
    await close()
  }
})

test.ifWindows("test custom signature verifier - signing error message", config, async ({ expect }) => {
  const { url, close } = await serveDefaultUpdate()
  try {
    const updater = await createNsisUpdater("1.0.2")
    updater.updateConfigPath = await writeUpdateConfig({
      provider: "generic",
      url,
      publisherName: ["CN=Vladimir Krivosheev, O=Vladimir Krivosheev, L=Grunwald, S=Bayern, C=DE"],
    })
    updater.verifyUpdateFileAuthenticodeSignature = (_publisherName: string[], _path: string) => {
      return Promise.resolve({ response: "failure", message: "signature verification failed" })
    }
    const actualEvents = trackEvents(updater)
    await assertThat(
      expect,
      updater.checkForUpdates().then((it): any => it?.downloadPromise)
    ).throws()
    expect(actualEvents).toMatchSnapshot()
  } finally {
    await close()
  }
})

test("malformed custom signature verifier result fails closed", config, async ({ expect }) => {
  const { url, close } = await serveDefaultUpdate()
  try {
    const updater = await createNsisUpdater("1.0.2")
    updater.updateConfigPath = await writeUpdateConfig({
      provider: "generic",
      url,
      publisherName: ["CN=Vladimir Krivosheev, O=Vladimir Krivosheev, L=Grunwald, S=Bayern, C=DE"],
    })
    // @ts-expect-error intentionally violating the verifier contract to cover fail-closed behavior
    updater.verifyUpdateFileAuthenticodeSignature = async (_publisherName: string[], _path: string) => null
    const actualEvents = trackEvents(updater)
    const updateCheckResult = await updater.checkForUpdates()

    await expect(updateCheckResult?.downloadPromise).rejects.toMatchObject({
      code: "ERR_UPDATER_INVALID_SIGNATURE",
      message: expect.stringContaining("unknown error"),
    })
    expect(actualEvents).toEqual(["checking-for-update", "update-available", "error"])
  } finally {
    await close()
  }
})

// electron-updater 7 fails closed: an app-update.yml without publisherName rejects the downloaded update (even with a custom verifier,
// which is not called), unless it opts out with verifyUpdateCodeSignature: false
test("missing publisherName rejects the downloaded update", config, async ({ expect }) => {
  const { url, close } = await serveDefaultUpdate()
  try {
    const updater = await createNsisUpdater("1.0.2")
    updater.updateConfigPath = await writeRawUpdateConfig<GenericServerOptions>({ provider: "generic", url })
    const verifier = vi.fn(async () => ({ response: "success" as const }))
    updater.verifyUpdateFileAuthenticodeSignature = verifier
    const actualEvents = trackEvents(updater)
    const updateCheckResult = await updater.checkForUpdates()

    await expect(updateCheckResult?.downloadPromise).rejects.toMatchObject({
      code: "ERR_UPDATER_INVALID_SIGNATURE",
      message: expect.stringContaining("v27-build-changes#missing-publishername-fails-update-verification"),
    })
    expect(verifier).not.toHaveBeenCalled()
    expect(actualEvents).toEqual(["checking-for-update", "update-available", "error"])
  } finally {
    await close()
  }
})

test("verifyUpdateCodeSignature: false in app-update.yml installs the update unverified", config, async ({ expect }) => {
  const { url, close } = await serveDefaultUpdate()
  try {
    const updater = await createNsisUpdater("1.0.2")
    updater.updateConfigPath = await writeRawUpdateConfig<GenericServerOptions>({ provider: "generic", url, verifyUpdateCodeSignature: false })
    const verifier = vi.fn(async () => ({ response: "failure" as const, message: "must not be called" }))
    updater.verifyUpdateFileAuthenticodeSignature = verifier
    const updateCheckResult = await updater.checkForUpdates()

    await expect(updateCheckResult?.downloadPromise).resolves.toBeDefined()
    expect(verifier).not.toHaveBeenCalled()
  } finally {
    await close()
  }
})

// the s3 provider resolves to GenericProvider at runtime, so an explicit localhost endpoint exercises
// the identical code path the real bucket did
function s3UpdateConfig(url: string, channel: string): S3Options {
  return {
    provider: "s3",
    endpoint: url,
    bucket: "test-bucket",
    path: "test",
    channel,
  }
}

// staging value of this user id (bytes 12..15 of the UUID / 0xffffffff) is ≈0.878: inside a 90% rollout, outside a 1% one
const STAGING_USER_ID = "12a70172-80f8-5cc4-8131-28f5e0edd2a1"

// The updater reads its staging user id from `.updaterId` in the user data directory of its app adapter, so the id is
// written there: anywhere else, the updater generates a random id and the rollout decision is left to chance.
async function createStagedNsisUpdater(updateConfigPath: string) {
  const appAdapter = await createTestAppAdapter("0.0.1")
  await fsExtra.outputFile(path.join(appAdapter.userDataPath, ".updaterId"), STAGING_USER_ID)
  const updater = new NsisUpdater(null, appAdapter)
  tuneTestUpdater(updater)
  updater.updateConfigPath = updateConfigPath
  return updater
}

test("90 staging percentage", config, async ({ expect }) => {
  const { url, close } = await serveUpdate({
    "test-bucket/test/staging-percentage.yml": channelYml({ stagingPercentage: 90 }),
    [`test-bucket/test/${installerName(UPDATE_VERSION)}`]: INSTALLER_CONTENT,
  })
  try {
    const updater = await createStagedNsisUpdater(await writeUpdateConfig<S3Options>(s3UpdateConfig(url, "staging-percentage")))
    await validateDownload(expect, updater)
  } finally {
    await close()
  }
})

test("1 staging percentage", config, async ({ expect }) => {
  const { url, close } = await serveUpdate({
    "test-bucket/test/staging-percentage-small.yml": channelYml({ stagingPercentage: 1 }),
    [`test-bucket/test/${installerName(UPDATE_VERSION)}`]: INSTALLER_CONTENT,
  })
  try {
    // outside the rollout, so no download must happen
    const updater = await createStagedNsisUpdater(await writeUpdateConfig<S3Options>(s3UpdateConfig(url, "staging-percentage-small")))
    await validateDownload(expect, updater, false)
  } finally {
    await close()
  }
})

test("cancel download with progress", config, async ({ expect }) => {
  // a static payload would finish before cancel() gets a chance to run, so serve the channel file
  // normally and stall the installer download forever — cancellation must win deterministically
  const declaredSize = 10 * 1024 * 1024
  const sha512 = Buffer.alloc(64, 2).toString("base64")
  const fileName = installerName(UPDATE_VERSION)
  const yml = serializeToYaml({
    version: UPDATE_VERSION,
    files: [{ url: fileName, sha512, size: declaredSize }],
    path: fileName,
    sha512,
    releaseDate: RELEASE_DATE,
  })

  const sockets = new Set<Socket>()
  const server = http.createServer((request, response) => {
    // the channel-file request may carry a cache-busting query string, so route on the pathname
    if (new URL(request.url!, "http://localhost").pathname.endsWith(".yml")) {
      response.writeHead(200, { "Content-Type": "text/yaml" })
      response.end(yml)
      return
    }
    // send headers and a first chunk, then never finish the body
    response.writeHead(200, { "Content-Length": declaredSize, "Content-Type": "application/octet-stream" })
    response.write(Buffer.alloc(64 * 1024))
  })
  server.on("connection", socket => {
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()))
  const port = (server.address() as any).port

  try {
    const updater = await createNsisUpdater()
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: `http://127.0.0.1:${port}` })

    const progressEvents: Array<any> = []
    updater.signals.progress(it => progressEvents.push(it))

    let cancelled = false
    updater.signals.updateCancelled(() => (cancelled = true))

    const checkResult = await updater.checkForUpdates()
    checkResult?.cancellationToken!.cancel()

    if (progressEvents.length > 0) {
      const lastEvent = progressEvents[progressEvents.length - 1]
      expect(lastEvent.percent).not.toBe(100)
      expect(lastEvent.bytesPerSecond).toBeGreaterThan(1)
      expect(lastEvent.transferred).not.toBe(lastEvent.total)
    }

    const downloadPromise = checkResult?.downloadPromise
    await assertThat(expect, downloadPromise).throws()
    expect(cancelled).toBe(true)
  } finally {
    for (const socket of sockets) {
      socket.destroy()
    }
    server.close()
  }
})

test("test download and install", config, async ({ expect }) => {
  const { url, close } = await serveDefaultUpdate()
  try {
    const updater = await createNsisUpdater()
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url })

    await validateDownload(expect, updater)
  } finally {
    await close()
  }
})

// before-quit-for-update is emitted via require("electron").autoUpdater.emit(...) inside setImmediate
// in BaseUpdater.quitAndInstall — it fires on the native Electron autoUpdater object, not on the
// updater instance, and only after install() returns true (which spawns a .exe on Linux/macOS and fails).
test.skip("test downloaded installer", config, async ({ expect }) => {
  const { url, close } = await serveDefaultUpdate()
  try {
    const updater = await createNsisUpdater("1.0.1")
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url })

    const actualEvents = trackEvents(updater)
    let beforeQuitFired = false
    ;(updater as any).addListener("before-quit-for-update", () => {
      beforeQuitFired = true
    })
    await validateDownload(expect, updater)
    expect(actualEvents).toMatchObject(["checking-for-update", "update-available", "update-downloaded"])
    updater.quitAndInstall({ isSilent: true, isForceRunAfter: false })
    expect(beforeQuitFired).toBe(true)
  } finally {
    await close()
  }
})

describe("NsisUpdater — disableWebInstaller", () => {
  // disableWebInstaller defaults to true: a web-installer update is rejected with ERR_UPDATER_WEB_INSTALLER_DISABLED
  // (also when it is already cached) unless the app sets it to false; the downloaded package is then passed via --package-file.
  // names the updater gives the cached installer (basename of the url) and package (package-<version><ext>) in the pending dir
  const WEB_INSTALLER_NAME = "TestApp Setup 1.0.1.exe"
  const CACHED_PACKAGE_NAME = "package-1.0.1.7z"
  const WEB_PAYLOAD = {
    installer: INSTALLER_CONTENT,
    package: Buffer.from("electron-builder localhost update-server test web-installer app package — not a real 7z archive"),
  }

  function sha512Base64(data: Buffer) {
    return createHash("sha512").update(data).digest("base64")
  }

  // Serves a synthetic update over a local server. When `web` is true the latest.yml carries a `packages` block
  // keyed by the test arch, so resolveFiles populates fileInfo.packageInfo → isWebInstaller. Without `payload` no
  // installer/package files are served and the checksums are placeholders — enough for the branches that reject or
  // warn before the download. With `payload` its bytes are served and latest.yml carries their real sha512.
  async function serveUpdate(web: boolean, payload?: { installer: Buffer; package: Buffer; omitPackageSha512?: boolean; isAdminRightsRequired?: boolean }) {
    const tmpDir = new TmpDir("web-installer-unit")
    const root = await tmpDir.getTempDir()
    const placeholderSha512 = Buffer.alloc(64).toString("base64")
    const sha512 = payload == null ? placeholderSha512 : sha512Base64(payload.installer)
    const updateInfo: any = {
      version: "1.0.1",
      files: [{ url: WEB_INSTALLER_NAME, sha512, size: payload?.installer.length ?? 10, ...(payload?.isAdminRightsRequired ? { isAdminRightsRequired: true } : {}) }],
      path: WEB_INSTALLER_NAME,
      sha512,
      releaseDate: new Date(0).toISOString(),
    }
    if (web) {
      const packageInfo: any = { file: "TestApp-1.0.1.nsis.7z", path: "TestApp-1.0.1.nsis.7z", size: payload?.package.length ?? 10 }
      if (payload?.omitPackageSha512 !== true) {
        packageInfo.sha512 = payload == null ? placeholderSha512 : sha512Base64(payload.package)
      }
      updateInfo.packages = { [process.arch]: packageInfo }
    }
    await fsExtra.outputFile(path.join(root, "latest.yml"), serializeToYaml(updateInfo))
    if (payload != null) {
      await fsExtra.outputFile(path.join(root, WEB_INSTALLER_NAME), payload.installer)
      await fsExtra.outputFile(path.join(root, "TestApp-1.0.1.nsis.7z"), payload.package)
    }
    const { server, port } = await createLocalServer(root)
    return { server, port, tmpDir }
  }

  // Seeds the pending cache exactly as a previous launch that downloaded the WEB_PAYLOAD update leaves it, so
  // validateDownloadedPath returns a cache hit. `updateConfigPath` must be set first (it names the cache dir).
  async function seedCachedWebUpdate(updater: NsisUpdater, packageFileName = CACHED_PACKAGE_NAME) {
    const pendingDir: string = (await (updater as any).getOrCreateDownloadHelper()).cacheDirForPendingUpdate
    await fsExtra.outputFile(path.join(pendingDir, WEB_INSTALLER_NAME), WEB_PAYLOAD.installer)
    await fsExtra.outputFile(path.join(pendingDir, packageFileName), WEB_PAYLOAD.package)
    await fsExtra.outputJson(path.join(pendingDir, "update-info.json"), {
      fileName: WEB_INSTALLER_NAME,
      sha512: sha512Base64(WEB_PAYLOAD.installer),
      isAdminRightsRequired: false,
      packageFileName,
    })
    return { packageFile: path.join(pendingDir, packageFileName) }
  }

  // records every non-channel-file request, i.e. installer and package downloads
  function trackDownloads(server: http.Server) {
    const downloads: Array<string> = []
    server.on("request", (request: http.IncomingMessage) => {
      const pathname = decodeURIComponent(new URL(request.url!, "http://localhost").pathname)
      if (!pathname.endsWith(".yml")) {
        downloads.push(pathname)
      }
    })
    return downloads
  }

  test("explicit disableWebInstaller=true rejects a web-installer update", config, async ({ expect }) => {
    const { server, port, tmpDir } = await serveUpdate(true)
    try {
      const updater = await createNsisUpdater("1.0.0")
      updater.disableWebInstaller = true
      updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: `http://127.0.0.1:${port}` })
      trackEvents(updater)

      const updateCheckResult = await updater.checkForUpdates()
      await expect(updateCheckResult!.downloadPromise).rejects.toThrow(/Web Installers are disabled/)
    } finally {
      server.close()
      await tmpDir.cleanup()
    }
  })

  test("unset disableWebInstaller rejects a web-installer update", config, async ({ expect }) => {
    const { server, port, tmpDir } = await serveUpdate(true)
    const downloads = trackDownloads(server)
    try {
      const updater = await createNsisUpdater("1.0.0")
      // Deliberately do NOT set disableWebInstaller — the default rejects the update before the installer is requested.
      updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: `http://127.0.0.1:${port}` })
      trackEvents(updater)

      const updateCheckResult = await updater.checkForUpdates()
      await expect(updateCheckResult!.downloadPromise).rejects.toMatchObject({ code: "ERR_UPDATER_WEB_INSTALLER_DISABLED" })
      expect(downloads).toEqual([])
    } finally {
      server.close()
      await tmpDir.cleanup()
    }
  })

  test("rejects a web-installer update already cached by a previous launch", config, async ({ expect }) => {
    const { server, port, tmpDir } = await serveUpdate(true, WEB_PAYLOAD)
    const downloads = trackDownloads(server)
    try {
      const updater = await createNsisUpdater("1.0.0")
      updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: `http://127.0.0.1:${port}` })
      await seedCachedWebUpdate(updater)
      // a valid cache of a web-installer update is rejected as well
      updater.disableWebInstaller = true
      const actualEvents = trackEvents(updater)

      const updateCheckResult = await updater.checkForUpdates()
      await expect(updateCheckResult!.downloadPromise).rejects.toMatchObject({ code: "ERR_UPDATER_WEB_INSTALLER_DISABLED" })
      expect(actualEvents).not.toContain("update-downloaded")
      expect(downloads).toEqual([])
    } finally {
      server.close()
      await tmpDir.cleanup()
    }
  })

  // positive control for the test above: the same seed is a genuine cache hit
  test("disableWebInstaller=false reuses a web-installer update cached by a previous launch without downloading it", config, async ({ expect }) => {
    const { server, port, tmpDir } = await serveUpdate(true, WEB_PAYLOAD)
    const downloads = trackDownloads(server)
    try {
      const updater = await createNsisUpdater("1.0.0")
      updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: `http://127.0.0.1:${port}` })
      const { packageFile } = await seedCachedWebUpdate(updater)
      updater.disableWebInstaller = false
      const actualEvents = trackEvents(updater)

      const updateCheckResult = await updater.checkForUpdates()
      const result = await updateCheckResult!.downloadPromise
      expect(result!.packageFile).toBe(packageFile)
      expect(actualEvents).toContain("update-downloaded")
      expect(downloads).toEqual([])
    } finally {
      server.close()
      await tmpDir.cleanup()
    }
  })

  test("rejects a web-installer update whose package has no sha512", config, async ({ expect }) => {
    const { server, port, tmpDir } = await serveUpdate(true, { ...WEB_PAYLOAD, omitPackageSha512: true })
    const downloads = trackDownloads(server)
    try {
      const updater = await createNsisUpdater("1.0.0")
      updater.disableWebInstaller = false
      updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: `http://127.0.0.1:${port}` })
      trackEvents(updater)

      const updateCheckResult = await updater.checkForUpdates()
      await expect(updateCheckResult!.downloadPromise).rejects.toMatchObject({ code: "ERR_UPDATER_NO_CHECKSUM" })
      expect(downloads).toEqual([])
    } finally {
      server.close()
      await tmpDir.cleanup()
    }
  })

  test("disableWebInstaller=false downloads the web package and installs it via --package-file", config, async ({ expect }) => {
    const { server, port, tmpDir } = await serveUpdate(true, WEB_PAYLOAD)
    try {
      const updater = await createNsisUpdater("1.0.0")
      updater.disableWebInstaller = false
      // the test app-update.yml has no publisherName (the installer is unsigned)
      updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: `http://127.0.0.1:${port}` })
      const errors: Array<any> = []
      updater.on("error", e => errors.push(e))

      const updateCheckResult = await updater.checkForUpdates()
      const { updateFile, packageFile } = (await updateCheckResult!.downloadPromise)!
      expect(packageFile).toBeDefined()
      await assertThat(expect, packageFile).isFile()
      expect((await fsExtra.readJson(path.join(path.dirname(packageFile!), "update-info.json"))).packageFileName).toBe(path.basename(packageFile!))

      // the policy is re-checked at install time: the web installer must not run once web installers are disabled
      const spawnLog = vi.spyOn(updater as any, "spawnLog").mockResolvedValue(true)
      updater.disableWebInstaller = true
      expect(updater.install(true, false)).toBe(false)
      expect(spawnLog).not.toHaveBeenCalled()
      expect(errors).toEqual([expect.objectContaining({ code: "ERR_UPDATER_WEB_INSTALLER_DISABLED" })])

      // a refused install() returns to idle: a later install() tries again without any reset
      expect((updater as any).installState).toEqual({ kind: "idle" })
      updater.disableWebInstaller = false
      expect(updater.install(true, false)).toBe(true)
      expect(spawnLog).toHaveBeenCalledWith(updateFile, expect.arrayContaining([`--package-file=${packageFile}`]))
    } finally {
      server.close()
      await tmpDir.cleanup()
    }
  })

  // the feed query (an auth token here; Keygen always has `?product=`) is copied onto the package URL, but must not reach the package
  // file name: `?` cannot be in a Windows file name
  test("a feed URL with a query names the downloaded web package without the query", config, async ({ expect }) => {
    const { server, port, tmpDir } = await serveUpdate(true, WEB_PAYLOAD)
    try {
      const updater = await createNsisUpdater("1.0.0")
      updater.disableWebInstaller = false
      updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: `http://127.0.0.1:${port}/?token=abc` })

      const updateCheckResult = await updater.checkForUpdates()
      const { updateFile, packageFile } = (await updateCheckResult!.downloadPromise)!
      expect(path.basename(packageFile!)).toBe(CACHED_PACKAGE_NAME)
      await assertThat(expect, packageFile).isFile()
      expect((await fsExtra.readJson(path.join(path.dirname(packageFile!), "update-info.json"))).packageFileName).toBe(CACHED_PACKAGE_NAME)

      const spawnLog = vi.spyOn(updater as any, "spawnLog").mockResolvedValue(true)
      expect(updater.install(true, false)).toBe(true)
      expect(spawnLog).toHaveBeenCalledWith(updateFile, expect.arrayContaining([`--package-file=${packageFile}`]))
    } finally {
      server.close()
      await tmpDir.cleanup()
    }
  })

  // a package cached under another name (e.g. by an earlier electron-updater that took the extension from the URL query) is installed
  // from the file that was validated, not from the name derived for this download
  test("a web-installer update cached under another package file name is installed from the cached package", config, async ({ expect }) => {
    const { server, port, tmpDir } = await serveUpdate(true, WEB_PAYLOAD)
    const downloads = trackDownloads(server)
    try {
      const updater = await createNsisUpdater("1.0.0")
      updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: `http://127.0.0.1:${port}` })
      const { packageFile } = await seedCachedWebUpdate(updater, "package-1.0.1.def")
      updater.disableWebInstaller = false

      const updateCheckResult = await updater.checkForUpdates()
      const result = (await updateCheckResult!.downloadPromise)!
      expect(result.packageFile).toBe(packageFile)
      expect(downloads).toEqual([])

      const spawnLog = vi.spyOn(updater as any, "spawnLog").mockResolvedValue(true)
      expect(updater.install(true, false)).toBe(true)
      expect(spawnLog).toHaveBeenCalledWith(result.updateFile, expect.arrayContaining([`--package-file=${packageFile}`]))
    } finally {
      server.close()
      await tmpDir.cleanup()
    }
  })

  // NSIS takes the rest of the command line after /D= as the install directory, so every other argument comes before it. A directory
  // with a space stays one unquoted argument: child_process.spawn quotes it, and the installer's GetDParameter handles that form
  for (const web of [true, false]) {
    for (const installDirectory of ["C:\\Apps\\TestApp", "C:\\Program Files\\Test App", undefined]) {
      test(
        `installer arguments of a ${web ? "web" : "full"} installer ${installDirectory == null ? "without installDirectory" : `with installDirectory (/D= last)${installDirectory.includes(" ") ? ", containing a space" : ""}`}`,
        config,
        async ({ expect }) => {
          const { server, port, tmpDir } = await serveUpdate(web, WEB_PAYLOAD)
          try {
            const updater = await createNsisUpdater("1.0.0")
            if (web) {
              updater.disableWebInstaller = false
            }
            updater.installDirectory = installDirectory
            updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: `http://127.0.0.1:${port}` })
            const errors: Array<any> = []
            updater.on("error", e => errors.push(e))

            const updateCheckResult = await updater.checkForUpdates()
            const { updateFile, packageFile } = (await updateCheckResult!.downloadPromise)!
            expect(packageFile == null).toBe(!web)

            const spawnLog = vi.spyOn(updater as any, "spawnLog").mockResolvedValue(true)
            expect(updater.install(true, true)).toBe(true)
            expect(spawnLog).toHaveBeenCalledTimes(1)
            expect(spawnLog).toHaveBeenCalledWith(updateFile, [
              "--updated",
              "/S",
              "--force-run",
              ...(web ? [`--package-file=${packageFile}`] : []),
              ...(installDirectory == null ? [] : [`/D=${installDirectory}`]),
            ])
            expect(errors).toEqual([])
          } finally {
            server.close()
            await tmpDir.cleanup()
          }
        }
      )
    }
  }

  // the update info of a per-machine build has isAdminRightsRequired in the installer's file entry: the installer is started through
  // elevate.exe from the resources of the running app, with the arguments it would get directly
  for (const installDirectory of [undefined, "C:\\Apps\\TestApp", "C:\\Program Files\\Test App"]) {
    test(
      `an update with isAdminRightsRequired is installed through elevate.exe, --package-file included${installDirectory == null ? "" : ` and /D= last${installDirectory.includes(" ") ? ", containing a space" : ""}`}`,
      config,
      async ({ expect }) => {
        const { server, port, tmpDir } = await serveUpdate(true, { ...WEB_PAYLOAD, isAdminRightsRequired: true })
        try {
          const updater = await createNsisUpdater("1.0.0")
          updater.disableWebInstaller = false
          updater.installDirectory = installDirectory
          updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: `http://127.0.0.1:${port}` })
          const errors: Array<any> = []
          updater.on("error", e => errors.push(e))

          const updateCheckResult = await updater.checkForUpdates()
          const { updateFile, packageFile } = (await updateCheckResult!.downloadPromise)!
          expect(packageFile).toBeDefined()
          expect((await fsExtra.readJson(path.join(path.dirname(updateFile), "update-info.json"))).isAdminRightsRequired).toBe(true)

          const spawnLog = vi.spyOn(updater as any, "spawnLog").mockResolvedValue(true)
          // process.resourcesPath is only set in Electron; set here for the install only (the constructor reads the package-type marker from it)
          const resourcesPath = await tmpDir.getTempDir({ prefix: "resources" })
          // elevate.exe runs only where the current user cannot modify it (see "NsisUpdater — installer start failure and elevate.exe")
          const deniedWrites = denyWrites([path.join(resourcesPath, "elevate.exe")], [resourcesPath, path.dirname(process.execPath)])
          const original = Object.getOwnPropertyDescriptor(process, "resourcesPath")
          Object.defineProperty(process, "resourcesPath", { value: resourcesPath, configurable: true, writable: true })
          try {
            expect(updater.install(true, false)).toBe(true)
          } finally {
            deniedWrites.mockRestore()
            if (original == null) {
              delete (process as any).resourcesPath
            } else {
              Object.defineProperty(process, "resourcesPath", original)
            }
          }
          expect(spawnLog).toHaveBeenCalledTimes(1)
          expect(spawnLog).toHaveBeenCalledWith(path.join(resourcesPath, "elevate.exe"), [
            updateFile,
            "--updated",
            "/S",
            `--package-file=${packageFile}`,
            ...(installDirectory == null ? [] : [`/D=${installDirectory}`]),
          ])
          expect(errors).toEqual([])
        } finally {
          server.close()
          await tmpDir.cleanup()
        }
      }
    )
  }

  test("unset disableWebInstaller stays silent for a regular (non-web) installer", config, async ({ expect }) => {
    const { server, port, tmpDir } = await serveUpdate(false)
    try {
      const updater = await createNsisUpdater("1.0.0")
      // unset disableWebInstaller + a non-web update → neither web-installer warning branch should fire
      const warnings: Array<string> = []
      updater.logger = { info() {}, warn: (m: string) => warnings.push(m), error() {}, debug() {} }
      updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: `http://127.0.0.1:${port}` })
      trackEvents(updater)

      await updater
        .checkForUpdates()
        .then(r => r!.downloadPromise)
        .then(
          () => null,
          () => null
        )
      expect(warnings.some(w => w.toLowerCase().includes("web installer"))).toBe(false)
    } finally {
      server.close()
      await tmpDir.cleanup()
    }
  })

  test("explicit disableWebInstaller=false warns when a regular (non-web) installer is downloaded", config, async ({ expect }) => {
    const { server, port, tmpDir } = await serveUpdate(false)
    try {
      const updater = await createNsisUpdater("1.0.0")
      updater.disableWebInstaller = false
      const warnings: Array<string> = []
      updater.logger = { info() {}, warn: (m: string) => warnings.push(m), error() {}, debug() {} }
      updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: `http://127.0.0.1:${port}` })
      trackEvents(updater)

      await updater
        .checkForUpdates()
        .then(r => r!.downloadPromise)
        .then(
          () => null,
          () => null
        )
      expect(warnings.some(w => w.includes("a full installer (not a web installer) was downloaded"))).toBe(true)
    } finally {
      server.close()
      await tmpDir.cleanup()
    }
  })

  // process.resourcesPath is only set in Electron: set here while the updater is created, which reads the package-type marker from it
  async function createNsisUpdaterWithPackageType(tmpDir: TmpDir, packageType: string) {
    const resourcesPath = await tmpDir.getTempDir({ prefix: "resources" })
    await fsExtra.outputFile(path.join(resourcesPath, "package-type"), packageType)
    const original = Object.getOwnPropertyDescriptor(process, "resourcesPath")
    Object.defineProperty(process, "resourcesPath", { value: resourcesPath, configurable: true, writable: true })
    try {
      return await createNsisUpdater("1.0.0")
    } finally {
      if (original == null) {
        delete (process as any).resourcesPath
      } else {
        Object.defineProperty(process, "resourcesPath", original)
      }
    }
  }

  // an nsis-web install that receives a full installer (the app moved from nsis-web to nsis) needs no change by the app; the full
  // installer writes the `nsis` marker, so web-installer updates need an opt-in after it is installed
  test("the nsis-web default of disableWebInstaller logs an info line, not a warning, for a regular (non-web) installer", config, async ({ expect }) => {
    const { server, port, tmpDir } = await serveUpdate(false, WEB_PAYLOAD)
    try {
      const updater = await createNsisUpdaterWithPackageType(tmpDir, "nsis-web")
      expect(updater.disableWebInstaller).toBe(false)
      const infos: Array<string> = []
      const warnings: Array<string> = []
      updater.logger = { info: (m: string) => infos.push(m), warn: (m: string) => warnings.push(m), error() {}, debug() {} }
      updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: `http://127.0.0.1:${port}` })
      trackEvents(updater)

      const updateCheckResult = await updater.checkForUpdates()
      // the download completes, so the full-installer branch ran
      await expect(updateCheckResult!.downloadPromise).resolves.toMatchObject({ updateFile: expect.stringContaining(WEB_INSTALLER_NAME) })
      expect(warnings.filter(w => w.includes("disableWebInstaller"))).toEqual([])
      expect(infos.filter(m => m.includes("disableWebInstaller"))).toEqual([
        "A full installer (not a web installer) was downloaded for an install made by an nsis-web installer. After it is installed, web-installer updates need disableWebInstaller = false.",
      ])
    } finally {
      server.close()
      await tmpDir.cleanup()
    }
  })

  test("disableWebInstaller=true set by the app wins over the nsis-web default", config, async ({ expect }) => {
    const { server, port, tmpDir } = await serveUpdate(true)
    const downloads = trackDownloads(server)
    try {
      const updater = await createNsisUpdaterWithPackageType(tmpDir, "nsis-web")
      expect(updater.disableWebInstaller).toBe(false)
      updater.disableWebInstaller = true
      expect(updater.disableWebInstaller).toBe(true)
      updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: `http://127.0.0.1:${port}` })
      trackEvents(updater)

      const updateCheckResult = await updater.checkForUpdates()
      await expect(updateCheckResult!.downloadPromise).rejects.toMatchObject({ code: "ERR_UPDATER_WEB_INSTALLER_DISABLED" })
      expect(downloads).toEqual([])
    } finally {
      server.close()
      await tmpDir.cleanup()
    }
  })

  test("disableWebInstaller=false set by the app also warns on an nsis-web install for a regular (non-web) installer", config, async ({ expect }) => {
    const { server, port, tmpDir } = await serveUpdate(false)
    try {
      const updater = await createNsisUpdaterWithPackageType(tmpDir, "nsis-web")
      updater.disableWebInstaller = false
      const infos: Array<string> = []
      const warnings: Array<string> = []
      updater.logger = { info: (m: string) => infos.push(m), warn: (m: string) => warnings.push(m), error() {}, debug() {} }
      updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: `http://127.0.0.1:${port}` })
      trackEvents(updater)

      await updater
        .checkForUpdates()
        .then(r => r!.downloadPromise)
        .then(
          () => null,
          () => null
        )
      expect(warnings.some(w => w.includes("a full installer (not a web installer) was downloaded"))).toBe(true)
      expect(infos.filter(m => m.includes("disableWebInstaller"))).toEqual([])
    } finally {
      server.close()
      await tmpDir.cleanup()
    }
  })
})

describe("NsisUpdater — package-type pre-seeds disableWebInstaller", () => {
  // The installer writes resources/package-type at install time; TestAppAdapter (ElectronAppAdapter) resolves
  // appUpdateConfigPath through process.resourcesPath, so seeding the marker there matches production exactly.
  async function withResourcesMarker(content: string | null, fn: (disableWebInstaller: boolean) => void) {
    const tmpDir = new TmpDir("package-type-unit")
    const root = await tmpDir.getTempDir()
    if (content != null) {
      await fsExtra.outputFile(path.join(root, "package-type"), content)
    }
    const original = Object.getOwnPropertyDescriptor(process, "resourcesPath")
    Object.defineProperty(process, "resourcesPath", { value: root, configurable: true, writable: true })
    try {
      const updater = await createNsisUpdater("1.0.0")
      fn(updater.disableWebInstaller)
    } finally {
      if (original == null) {
        delete (process as any).resourcesPath
      } else {
        Object.defineProperty(process, "resourcesPath", original)
      }
      await tmpDir.cleanup()
    }
  }

  test("nsis-web marker seeds disableWebInstaller=false", config, async ({ expect }) => {
    await withResourcesMarker("nsis-web", disableWebInstaller => expect(disableWebInstaller).toBe(false))
  })

  test("nsis marker leaves the secure default (disableWebInstaller=true)", config, async ({ expect }) => {
    await withResourcesMarker("nsis", disableWebInstaller => expect(disableWebInstaller).toBe(true))
  })

  test("missing marker leaves the secure default (disableWebInstaller=true)", config, async ({ expect }) => {
    await withResourcesMarker(null, disableWebInstaller => expect(disableWebInstaller).toBe(true))
  })
})

// a failed start of the update installer is not retried elevated or with the shell; EACCES is retried through elevate.exe, which (like
// for an update with isAdminRightsRequired) is run only when the current user cannot modify it, its folder or the install folder of the app
describe("NsisUpdater — installer start failure and elevate.exe", () => {
  afterEach(() => vi.restoreAllMocks())

  const args = ["--updated", "/S"]
  const MIGRATION_LINK = "https://www.electron.build/docs/migration/v27-runtime-changes#nsis-a-failed-installer-start-is-no-longer-retried"

  function spawnError(code: string): Error {
    return Object.assign(new Error(`spawn ${code}`), { code })
  }

  type Writable = "elevate.exe" | "resources" | "install folder"

  // The app runs from <root>/TestApp/TestApp.exe with elevate.exe in <root>/TestApp/resources. Writing to `writable` succeeds; the
  // attempts on the others fail with `deniedCode` (see denyWrites). With `isAdminRightsRequired`, the update is installed through
  // elevate.exe right away; without it, spawnLog rejects the first start with `startError`. `verifyDownloadedFilesSync` is the re-check
  // of the downloaded installer before each start, unchanged by default.
  async function install(
    tmpDir: TmpDir,
    options: {
      isAdminRightsRequired: boolean
      startError?: Error
      writable?: Array<Writable>
      elevateExe?: boolean
      deniedCode?: string
      verifyDownloadedFilesSync?: () => string | null
    }
  ) {
    const root = await tmpDir.getTempDir({ prefix: "installer-start" })
    const installFolder = path.join(root, "TestApp")
    const resourcesPath = path.join(installFolder, "resources")
    const execPath = path.join(installFolder, "TestApp.exe")
    const elevatePath = path.join(resourcesPath, "elevate.exe")
    await fsExtra.outputFile(execPath, "app")
    await fsExtra.ensureDir(resourcesPath)
    if (options.elevateExe !== false) {
      await fsExtra.outputFile(elevatePath, "elevate")
    }
    const installerPath = path.join(root, "pending", "TestApp Setup 1.1.0.exe")

    const updater = await createNsisUpdater("1.0.0")
    Object.defineProperty(updater, "installerPath", { get: () => installerPath })
    ;(updater as any).downloadedUpdateHelper = { verifyDownloadedFilesSync: options.verifyDownloadedFilesSync ?? (() => null), clearSync: () => {} }
    const errors: Array<Error> = []
    updater.on("error", (e: Error) => errors.push(e))
    const spawnLog = vi.spyOn(updater as any, "spawnLog")
    if (options.startError != null) {
      spawnLog.mockRejectedValueOnce(options.startError)
    }
    // the elevated start succeeds
    spawnLog.mockResolvedValue(true)

    const writable = options.writable ?? []
    denyWrites(
      // a missing elevate.exe fails to open with ENOENT
      writable.includes("elevate.exe") || options.elevateExe === false ? [] : [elevatePath],
      [writable.includes("resources") ? null : resourcesPath, writable.includes("install folder") ? null : installFolder].filter(it => it != null),
      options.deniedCode
    )

    const originalExecPath = Object.getOwnPropertyDescriptor(process, "execPath")
    const originalResourcesPath = Object.getOwnPropertyDescriptor(process, "resourcesPath")
    Object.defineProperty(process, "execPath", { value: execPath, configurable: true, writable: true })
    Object.defineProperty(process, "resourcesPath", { value: resourcesPath, configurable: true, writable: true })
    try {
      const result = (updater as any).doInstall({ isSilent: true, isForceRunAfter: false, isAdminRightsRequired: options.isAdminRightsRequired })
      // a start failure is handled asynchronously, after doInstall returned
      await new Promise(resolve => setImmediate(resolve))
      return { result, errors, spawnLog, installerPath, elevatePath, resourcesPath, installFolder }
    } finally {
      if (originalExecPath != null) {
        Object.defineProperty(process, "execPath", originalExecPath)
      }
      if (originalResourcesPath == null) {
        delete (process as any).resourcesPath
      } else {
        Object.defineProperty(process, "resourcesPath", originalResourcesPath)
      }
    }
  }

  for (const code of ["UNKNOWN", "ENOENT"]) {
    test(`${code} is not retried, not even where elevate.exe may run`, config, async ({ expect, tmpDir }) => {
      const { result, errors, spawnLog, installerPath } = await install(tmpDir, { isAdminRightsRequired: false, startError: spawnError(code) })
      expect(result).toBe(true)
      expect(spawnLog).toHaveBeenCalledTimes(1)
      expect(spawnLog).toHaveBeenCalledWith(installerPath, args)
      expect(errors.map(it => (it as any).code)).toEqual(["ERR_UPDATER_INSTALLER_START_FAILED"])
      expect(errors[0].message).toContain(MIGRATION_LINK)
    })
  }

  test("any other start error is emitted as it is", config, async ({ expect, tmpDir }) => {
    const error = spawnError("EPERM")
    const { errors, spawnLog } = await install(tmpDir, { isAdminRightsRequired: false, startError: error })
    expect(spawnLog).toHaveBeenCalledTimes(1)
    expect(errors).toEqual([error])
  })

  test("EACCES is not retried through elevate.exe when the installer changed after the first start", config, async ({ expect, tmpDir }) => {
    const verifyDownloadedFilesSync = vi.fn<() => string | null>().mockReturnValueOnce(null).mockReturnValue("installer changed since it was verified")
    const { errors, spawnLog } = await install(tmpDir, { isAdminRightsRequired: false, startError: spawnError("EACCES"), verifyDownloadedFilesSync })
    expect(verifyDownloadedFilesSync).toHaveBeenCalledTimes(2)
    expect(spawnLog).toHaveBeenCalledTimes(1)
    expect(errors.map(it => (it as any).code)).toEqual(["ERR_UPDATER_UPDATE_FILE_CHANGED"])
  })

  for (const { name, isAdminRightsRequired } of [
    { name: "an update with isAdminRightsRequired", isAdminRightsRequired: true },
    { name: "an installer start failing with EACCES", isAdminRightsRequired: false },
  ]) {
    const startError = isAdminRightsRequired ? undefined : spawnError("EACCES")
    const startCalls = isAdminRightsRequired ? 0 : 1

    const expectElevated = (expect: ExpectStatic, { result, errors, spawnLog, installerPath, elevatePath }: Awaited<ReturnType<typeof install>>) => {
      expect(errors).toEqual([])
      expect(result).toBe(true)
      expect(spawnLog).toHaveBeenCalledTimes(startCalls + 1)
      expect(spawnLog).toHaveBeenLastCalledWith(elevatePath, [installerPath, ...args])
    }

    const expectRefused = (expect: ExpectStatic, { result, errors, spawnLog }: Awaited<ReturnType<typeof install>>, reason: string) => {
      expect(errors.map(it => (it as any).code)).toEqual(["ERR_UPDATER_INSTALLER_ELEVATION_REFUSED"])
      expect(errors[0].message).toContain(reason)
      expect(errors[0].message).toContain("elevate.exe is used only when the current user cannot modify it, its folder or the install folder of the app")
      expect(errors[0].message).toContain(MIGRATION_LINK)
      // isAdminRightsRequired is refused before anything is started
      expect(result).toBe(!isAdminRightsRequired)
      expect(spawnLog).toHaveBeenCalledTimes(startCalls)
    }

    describe(name, () => {
      test("runs elevate.exe when the current user cannot modify it or the folders around it", config, async ({ expect, tmpDir }) => {
        expectElevated(expect, await install(tmpDir, { isAdminRightsRequired, startError }))
      })

      test("runs elevate.exe when writing is denied with EPERM", config, async ({ expect, tmpDir }) => {
        expectElevated(expect, await install(tmpDir, { isAdminRightsRequired, startError, deniedCode: "EPERM" }))
      })

      // the folder that would hold it is not writable either, so nobody but an administrator can put one there: the spawn of the missing
      // elevate.exe fails with its own error
      test("runs a missing elevate.exe in a folder the current user cannot write", config, async ({ expect, tmpDir }) => {
        expectElevated(expect, await install(tmpDir, { isAdminRightsRequired, startError, elevateExe: false }))
      })

      test("is refused when the current user can modify elevate.exe", config, async ({ expect, tmpDir }) => {
        const installed = await install(tmpDir, { isAdminRightsRequired, startError, writable: ["elevate.exe"] })
        expectRefused(expect, installed, `the current user can modify ${installed.elevatePath}`)
        // opened for writing without changing it
        expect(await fsExtra.readFile(installed.elevatePath, "utf8")).toBe("elevate")
      })

      for (const [folder, folderPath] of [
        ["resources", (it: Awaited<ReturnType<typeof install>>) => it.resourcesPath],
        ["install folder", (it: Awaited<ReturnType<typeof install>>) => it.installFolder],
      ] as const) {
        test(
          `is refused when the current user can create files in the ${folder === "resources" ? "folder of elevate.exe" : "install folder of the app"}`,
          config,
          async ({ expect, tmpDir }) => {
            const installed = await install(tmpDir, { isAdminRightsRequired, startError, writable: [folder] })
            expectRefused(expect, installed, `the current user can create files in ${folderPath(installed)}`)
            // the file created to find out is removed
            expect((await fsExtra.readdir(installed.resourcesPath)).sort()).toEqual(["elevate.exe"])
            expect((await fsExtra.readdir(installed.installFolder)).sort()).toEqual(["TestApp.exe", "resources"])
          }
        )
      }

      // a missing elevate.exe could be put there
      test("is refused when elevate.exe is missing from a folder the current user can write", config, async ({ expect, tmpDir }) => {
        const installed = await install(tmpDir, { isAdminRightsRequired, startError, elevateExe: false, writable: ["resources"] })
        expectRefused(expect, installed, `the current user can create files in ${installed.resourcesPath}`)
      })

      test("is refused when it cannot be told whether the current user can modify elevate.exe", config, async ({ expect, tmpDir }) => {
        const installed = await install(tmpDir, { isAdminRightsRequired, startError, deniedCode: "EBUSY" })
        expectRefused(expect, installed, `cannot tell whether the current user can modify ${installed.elevatePath} (EBUSY: `)
      })

      // a user who may create files in a folder but not delete them still can put an elevate.exe there
      test("is refused when the file created to find out cannot be removed", config, async ({ expect, tmpDir }) => {
        vi.spyOn(fs, "unlinkSync").mockImplementation(() => {
          throw Object.assign(new Error("EACCES: permission denied, unlink"), { code: "EACCES" })
        })
        const installed = await install(tmpDir, { isAdminRightsRequired, startError, writable: ["resources"] })
        expectRefused(expect, installed, `the current user can create files in ${installed.resourcesPath}`)
      })
    })
  }
})
