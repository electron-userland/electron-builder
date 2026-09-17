import { CancellationToken, PackageFileInfo } from "builder-util-runtime"
import { NsisUpdater } from "electron-updater"
import type { AppAdapter } from "electron-updater/src/AppAdapter"
import { FileWithEmbeddedBlockMapDifferentialDownloader } from "electron-updater/src/differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader"
import { afterEach, expect, test, vi } from "vitest"

const stubApp: AppAdapter = {
  name: "TestApp",
  version: "1.0.0",
  isPackaged: false,
  appUpdateConfigPath: "/tmp/app-update.yml",
  userDataPath: "/tmp",
  baseCachePath: "/tmp",
  whenReady: () => Promise.resolve(),
  relaunch() {},
  quit() {},
  onQuit() {},
}

afterEach(() => {
  vi.restoreAllMocks()
})

test("passes provider-computed headers to differential web package downloads", async () => {
  const updater = new NsisUpdater(null, stubApp)
  ;(updater as any).downloadedUpdateHelper = { cacheDir: "/tmp/updater-cache" }
  let requestHeaders: unknown
  vi.spyOn(FileWithEmbeddedBlockMapDifferentialDownloader.prototype, "download").mockImplementation(function (this: FileWithEmbeddedBlockMapDifferentialDownloader) {
    requestHeaders = this.options.requestHeaders
    return Promise.resolve()
  })
  const headers = { authorization: "Bearer private-release-token", accept: "*/*" }
  const packageInfo: PackageFileInfo = {
    path: "https://example.com/package.7z",
    sha512: "checksum",
    blockMapSize: 10,
  }

  const requiresFullDownload = await (updater as any).differentialDownloadWebPackage(
    {
      updateInfoAndProvider: { info: { version: "1.0.1" } },
      requestHeaders: headers,
      cancellationToken: new CancellationToken(),
    },
    packageInfo,
    "/tmp/package.7z",
    { isUseMultipleRangeRequest: false }
  )

  expect(requiresFullDownload).toBe(false)
  expect(requestHeaders).toBe(headers)
})
