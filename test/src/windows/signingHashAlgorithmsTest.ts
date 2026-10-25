import { InvalidConfigurationError } from "builder-util"
import { resolveSigningHashAlgorithms } from "app-builder-lib/internal"
import { describe, expect, test } from "vitest"

type Configured = Parameters<typeof resolveSigningHashAlgorithms>[1]

// file, configured signingHashAlgorithms, expected passes
const table: Array<[string, Configured, Array<"sha1" | "sha256">]> = [
  // .msi holds one signature: sha256 unless sha1 is the only algorithm requested
  ["app.msi", undefined, ["sha256"]],
  ["app.msi", null, ["sha256"]],
  ["app.msi", ["sha1", "sha256"], ["sha256"]],
  ["app.msi", ["sha256", "sha1"], ["sha256"]],
  ["app.msi", ["sha256"], ["sha256"]],
  ["app.msi", ["sha1"], ["sha1"]],
  ["app.msi", "sha1", ["sha1"]],
  // extensions match case-insensitively
  ["app.MSI", undefined, ["sha256"]],
  ["app.Msi", ["sha1"], ["sha1"]],
  // AppX and MSIX are always sha256
  ["app.appx", ["sha1"], ["sha256"]],
  ["app.msix", undefined, ["sha256"]],
  ["app.msixbundle", ["sha1", "sha256"], ["sha256"]],
  ["app.APPX", ["sha1"], ["sha256"]],
  ["app.MSIXBundle", undefined, ["sha256"]],
  // everything else: the configured list, defaulting to dual signing
  ["app.exe", undefined, ["sha1", "sha256"]],
  ["app.exe", null, ["sha1", "sha256"]],
  ["app.exe", ["sha256"], ["sha256"]],
  ["app.exe", ["sha1"], ["sha1"]],
  ["app.exe", "sha256", ["sha256"]],
  ["app.dll", ["sha256", "sha1"], ["sha256", "sha1"]],
]

describe("resolveSigningHashAlgorithms", () => {
  test.each(table)("%s with %j signs with %j", (file, configured, expected) => {
    expect(resolveSigningHashAlgorithms(file, configured)).toEqual(expected)
  })

  // an empty list would run no signing pass yet report the file as signed
  test.each(["app.exe", "app.dll", "app.msi", "app.appx"])("%s with [] throws InvalidConfigurationError", file => {
    expect(() => resolveSigningHashAlgorithms(file, [])).toThrow(InvalidConfigurationError)
  })
})
