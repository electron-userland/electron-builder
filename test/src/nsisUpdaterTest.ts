import { assertThat } from "./helpers/fileAssert"
import { NsisUpdater } from "out/nsis-auto-updater/src/NsisUpdater"
import * as path from "path"
import { TmpDir } from "out/util/tmp"
import { outputFile } from "fs-extra-p"
import { safeDump } from "js-yaml"
import { GenericServerOptions } from "out/options/publishOptions"
import { GithubOptions } from "out/options/publishOptions"
import BluebirdPromise from "bluebird-lst-c"

const NsisUpdaterClass = require("../../nsis-auto-updater/out/nsis-auto-updater/src/NsisUpdater").NsisUpdater

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
  for (let eventName of expectedEvents) {
    updater.addListener(eventName, () => {
      actualEvents.push(eventName)
    })
  }

  const updateCheckResult = await updater.checkForUpdates()
  assertThat(updateCheckResult.fileInfo).hasProperties({
    url: "https://dl.bintray.com/actperepo/generic/TestApp Setup 1.1.0.exe"
  })
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

  const actualEvents: Array<string> = []
  const expectedEvents = ["checking-for-update", "update-available", "update-downloaded"]
  for (let eventName of expectedEvents) {
    updater.addListener(eventName, () => {
      actualEvents.push(eventName)
    })
  }

  const updateCheckResult = await updater.checkForUpdates()
  assertThat(updateCheckResult.fileInfo).hasProperties({
    url: "https://develar.s3.amazonaws.com/test/TestApp Setup 1.1.0.exe"
  })
  await assertThat(path.join(await updateCheckResult.downloadPromise)).isFile()

  expect(actualEvents).toEqual(expectedEvents)
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
  for (let eventName of expectedEvents) {
    updater.addListener(eventName, () => {
      actualEvents.push(eventName)
    })
  }

  const updateCheckResult = await updater.checkForUpdates()
  assertThat(updateCheckResult.fileInfo).hasProperties({
    url: "https://github.com/develar/__test_nsis_release/releases/download/v1.1.0/TestApp-Setup-1.1.0.exe"
  })
  await assertThat(path.join(await updateCheckResult.downloadPromise)).isFile()

  expect(actualEvents).toEqual(expectedEvents)
})

test("test error", async () => {
  const updater: NsisUpdater = new NsisUpdaterClass()

  const actualEvents: Array<string> = []
  const expectedEvents = ["checking-for-update", "error"]
  for (let eventName of expectedEvents) {
    updater.addListener(eventName, () => {
      actualEvents.push(eventName)
    })
  }

  await assertThat(updater.checkForUpdates()).throws("Path must be a string. Received undefined")
  await new BluebirdPromise(function (resolve, reject) {
    setTimeout(() => {
      try {
        expect(actualEvents).toEqual(expectedEvents)
      }
      catch (e) {
        reject(e)
      }

      resolve()
    }, 500)
  })
})