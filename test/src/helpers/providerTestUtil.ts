import { ExpectStatic } from "vitest"

/**
 * A deterministic base64-encoded SHA-512 placeholder used in every mockYaml.
 * Long enough to pass validation; meaningless as an actual hash.
 */
export const MOCK_SHA512 = "YmFzZTY0ZW5jb2RlZHNoYTUxMnN0cmluZ2ZvcnRlc3RpbmdwdXJwb3Nlc29ubHk="

/**
 * Generates a minimal, valid channel YAML (latest.yml / beta.yml / etc.)
 * that every provider's parseUpdateInfo will accept.
 */
export function mockYaml(version: string, appName = "my-app"): string {
  return `version: ${version}
files:
  - url: ${appName}-Setup-${version}.exe
    sha512: ${MOCK_SHA512}
    size: 12345678
path: ${appName}-Setup-${version}.exe
sha512: ${MOCK_SHA512}
releaseDate: '2024-01-01T00:00:00.000Z'
`
}

/**
 * Type-safe accessor for the provider instance stored inside an updater
 * after checkForUpdates() has been called.
 */
export function getProvider<T>(updater: any): T {
  return updater.updateInfoAndProvider?.provider as T
}

/**
 * Asserts the canonical "autoDownload=false" contract:
 * - downloadPromise is null (no download was triggered)
 * - events are exactly ["checking-for-update", "update-available"]
 */
export function assertDownloadNotTriggered(expect: ExpectStatic, result: any, actualEvents: string[]): void {
  expect(result?.downloadPromise).toBeNull()
  expect(actualEvents).toEqual(["checking-for-update", "update-available"])
}
