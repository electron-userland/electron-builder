import { getCachePackageFileName, getCacheUpdateFileName } from "electron-updater/src/AppUpdater"
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

// the extension of the web installer package comes from the URL path: a query (Keygen's `?product=`, an auth token, a pre-signed URL)
// must not reach the file name, and `?` or `:` cannot be in a Windows file name
test.each([
  ["https://example.com/app-1.2.3-x64.nsis.7z", "package-1.2.3.7z"],
  ["https://example.com/app-1.2.3-x64.nsis.zip", "package-1.2.3.zip"],
  ["https://api.keygen.sh/v1/accounts/a/artifacts/app-1.2.3-x64.nsis.7z?product=p", "package-1.2.3.7z"],
  ["https://example.com/app-1.2.3-x64.nsis.7z?token=abc", "package-1.2.3.7z"],
  ["https://example.com/app-1.2.3-x64.nsis.7z?token=abc.def", "package-1.2.3.7z"],
  ["https://example.com/app-1.2.3-x64.nsis.7z?t=a.b:c", "package-1.2.3.7z"],
  ["https://bucket.s3.amazonaws.com/app-1.2.3-x64.nsis.7z?X-Amz-Credential=AKIA%2F20240101%2Fus-east-1&X-Amz-Signature=abc", "package-1.2.3.7z"],
  ["https://example.com/app-1.2.3-x64.nsis.7z#part.zip", "package-1.2.3.7z"],
  ["https://example.com/app-1.2.3-x64.7z:stream", "package-1.2.3.7z"],
  ["https://example.com/download/package", "package-1.2.3.7z"],
  ["https://example.com/app-1.2.3-x64.nsis.longextension", "package-1.2.3.7z"],
  ["https://example.com/app-1.2.3-x64.nsis.7zé", "package-1.2.3.7z"],
  ["app-1.2.3-x64.nsis.7zé", "package-1.2.3.7z"],
  ["not a url", "package-1.2.3.7z"],
])("package file name of %j is %j", (packageUrl, expected) => {
  const fileName = getCachePackageFileName("1.2.3", packageUrl)
  expect(fileName).toBe(expected)
  expect(fileName).not.toMatch(/[<>:"|?*]/)
})
