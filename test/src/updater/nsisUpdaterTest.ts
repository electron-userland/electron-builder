import { BitbucketPublisher } from "app-builder-lib/out/publish/BitbucketPublisher"
import { BitbucketOptions, GenericServerOptions, GithubOptions, KeygenOptions, S3Options, SpacesOptions } from "builder-util-runtime"
import { UpdateCheckResult } from "electron-updater"
import { outputFile } from "fs-extra"
import { tmpdir } from "os"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert"
import { removeUnstableProperties } from "../helpers/packTester"
import { createNsisUpdater, trackEvents, validateDownload, writeUpdateConfig } from "../helpers/updaterTestUtil"

if (process.env.ELECTRON_BUILDER_OFFLINE === "true") {
  fit("Skip ArtifactPublisherTest suite — ELECTRON_BUILDER_OFFLINE is defined", () => {
    console.warn("[SKIP] Skip ArtifactPublisherTest suite — ELECTRON_BUILDER_OFFLINE is defined")
  })
}

test("downgrade (disallowed, beta)", async () => {
  const updater = await createNsisUpdater("1.5.2-beta.4")
  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
  })

  const actualEvents: Array<string> = []
  const expectedEvents = ["checking-for-update", "update-not-available"]
  for (const eventName of expectedEvents) {
    updater.addListener(eventName, () => {
      actualEvents.push(eventName)
    })
  }

  const updateCheckResult = await updater.checkForUpdates()
  expect(removeUnstableProperties(updateCheckResult.updateInfo)).toMatchSnapshot()
  // noinspection JSIgnoredPromiseFromCall
  expect(updateCheckResult.downloadPromise).toBeUndefined()

  expect(actualEvents).toEqual(expectedEvents)
})

test("file url generic", async () => {
  const updater = await createNsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  })
  await validateDownload(updater)
})

test.ifEnv(process.env.KEYGEN_TOKEN)("file url keygen", async () => {
  const updater = await createNsisUpdater()
  updater.addAuthHeader(`Bearer ${process.env.KEYGEN_TOKEN}`)
  updater.updateConfigPath = await writeUpdateConfig<KeygenOptions>({
    provider: "keygen",
    product: "43981278-96e7-47de-b8c2-98d59987206b",
    account: "cdecda36-3ef0-483e-ad88-97e7970f3149",
  })
  await validateDownload(updater)
})

test.ifEnv(process.env.BITBUCKET_TOKEN)("file url bitbucket", async () => {
  const updater = await createNsisUpdater()
  const options: BitbucketOptions = {
    provider: "bitbucket",
    owner: "mike-m",
    slug: "electron-builder-test",
  }
  updater.addAuthHeader(BitbucketPublisher.convertAppPassword(options.owner, process.env.BITBUCKET_TOKEN!))
  updater.updateConfigPath = await writeUpdateConfig(options)
  await validateDownload(updater)
})

test.skip("DigitalOcean Spaces", async () => {
  const updater = await createNsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<SpacesOptions>({
    provider: "spaces",
    name: "electron-builder-test",
    path: "light-updater-test",
    region: "nyc3",
  })
  await validateDownload(updater)
})

test.skip.ifNotCiWin("sha512 mismatch error event", async () => {
  const updater = await createNsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
    channel: "beta",
  })

  const actualEvents = trackEvents(updater)

  const updateCheckResult = await updater.checkForUpdates()
  expect(removeUnstableProperties(updateCheckResult.updateInfo)).toMatchSnapshot()
  await assertThat(updateCheckResult.downloadPromise).throws()

  expect(actualEvents).toMatchSnapshot()
})

test("file url generic - manual download", async () => {
  const updater = await createNsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  })
  updater.autoDownload = false

  const actualEvents = trackEvents(updater)

  const updateCheckResult = await updater.checkForUpdates()
  expect(removeUnstableProperties(updateCheckResult.updateInfo)).toMatchSnapshot()
  // noinspection JSIgnoredPromiseFromCall
  expect(updateCheckResult.downloadPromise).toBeNull()
  expect(actualEvents).toMatchSnapshot()

  await assertThat(path.join((await updater.downloadUpdate())[0])).isFile()
})

