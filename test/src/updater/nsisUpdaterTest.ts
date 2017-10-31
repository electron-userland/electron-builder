import BluebirdPromise from "bluebird-lst"
import { BintrayOptions, GenericServerOptions, GithubOptions, S3Options, SpacesOptions } from "builder-util-runtime"
import { UpdateCheckResult } from "electron-updater"
import { NsisUpdater } from "electron-updater/out/NsisUpdater"
import { outputFile } from "fs-extra-p"
import { tmpdir } from "os"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert"
import { createTestApp, trackEvents, tuneNsisUpdater, validateDownload, writeUpdateConfig } from "../helpers/updaterTestUtil"
import { removeUnstableProperties } from "../helpers/packTester"

if (process.env.ELECTRON_BUILDER_OFFLINE === "true") {
  fit("Skip ArtifactPublisherTest suite — ELECTRON_BUILDER_OFFLINE is defined", () => {
    console.warn("[SKIP] Skip ArtifactPublisherTest suite — ELECTRON_BUILDER_OFFLINE is defined")
  })
}

process.env.TEST_UPDATER_PLATFORM = "win32"

const g = (global as any)
g.__test_app = createTestApp("0.0.1")

test("check updates - no versions at all", async () => {
  const updater = new NsisUpdater()
  tuneNsisUpdater(updater)
  // tslint:disable-next-line:no-object-literal-type-assertion
  updater.setFeedURL({
    provider: "bintray",
    owner: "actperepo",
    package: "no-versions",
  } as BintrayOptions)

  await assertThat(updater.checkForUpdates()).throws()
})

async function testUpdateFromBintray(app: any) {
  const updater = new NsisUpdater(null, app)
  updater.allowDowngrade = true
  updater.updateConfigPath = await writeUpdateConfig<BintrayOptions>({
    provider: "bintray",
    owner: "actperepo",
    package: "TestApp",
  })
  tuneNsisUpdater(updater)

  const actualEvents: Array<string> = []
  const expectedEvents = ["checking-for-update", "update-available", "update-downloaded"]
  for (const eventName of expectedEvents) {
    updater.addListener(eventName, () => {
      actualEvents.push(eventName)
    })
  }

  const updateCheckResult = await updater.checkForUpdates()
  expect(removeUnstableProperties(updateCheckResult.updateInfo)).toMatchSnapshot()
  await checkDownloadPromise(updateCheckResult)

  expect(actualEvents).toEqual(expectedEvents)
}
test("file url (bintray)", () => testUpdateFromBintray(null))

test("downgrade (disallowed, bintray)", async () => {
  const updater = new NsisUpdater(null, createTestApp("2.0.0"))
  updater.updateConfigPath = await writeUpdateConfig<BintrayOptions>({
    provider: "bintray",
    owner: "actperepo",
    package: "TestApp",
  })
  tuneNsisUpdater(updater)

  const actualEvents: Array<string> = []
  const expectedEvents = ["checking-for-update", "update-not-available"]
  for (const eventName of expectedEvents) {
    updater.addListener(eventName, () => {
      actualEvents.push(eventName)
    })
  }

  const updateCheckResult = await updater.checkForUpdates()
  expect(removeUnstableProperties(updateCheckResult.updateInfo)).toMatchSnapshot()
  expect(updateCheckResult.downloadPromise).toBeUndefined()

  expect(actualEvents).toEqual(expectedEvents)
})

test("downgrade (disallowed, beta)", async () => {
  const updater = new NsisUpdater(null, createTestApp("1.5.2-beta.4"))
  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
  })
  tuneNsisUpdater(updater)

  const actualEvents: Array<string> = []
  const expectedEvents = ["checking-for-update", "update-not-available"]
  for (const eventName of expectedEvents) {
    updater.addListener(eventName, () => {
      actualEvents.push(eventName)
    })
  }

  const updateCheckResult = await updater.checkForUpdates()
  expect(removeUnstableProperties(updateCheckResult.updateInfo)).toMatchSnapshot()
  expect(updateCheckResult.downloadPromise).toBeUndefined()

  expect(actualEvents).toEqual(expectedEvents)
})

test("downgrade (allowed)", () => testUpdateFromBintray(createTestApp("2.0.0-beta.1")))

test("file url generic", async () => {
  const updater = new NsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  })
  await validateDownload(updater)
})

test("DigitalOcean Spaces", async () => {
  const updater = new NsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<SpacesOptions>({
    provider: "spaces",
    name: "electron-builder-test",
    path: "light-updater-test",
    region: "nyc3",
  })
  await validateDownload(updater)
})

