import { assertThat } from "./helpers/fileAssert"
import { NsisUpdater } from "electron-auto-updater/out/NsisUpdater"
import * as path from "path"
import { TmpDir } from "out/util/tmp"
import { outputFile } from "fs-extra-p"
import { safeDump } from "js-yaml"
import { GenericServerOptions, GithubOptions } from "electron-builder-http/out/publishOptions"

if (process.env.ELECTRON_BUILDER_OFFLINE === "true") {
  fit("Skip ArtifactPublisherTest suite — ELECTRON_BUILDER_OFFLINE is defined", () => {
    console.warn("[SKIP] Skip ArtifactPublisherTest suite — ELECTRON_BUILDER_OFFLINE is defined")
  })
}

const NsisUpdaterClass = require("../../packages/electron-auto-updater/out/NsisUpdater").NsisUpdater

const g = (<any>global)
g.__test_app = {
  getVersion: function () {
    return "0.0.1"
  },

  on: function () {
    // ignored
  },
}

test("check updates - no versions at all", async () => {
  const updater: NsisUpdater = new NsisUpdaterClass({
      provider: "bintray",
      owner: "actperepo",
      package: "no-versions",
    })

  await assertThat(updater.checkForUpdates()).throws(/No latest version, please ensure that/)
})

test("cannot find suitable file for version", async () => {
  const updater: NsisUpdater = new NsisUpdaterClass({
    provider: "bintray",
    owner: "actperepo",
    package: "incorrect-file-version",
  })

  await assertThat(updater.checkForUpdates()).throws(/Cannot find suitable file for version 1.0.0 in/)
})

test("file url", async () => {
  const tmpDir = new TmpDir()
  const testResourcesPath = await tmpDir.getTempFile("update-config")
  await outputFile(path.join(testResourcesPath, "app-update.yml"), safeDump({
    provider: "bintray",
    owner: "actperepo",
    package: "TestApp",
  }))
  g.__test_resourcesPath = testResourcesPath
  const updater: NsisUpdater = new NsisUpdaterClass()

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
  const tmpDir = new TmpDir()
  const testResourcesPath = await tmpDir.getTempFile("update-config")
  await outputFile(path.join(testResourcesPath, "app-update.yml"), safeDump(<GenericServerOptions>{
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  }))
  g.__test_resourcesPath = testResourcesPath
  const updater: NsisUpdater = new NsisUpdaterClass()

  const actualEvents = trackEvents(updater)

  const updateCheckResult = await updater.checkForUpdates()
  expect(updateCheckResult.fileInfo).toMatchSnapshot()
  await assertThat(path.join(await updateCheckResult.downloadPromise)).isFile()

  expect(actualEvents).toMatchSnapshot()
})

test("file url generic - manual download", async () => {
  const tmpDir = new TmpDir()
  const testResourcesPath = await tmpDir.getTempFile("update-config")
  await outputFile(path.join(testResourcesPath, "app-update.yml"), safeDump(<GenericServerOptions>{
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  }))
  g.__test_resourcesPath = testResourcesPath
  const updater: NsisUpdater = new NsisUpdaterClass()
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
  const tmpDir = new TmpDir()
  const testResourcesPath = await tmpDir.getTempFile("update-config")
  await outputFile(path.join(testResourcesPath, "app-update.yml"), safeDump(<GenericServerOptions>{
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  }))
  g.__test_resourcesPath = testResourcesPath
  const updater: NsisUpdater = new NsisUpdaterClass()

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
  const tmpDir = new TmpDir()
  const testResourcesPath = await tmpDir.getTempFile("update-config")
  await outputFile(path.join(testResourcesPath, "app-update.yml"), safeDump(<GithubOptions>{
    provider: "github",
    owner: "develar",
    repo: "__test_nsis_release",
  }))
  g.__test_resourcesPath = testResourcesPath
  const updater: NsisUpdater = new NsisUpdaterClass()

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
  g.__test_resourcesPath = null
  const updater: NsisUpdater = new NsisUpdaterClass()

  const actualEvents = trackEvents(updater)

  await assertThat(updater.checkForUpdates()).throws("Path must be a string. Received undefined")
  expect(actualEvents).toMatchSnapshot()
})

test("test download progress", async () => {
  const tmpDir = new TmpDir()
  const testResourcesPath = await tmpDir.getTempFile("update-config")
  await outputFile(path.join(testResourcesPath, "app-update.yml"), safeDump(<GenericServerOptions>{
    provider: "generic",
    url: "https://develar.s3.amazonaws.com/test",
  }))
  g.__test_resourcesPath = testResourcesPath
  const updater: NsisUpdater = new NsisUpdaterClass()
  updater.autoDownload = false

  const progressEvents: Array<any> = []

  updater.addListener("download-progress", (e: any, progress: any) => {
    progressEvents.push(progress)
  })

  await updater.checkForUpdates()
  await updater.downloadUpdate()

  expect(progressEvents.length).toBeGreaterThanOrEqual(1)

  const lastEvent = progressEvents.pop()

  expect(parseInt(lastEvent.percent, 10)).toBe(100)
  expect(lastEvent.bytesPerSecond).toBeGreaterThan(1)
  expect(lastEvent.transferred).toBe(lastEvent.total)
})

function trackEvents(updater: NsisUpdater) {
  const actualEvents: Array<string> = []
  for (const eventName of ["checking-for-update", "update-available", "update-downloaded", "error"]) {
    updater.addListener(eventName, () => {
      actualEvents.push(eventName)
    })
  }
  return actualEvents
}