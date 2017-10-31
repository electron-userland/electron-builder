import { TmpDir, serializeToYaml } from "builder-util"
import { BintrayOptions, GenericServerOptions, GithubOptions, S3Options, SpacesOptions } from "builder-util-runtime"
import { httpExecutor } from "builder-util/out/nodeHttpExecutor"
import { AppUpdater, NoOpLogger } from "electron-updater"
import { MacUpdater } from "electron-updater/out/MacUpdater"
import { outputFile } from "fs-extra-p"
import { tmpdir } from "os"
import * as path from "path"
import { assertThat } from "./fileAssert"

const tmpDir = new TmpDir()

export function createTestApp(version: string, appPath = "") {
  class MockApp {
    // noinspection JSMethodCanBeStatic,JSUnusedGlobalSymbols
    getVersion() {
      return version
    }

    // noinspection JSMethodCanBeStatic,JSUnusedGlobalSymbols
    getAppPath() {
      return appPath
    }

    // noinspection JSMethodCanBeStatic,JSUnusedGlobalSymbols
    getPath(type: string) {
      return path.join(tmpdir(), "electron-updater-test", type)
    }

    on() {
      // ignored
    }

    isReady() {
      return true
    }
  }
  return new MockApp()
}

// to reduce difference in test mode, setFeedURL is not used to set (NsisUpdater also read configOnDisk to load original publisherName)
export async function writeUpdateConfig<T extends GenericServerOptions | GithubOptions | BintrayOptions | S3Options | SpacesOptions>(data: T): Promise<string> {
  const updateConfigPath = path.join(await tmpDir.getTempDir(), "app-update.yml")
  await outputFile(updateConfigPath, serializeToYaml(data))
  return updateConfigPath
}

export async function validateDownload(updater: AppUpdater, expectDownloadPromise = true) {
  tuneNsisUpdater(updater)
  const actualEvents = trackEvents(updater)

  const updateCheckResult = await updater.checkForUpdates()
  expect(updateCheckResult.updateInfo).toMatchSnapshot()
  if (expectDownloadPromise) {
    if (updater instanceof MacUpdater) {
      expect(await updateCheckResult.downloadPromise).toEqual([])
    }
    else {
      await assertThat(path.join((await updateCheckResult.downloadPromise)!![0])).isFile()
    }
  }
  else {
    expect(updateCheckResult.downloadPromise).toBeUndefined()
  }

  expect(actualEvents).toMatchSnapshot()
  return updateCheckResult
}

export function tuneNsisUpdater(updater: AppUpdater) {
  (updater as any).httpExecutor = httpExecutor
  updater.logger = new NoOpLogger()
}

export function trackEvents(updater: AppUpdater) {
  const actualEvents: Array<string> = []
  for (const eventName of ["checking-for-update", "update-available", "update-downloaded", "error"]) {
    updater.addListener(eventName, () => {
      actualEvents.push(eventName)
    })
  }
  return actualEvents
}