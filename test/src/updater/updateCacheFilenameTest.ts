import { getCacheUpdateFileName } from "electron-updater/src/AppUpdater"
import { ResolvedUpdateFileInfo } from "electron-updater/src/types"
import { expect, test } from "vitest"

function fileInfo(manifestUrl: string, downloadUrl = "https://example.com/latest"): ResolvedUpdateFileInfo {
  return {
    url: new URL(downloadUrl),
    info: { url: manifestUrl, sha512: "checksum" },
  }
}

test.each(["", ".", "..", "bad\0name.exe"])("rejects unsafe manifest filename %j", manifestUrl => {
  expect(() => getCacheUpdateFileName(fileInfo(manifestUrl), "exe")).toThrowError(expect.objectContaining({ code: "ERR_UPDATER_INVALID_FILE_NAME" }))
})

test("keeps the basename of a nested manifest path", () => {
  expect(getCacheUpdateFileName(fileInfo("../../safe.exe"), "exe")).toBe("safe.exe")
})

test("prefers a matching decoded download URL filename", () => {
  expect(getCacheUpdateFileName(fileInfo("fallback.exe", "https://example.com/My%20App.exe"), "exe")).toBe("My App.exe")
})