test.ifNotCiWin("sha512 mismatch error event", async () => {
  const updater = new NsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
    channel: "beta",
  })
  tuneNsisUpdater(updater)

  const actualEvents = trackEvents(updater)

  const updateCheckResult = await updater.checkForUpdates()
  expect(removeUnstableProperties(updateCheckResult.updateInfo)).toMatchSnapshot()
  await assertThat(updateCheckResult.downloadPromise).throws()

  expect(actualEvents).toMatchSnapshot()
})

test("file url generic - manual download", async () => {
  const updater = new NsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  })
  tuneNsisUpdater(updater)
  updater.autoDownload = false

  const actualEvents = trackEvents(updater)

  const updateCheckResult = await updater.checkForUpdates()
  expect(removeUnstableProperties(updateCheckResult.updateInfo)).toMatchSnapshot()
  expect(updateCheckResult.downloadPromise).toBeNull()
  expect(actualEvents).toMatchSnapshot()

  await assertThat(path.join((await updater.downloadUpdate())[0])).isFile()
})

// https://github.com/electron-userland/electron-builder/issues/1045
test("checkForUpdates several times", async () => {
  const updater = new NsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  })
  tuneNsisUpdater(updater)

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
  const updater = new NsisUpdater()
  const options: GithubOptions = {
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
  }
  updater.updateConfigPath = await writeUpdateConfig(options)
  updater.signals.updateDownloaded(info => {
    expect(info).toMatchSnapshot()
  })
  await validateDownload(updater)
})

test("file url github pre-release and fullChangelog", async () => {
  const updater = new NsisUpdater(null, createTestApp("1.5.0-beta.1"))
  const options: GithubOptions = {
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
  }
  updater.fullChangelog = true
  updater.updateConfigPath = await writeUpdateConfig(options)
  updater.signals.updateDownloaded(info => {
    expect(info).toMatchSnapshot()
  })
  const updateCheckResult = await validateDownload(updater)
  expect(updateCheckResult.versionInfo).toMatchSnapshot()
})

test.skip("file url github private", async () => {
  const updater = new NsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release_private",
  })
  await validateDownload(updater)
})

test("test error", async () => {
  const updater: NsisUpdater = new NsisUpdater()
  tuneNsisUpdater(updater)
  const actualEvents = trackEvents(updater)

  await assertThat(updater.checkForUpdates()).throws()
  expect(actualEvents).toMatchSnapshot()
})

test("test download progress", async () => {
  const updater = new NsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test"
  })
  tuneNsisUpdater(updater)
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
  const updater = new NsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig({
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
    publisherName: ["Vladimir Krivosheev"],
  })
  await validateDownload(updater)
})

test.ifAll.ifWindows("invalid signature", async () => {
  const updater = new NsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig({
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
    publisherName: ["Foo Bar"],
  })
  tuneNsisUpdater(updater)
  const actualEvents = trackEvents(updater)
  await assertThat(updater.checkForUpdates().then((it): any => it.downloadPromise)).throws()
  expect(actualEvents).toMatchSnapshot()
})

test("90 staging percentage", async () => {
  const userIdFile = path.join(tmpdir(), "electron-updater-test", "userData", ".updaterId")
  await outputFile(userIdFile, "1wa70172-80f8-5cc4-8131-28f5e0edd2a1")

  const updater = new NsisUpdater()
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

  const updater = new NsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig({
    provider: "s3",
    channel: "staging-percentage-small",
    bucket: "develar",
    path: "test",
  })
  await validateDownload(updater, false)
})

test("cancel download with progress", async () => {
  const updater = new NsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/full-test",
  })
  tuneNsisUpdater(updater)

  const progressEvents: Array<any> = []
  updater.signals.progress(it => progressEvents.push(it))

  let cancelled = false
  updater.signals.updateCancelled(() => cancelled = true)

  const checkResult = await updater.checkForUpdates()
  checkResult.cancellationToken!!.cancel()

  if (progressEvents.length > 0) {
    const lastEvent = progressEvents[progressEvents.length - 1]
    expect(lastEvent.percent).not.toBe(100)
    expect(lastEvent.bytesPerSecond).toBeGreaterThan(1)
    expect(lastEvent.transferred).not.toBe(lastEvent.total)
  }

  const downloadPromise = checkResult.downloadPromise as BluebirdPromise<any>
  await assertThat(downloadPromise).throws()
  expect(downloadPromise.isRejected()).toBe(true)
  expect(cancelled).toBe(true)
})