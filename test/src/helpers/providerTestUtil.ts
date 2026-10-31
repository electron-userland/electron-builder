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
 * mockYaml plus a chain of YAML aliases as releaseNotes: each level references the previous one twice,
 * so a few hundred bytes reach 2^depth values.
 */
export function mockAliasChainYaml(version: string, depth: number): string {
  let yaml = `${mockYaml(version)}l0: &l0 [x, x]\n`
  for (let i = 1; i <= depth; i++) {
    yaml += `l${i}: &l${i} [*l${i - 1}, *l${i - 1}]\n`
  }
  return `${yaml}releaseNotes: *l${depth}\n`
}

/**
 * mockYaml plus two complex mapping keys (`? [*s, *s, ...]`) that each reference a 10000-character string `count` times.
 * js-yaml converts each key to a string while loading, and the two keys convert to the same string,
 * so a manifest that is not rejected before its keys are converted fails as a duplicated mapping key instead.
 */
export function mockComplexKeyYaml(version: string, count = 200): string {
  const key = `? [${Array(count).fill("*s").join(", ")}]\n`
  return `${mockYaml(version)}s: &s ${"A".repeat(10_000)}\n${key}: 0\n${key}: 1\n`
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
