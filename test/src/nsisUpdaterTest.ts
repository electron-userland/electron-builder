import test from "./helpers/avaEx"
import { assertThat } from "./helpers/fileAssert"
import { NsisUpdater } from "out/nsis-auto-updater/src/NsisUpdater"
import * as path from "path"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter");

(<any>global).__test_app = {
  getVersion: function () {
    return "0.0.1"
  }
}

const NsisUpdaterClass = require("../../nsis-auto-updater/out/nsis-auto-updater/src/NsisUpdater").NsisUpdater

test("check updates - no versions at all", async (t) => {
  const updater: NsisUpdater = new NsisUpdaterClass({
      provider: "bintray",
      owner: "actperepo",
      package: "no-versions",
    })

  t.throws(updater.checkForUpdates(), /No latest version, please ensure that/)
})

test("cannot find suitable file for version", async (t) => {
  const updater: NsisUpdater = new NsisUpdaterClass({
    provider: "bintray",
    owner: "actperepo",
    package: "incorrect-file-version",
  })

  t.throws(updater.checkForUpdates(), /Cannot find suitable file for version 1.0.0 in/)
})

test("file url", async () => {
  const updater: NsisUpdater = new NsisUpdaterClass({
    provider: "bintray",
    owner: "actperepo",
    package: "TestApp",
  })

  const updateCheckResult = await updater.checkForUpdates()
  assertThat(updateCheckResult.fileInfo).hasProperties({
    url: "https://dl.bintray.com/actperepo/generic/TestApp Setup 1.1.0.exe"
  })
  assertThat(path.join(await updateCheckResult.downloadPromise)).isFile()
})