// https://github.com/electron-userland/electron-builder/issues/1045
test("checkForUpdates several times", async () => {
  const updater = await createNsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  })

  const actualEvents = trackEvents(updater)

  for (let i = 0; i < 10; i++) {
    //noinspection JSIgnoredPromiseFromCall
    updater.checkForUpdates()
  }

  async function checkForUpdates() {
    const updateCheckResult = await updater.checkForUpdates()
    expect(removeUnstableProperties(updateCheckResult.updateInfo)).toMatchSnapshot()
    await checkDownloadPromise(updateCheckResult)
  }

  await checkForUpdates()
  // we must not download the same file again
  await checkForUpdates()

  expect(actualEvents).toMatchSnapshot()
})

async function checkDownloadPromise(updateCheckResult: UpdateCheckResult) {
  return await assertThat(path.join((await updateCheckResult.downloadPromise)!![0])).isFile()
}

test("file url github", async () => {
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
  await validateDownload(updater)
})

test("file url github pre-release and fullChangelog", async () => {
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
  const updateCheckResult = await validateDownload(updater)
  expect(updateCheckResult.updateInfo).toMatchSnapshot()
})

test.skip("file url github private", async () => {
  const updater = await createNsisUpdater("0.0.1")
  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release_private",
    private: true,
  })
  await validateDownload(updater)
})

test("test error", async () => {
  const updater = await createNsisUpdater("0.0.1")
  const actualEvents = trackEvents(updater)

  await assertThat(updater.checkForUpdates()).throws()
  expect(actualEvents).toMatchSnapshot()
})

test.skip("test download progress", async () => {
  const updater = await createNsisUpdater("0.0.1")
  updater.updateConfigPath = await writeUpdateConfig({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
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

test.ifAll.ifWindows("valid signature", async () => {
  const updater = await createNsisUpdater("0.0.1")
  updater.updateConfigPath = await writeUpdateConfig({
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
    publisherName: ["Vladimir Krivosheev"],
  })
  await validateDownload(updater)
})

test.ifAll.ifWindows("invalid signature", async () => {
  const updater = await createNsisUpdater("0.0.1")
  updater.updateConfigPath = await writeUpdateConfig({
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
    publisherName: ["Foo Bar"],
  })
  const actualEvents = trackEvents(updater)
  await assertThat(updater.checkForUpdates().then((it): any => it.downloadPromise)).throws()
  expect(actualEvents).toMatchSnapshot()
})

// disable for now
test.skip("90 staging percentage", async () => {
  const userIdFile = path.join(tmpdir(), "electron-updater-test", "userData", ".updaterId")
  await outputFile(userIdFile, "1wa70172-80f8-5cc4-8131-28f5e0edd2a1")

  const updater = await createNsisUpdater("0.0.1")
  updater.updateConfigPath = await writeUpdateConfig<S3Options>({
    provider: "s3",
    channel: "staging-percentage",
    bucket: "develar",
    path: "test",
  })
  await validateDownload(updater)
})

test("1 staging percentage", async () => {
  const userIdFile = path.join(tmpdir(), "electron-updater-test", "userData", ".updaterId")
  await outputFile(userIdFile, "12a70172-80f8-5cc4-8131-28f5e0edd2a1")

  const updater = await createNsisUpdater("0.0.1")
  updater.updateConfigPath = await writeUpdateConfig({
    provider: "s3",
    channel: "staging-percentage-small",
    bucket: "develar",
    path: "test",
  })
  await validateDownload(updater, false)
})

test.skip("cancel download with progress", async () => {
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
  checkResult.cancellationToken!!.cancel()

  if (progressEvents.length > 0) {
    const lastEvent = progressEvents[progressEvents.length - 1]
    expect(lastEvent.percent).not.toBe(100)
    expect(lastEvent.bytesPerSecond).toBeGreaterThan(1)
    expect(lastEvent.transferred).not.toBe(lastEvent.total)
  }

  const downloadPromise = checkResult.downloadPromise!!
  await assertThat(downloadPromise).throws()
  expect(cancelled).toBe(true)
})

test.ifAll("test download and install", async () => {
  const updater = await createNsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  })

  await validateDownload(updater)

  const actualEvents = trackEvents(updater)
  expect(actualEvents).toMatchObject([])
  // await updater.quitAndInstall(true, false)
})

test.ifAll("test downloaded installer", async () => {
  const updater = await createNsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  })

  const actualEvents = trackEvents(updater)

  expect(actualEvents).toMatchObject([])
  // await updater.quitAndInstall(true, false)
})
