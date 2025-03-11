import { BitbucketOptions, GenericServerOptions, GithubOptions, KeygenOptions, S3Options, SpacesOptions } from "builder-util-runtime"
import { BitbucketPublisher } from "electron-publish"
import { UpdateCheckResult } from "electron-updater"
import { outputFile } from "fs-extra"
import { tmpdir } from "os"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert"
import { removeUnstableProperties } from "../helpers/packTester"
import { createNsisUpdater, trackEvents, validateDownload, writeUpdateConfig } from "../helpers/updaterTestUtil"
import { ExpectStatic } from "vitest"

const config = { retry: 3 }

test("downgrade (disallowed, beta)", config, async ({ expect }) => {
  const updater = await createNsisUpdater("1.5.2-beta.4")
  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
  })

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
})

test("github allowPrerelease=true", config, async ({ expect }) => {
  const updater = await createNsisUpdater("1.0.1")
  updater.allowPrerelease = true
  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: "mmaietta",
    repo: "electron-builder-test-prerelease",
  })
  const updateCheckResult = await updater.checkForUpdates()
  expect(removeUnstableProperties(updateCheckResult?.updateInfo)).toMatchSnapshot()
})

test("github allowPrerelease=false", config, async ({ expect }) => {
  const updater = await createNsisUpdater("1.0.1")
  updater.allowPrerelease = false
  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: "mmaietta",
    repo: "electron-builder-test-prerelease",
  })
  const updateCheckResult = await updater.checkForUpdates()
  expect(removeUnstableProperties(updateCheckResult?.updateInfo)).toMatchSnapshot()
})

test("file url generic", config, async ({ expect }) => {
  const updater = await createNsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  })
  await validateDownload(expect, updater)
})

test.ifEnv(process.env.KEYGEN_TOKEN)("file url keygen", config, async ({ expect }) => {
  const updater = await createNsisUpdater()
  updater.addAuthHeader(`Bearer ${process.env.KEYGEN_TOKEN}`)
  updater.updateConfigPath = await writeUpdateConfig<KeygenOptions>({
    provider: "keygen",
    product: process.env.KEYGEN_PRODUCT || "43981278-96e7-47de-b8c2-98d59987206b",
    account: process.env.KEYGEN_ACCOUNT || "cdecda36-3ef0-483e-ad88-97e7970f3149",
  })
  await validateDownload(expect, updater)
})

test.ifEnv(process.env.BITBUCKET_TOKEN)("file url bitbucket", config, async ({ expect }) => {
  const updater = await createNsisUpdater()
  const options: BitbucketOptions = {
    provider: "bitbucket",
    owner: "mike-m",
    slug: "electron-builder-test",
  }
  updater.addAuthHeader(BitbucketPublisher.convertAppPassword(options.owner, process.env.BITBUCKET_TOKEN!))
  updater.updateConfigPath = await writeUpdateConfig(options)
  await validateDownload(expect, updater)
})

test.skip("DigitalOcean Spaces", config, async ({ expect }) => {
  const updater = await createNsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<SpacesOptions>({
    provider: "spaces",
    name: "electron-builder-test",
    path: "light-updater-test",
    region: "nyc3",
  })
  await validateDownload(expect, updater)
})

test.ifNotCiWin.skip("sha512 mismatch error event", config, async ({ expect }) => {
  const updater = await createNsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
    channel: "beta",
  })

  const actualEvents = trackEvents(updater)

  const updateCheckResult = await updater.checkForUpdates()
  expect(removeUnstableProperties(updateCheckResult?.updateInfo)).toMatchSnapshot()
  await assertThat(expect, updateCheckResult?.downloadPromise).throws()

  expect(actualEvents).toMatchSnapshot()
})

test("file url generic - manual download", config, async ({ expect }) => {
  const updater = await createNsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  })
  updater.autoDownload = false

  const actualEvents = trackEvents(updater)

  const updateCheckResult = await updater.checkForUpdates()
  expect(removeUnstableProperties(updateCheckResult?.updateInfo)).toMatchSnapshot()
  // noinspection JSIgnoredPromiseFromCall
  expect(updateCheckResult?.downloadPromise).toBeNull()
  expect(actualEvents).toMatchSnapshot()

  await assertThat(expect, path.join((await updater.downloadUpdate())[0])).isFile()
})

// https://github.com/electron-userland/electron-builder/issues/1045
test("checkForUpdates several times", config, async ({ expect }) => {
  const updater = await createNsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  })

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
})

async function checkDownloadPromise(expect: ExpectStatic, updateCheckResult: UpdateCheckResult | null) {
  return await assertThat(expect, path.join((await updateCheckResult?.downloadPromise)![0])).isFile()
}

test("file url github", config, async ({ expect }) => {
  const updater = await createNsisUpdater()
  const options: GithubOptions = {
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
  }
  updater.updateConfigPath = await writeUpdateConfig(options)
  updater.signals.updateDownloaded(info => {
    expect(info.downloadedFile).not.toBeNull()

    delete (info as any).downloadedFile
    expect(info).toMatchSnapshot()
  })
  await validateDownload(expect, updater)
})

test("file url github pre-release and fullChangelog", config, async ({ expect }) => {
  const updater = await createNsisUpdater("1.5.0-beta.1")
  const options: GithubOptions = {
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
  }
  updater.fullChangelog = true
  updater.updateConfigPath = await writeUpdateConfig(options)
  updater.signals.updateDownloaded(info => {
    expect(info.downloadedFile).not.toBeNull()

    delete (info as any).downloadedFile
    expect(info).toMatchSnapshot()
  })
  const updateCheckResult = await validateDownload(expect, updater)
  expect(updateCheckResult?.updateInfo).toMatchSnapshot()
})

