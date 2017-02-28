import BluebirdPromise from "bluebird-lst"
import { BintrayOptions, GenericServerOptions, GithubOptions } from "electron-builder-http/out/publishOptions"
import { TmpDir } from "electron-builder-util/out/tmp"
import { NsisUpdater } from "electron-updater/out/NsisUpdater"
import { outputFile } from "fs-extra-p"
import { safeDump } from "js-yaml"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"

if (process.env.ELECTRON_BUILDER_OFFLINE === "true") {
  fit("Skip ArtifactPublisherTest suite — ELECTRON_BUILDER_OFFLINE is defined", () => {
    console.warn("[SKIP] Skip ArtifactPublisherTest suite — ELECTRON_BUILDER_OFFLINE is defined")
  })
}

const tmpDir = new TmpDir()

const g = (<any>global)
g.__test_app = {
  getVersion: function () {
    return "0.0.1"
  },

  on: function () {
    // ignored
  },
}

process.env.TEST_UPDATER_PLATFORM = "win32"

test("check updates - no versions at all", async () => {
  const updater = new NsisUpdater(<BintrayOptions>{
    provider: "bintray",
    owner: "actperepo",
    package: "no-versions",
  })

  await assertThat(updater.checkForUpdates()).throws()
})

// test("cannot find suitable file for version", async () => {
//   const updater = new NsisUpdater(<BintrayOptions>{
//     provider: "bintray",
//     owner: "actperepo",
//     package: "incorrect-file-version",
//   })
//
//   await assertThat(updater.checkForUpdates()).throws()
// })

test("file url", async () => {
  const updater = new NsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig(<BintrayOptions>{
    provider: "bintray",
    owner: "actperepo",
    package: "TestApp",
  })

  const actualEvents: Array<string> = []
  const expectedEvents = ["checking-for-update", "update-available", "update-downloaded"]
  for (const eventName of expectedEvents) {
    updater.addListener(eventName, () => {
      actualEvents.push(eventName)
    })
  }

  const updateCheckResult = await updater.checkForUpdates()
  expect(updateCheckResult.fileInfo).toMatchSnapshot()
  await assertThat(path.join(await updateCheckResult.downloadPromise)).isFile()

  expect(actualEvents).toEqual(expectedEvents)
})

test("file url generic", async () => {
  const updater = new NsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig(<GenericServerOptions>{
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  })

  const actualEvents = trackEvents(updater)

  const updateCheckResult = await updater.checkForUpdates()
  expect(updateCheckResult.fileInfo).toMatchSnapshot()
  await assertThat(path.join(await updateCheckResult.downloadPromise)).isFile()

  expect(actualEvents).toMatchSnapshot()
})

test.ifNotCiWin("sha2 mismatch error event", async () => {
  const updater = new NsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig(<GenericServerOptions>{
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
    channel: "beta",
  })
  updater.logger = console

  const actualEvents = trackEvents(updater)

  const updateCheckResult = await updater.checkForUpdates()
  expect(updateCheckResult.fileInfo).toMatchSnapshot()
  await assertThat(updateCheckResult.downloadPromise).throws()

  expect(actualEvents).toMatchSnapshot()
})

test("file url generic - manual download", async () => {
  const updater = new NsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig(<GenericServerOptions>{
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  })
  updater.autoDownload = false

  const actualEvents = trackEvents(updater)

  const updateCheckResult = await updater.checkForUpdates()
  expect(updateCheckResult.fileInfo).toMatchSnapshot()
  expect(updateCheckResult.downloadPromise).toBeNull()
  expect(actualEvents).toMatchSnapshot()

  await assertThat(path.join(await updater.downloadUpdate())).isFile()
})

// https://github.com/electron-userland/electron-builder/issues/1045
test("checkForUpdates several times", async () => {
  const updater = new NsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig(<GenericServerOptions>{
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  })

  const actualEvents = trackEvents(updater)

  for (let i = 0; i < 10; i++) {
    //noinspection JSIgnoredPromiseFromCall
    updater.checkForUpdates()
  }
  const updateCheckResult = await updater.checkForUpdates()
  expect(updateCheckResult.fileInfo).toMatchSnapshot()
  await assertThat(path.join(await updateCheckResult.downloadPromise)).isFile()

  expect(actualEvents).toMatchSnapshot()
})

test("file url github", async () => {
  const updater = new NsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig(<GithubOptions>{
      provider: "github",
      owner: "develar",
      repo: "__test_nsis_release",
    })

  const actualEvents: Array<string> = []
  const expectedEvents = ["checking-for-update", "update-available", "update-downloaded"]
  for (const eventName of expectedEvents) {
    updater.addListener(eventName, () => {
      actualEvents.push(eventName)
    })
  }

  const updateCheckResult = await updater.checkForUpdates()
  expect(updateCheckResult.fileInfo).toMatchSnapshot()
  await assertThat(path.join(await updateCheckResult.downloadPromise)).isFile()

  expect(actualEvents).toEqual(expectedEvents)
})

test("test error", async () => {
  const updater: NsisUpdater = new NsisUpdater()

  const actualEvents = trackEvents(updater)

  await assertThat(updater.checkForUpdates()).throws()
  expect(actualEvents).toMatchSnapshot()
})

test("test download progress", async () => {
  const updater = new NsisUpdater()
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

test("cancel download with progress", async () => {
  const updater = new NsisUpdater()
  updater.updateConfigPath = await writeUpdateConfig({
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/full-test",
  })

  const progressEvents: Array<any> = []
  updater.signals.progress(it => progressEvents.push(it))

  let cancelled = false
  updater.signals.updateCancelled(() => cancelled = true)

  const checkResult = await updater.checkForUpdates()
  checkResult.cancellationToken.cancel()

  if (progressEvents.length > 0) {
    const lastEvent = progressEvents[progressEvents.length - 1]
    expect(lastEvent.percent).not.toBe(100)
    expect(lastEvent.bytesPerSecond).toBeGreaterThan(1)
    expect(lastEvent.transferred).not.toBe(lastEvent.total)
  }

  const downloadPromise = <BluebirdPromise<any>>checkResult.downloadPromise
  await assertThat(downloadPromise).throws()
  expect(downloadPromise.isRejected()).toBe(true)
  expect(cancelled).toBe(true)
})

async function writeUpdateConfig(data: GenericServerOptions | GithubOptions | BintrayOptions): Promise<string> {
  const updateConfigPath = path.join(await tmpDir.getTempFile("update-config"), "app-update.yml")
  await outputFile(updateConfigPath, safeDump(data))
  return updateConfigPath
}

function trackEvents(updater: NsisUpdater) {
  const actualEvents: Array<string> = []
  for (const eventName of ["checking-for-update", "update-available", "update-downloaded", "error"]) {
    updater.addListener(eventName, () => {
      actualEvents.push(eventName)
    })
  }
  return actualEvents
}