test.ifEnv(process.env.GH_TOKEN || process.env.GITHUB_TOKEN)("file url github private", config, async ({ expect }) => {
  const updater = await createNsisUpdater("0.0.1")
  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release_private",
    private: true,
  })
  await validateDownload(expect, updater)
})

test("test error", config, async ({ expect }) => {
  const updater = await createNsisUpdater("0.0.1")
  const actualEvents = trackEvents(updater)

  await assertThat(expect, updater.checkForUpdates()).throws()
  expect(actualEvents).toMatchSnapshot()
})

test.skip("test download progress", config, async ({ expect }) => {
  const updater = await createNsisUpdater("0.0.1")
  updater.updateConfigPath = await writeUpdateConfig({
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
  })
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
})

test("valid signature", config, async ({ expect }) => {
  const updater = await createNsisUpdater("0.0.1")
  updater.updateConfigPath = await writeUpdateConfig({
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
    publisherName: ["Vladimir Krivosheev"],
  })
  await validateDownload(expect, updater)
})

test("valid signature - multiple publisher DNs", config, async ({ expect }) => {
  const updater = await createNsisUpdater("0.0.1")
  updater.updateConfigPath = await writeUpdateConfig({
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
    publisherName: ["Foo Bar", "CN=Vladimir Krivosheev, O=Vladimir Krivosheev, L=Grunwald, S=Bayern, C=DE", "Bar Foo"],
  })
  await validateDownload(expect, updater)
})

test("valid signature using DN", config, async ({ expect }) => {
  const updater = await createNsisUpdater("0.0.1")
  updater.updateConfigPath = await writeUpdateConfig({
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
    publisherName: ["CN=Vladimir Krivosheev, O=Vladimir Krivosheev, L=Grunwald, S=Bayern, C=DE"],
  })

  await validateDownload(expect, updater)
})

test.ifWindows("invalid signature", config, async ({ expect }) => {
  const updater = await createNsisUpdater("0.0.1")
  updater.updateConfigPath = await writeUpdateConfig({
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
    publisherName: ["Foo Bar"],
  })
  const actualEvents = trackEvents(updater)
  await assertThat(
    expect,
    updater.checkForUpdates().then((it): any => it?.downloadPromise)
  ).throws()
  expect(actualEvents).toMatchSnapshot()
})

test.ifWindows("test custom signature verifier", config, async ({ expect }) => {
  const updater = await createNsisUpdater("1.0.2")
  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
    publisherName: ["CN=Vladimir Krivosheev, O=Vladimir Krivosheev, L=Grunwald, S=Bayern, C=DE"],
  })
  updater.verifyUpdateCodeSignature = (publisherName: string[], path: string) => {
    return Promise.resolve(null)
  }
  await validateDownload(expect, updater)
})

test.ifWindows("test custom signature verifier - signing error message", config, async ({ expect }) => {
  const updater = await createNsisUpdater("1.0.2")
  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
    publisherName: ["CN=Vladimir Krivosheev, O=Vladimir Krivosheev, L=Grunwald, S=Bayern, C=DE"],
  })
  updater.verifyUpdateCodeSignature = (publisherName: string[], path: string) => {
    return Promise.resolve("signature verification failed")
  }
  const actualEvents = trackEvents(updater)
  await assertThat(
    expect,
    updater.checkForUpdates().then((it): any => it?.downloadPromise)
  ).throws()
  expect(actualEvents).toMatchSnapshot()
})

// disable for now
test("90 staging percentage", config, async ({ expect }) => {
  const userIdFile = path.join(tmpdir(), "electron-updater-test", "userData", ".updaterId")
  await outputFile(userIdFile, "1wa70172-80f8-5cc4-8131-28f5e0edd2a1")

  const updater = await createNsisUpdater("0.0.1")
  updater.updateConfigPath = await writeUpdateConfig<S3Options>({
    provider: "s3",
    channel: "staging-percentage",
    bucket: "develar",
    path: "test",
  })
  await validateDownload(expect, updater)
})

test("1 staging percentage", config, async ({ expect }) => {
  const userIdFile = path.join(tmpdir(), "electron-updater-test", "userData", ".updaterId")
  await outputFile(userIdFile, "12a70172-80f8-5cc4-8131-28f5e0edd2a1")

  const updater = await createNsisUpdater("0.0.1")
  updater.updateConfigPath = await writeUpdateConfig({
    provider: "s3",
    channel: "staging-percentage-small",
    bucket: "develar",
    path: "test",
  })
  await validateDownload(expect, updater, false)
})

test("cancel download with progress", config, async ({ expect }) => {
  const updater = await createNsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/full-test",
  })

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
})

test("test download and install", config, async ({ expect }) => {
  const updater = await createNsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  })

  await validateDownload(expect, updater)
})

test.ifWindows.skip("test downloaded installer", config, async ({ expect }) => {
  const updater = await createNsisUpdater("1.0.1")
  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: "mmaietta",
    repo: "electron-builder-test",
  })

  const actualEvents = trackEvents(updater)
  await validateDownload(expect, updater)
  // expect(actualEvents).toMatchObject(["checking-for-update", "update-available", "update-downloaded"])
  updater.quitAndInstall(true, false)
  expect(actualEvents).toMatchObject(["checking-for-update", "update-available", "update-downloaded", "before-quit-for-update"])
})
