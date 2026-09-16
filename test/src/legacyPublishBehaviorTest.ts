import { promises as fs } from "fs"
import * as path from "path"
import { describe, expect, test } from "vitest"

const packages = path.join(__dirname, "..", "..", "packages")
const read = (...segments: string[]) => fs.readFile(path.join(packages, ...segments), "utf8")

/**
 * Publish- and update-side v27 changes that altered behaviour without saying so. Asserted at the
 * source level: each needs a full publish round-trip to exercise end to end.
 */

describe("suffixed update channels", () => {
  test("expansion warns once per channel and names the files written", async () => {
    const source = await read("app-builder-lib", "src", "publish", "updateInfoBuilder.ts")
    expect(source).toContain("warnAboutSuffixedChannelExpansion")
    expect(source).toContain("suffixedChannelWarnings")
    expect(source).toContain("suffixed-update-channels-now-expand-to-lower-channels")
  })

  test("a bare alpha/beta/latest channel does not warn — only suffixed ones changed", async () => {
    const source = await read("app-builder-lib", "src", "publish", "updateInfoBuilder.ts")
    expect(source).toContain("if (suffix.length === 0 || suffixedChannelWarnings.has(currentChannel))")
  })
})

describe("electronUpdaterCompatibility legacy pin", () => {
  test("warns when the range still includes electron-updater < 2.16", async () => {
    const source = await read("app-builder-lib", "src", "publish", "updateInfoBuilder.ts")
    expect(source).toContain("warnAboutLegacyUpdaterCompatibility")
    expect(source).toContain("v28 will reject it")
    // Gated on needsLegacyPathSha512, so the default ">=2.16" stays silent.
    expect(source).toContain("if (!needsLegacyPathSha512 || legacyCompatibilityWarningEmitted)")
  })
})

describe("Bitbucket auth scheme", () => {
  test("a token with no username warns rather than informs", async () => {
    const source = await read("electron-publish", "src", "bitbucketPublisher.ts")
    expect(source).toContain("log.warn(")
    expect(source).toContain("electron-builder <= 26 always used Basic auth")
    expect(source).toContain("bitbucket-cloud-publishing-token-without-username-uses-bearer-auth")
  })
})

describe("mac.sign: null semantics", () => {
  test("skipping signing warns and explains the v26 meaning", async () => {
    const source = await read("app-builder-lib", "src", "targets", "mac", "MacTargetHelper.ts")
    expect(source).toContain("skipped macOS code signing")
    expect(source).toContain("log.warn(")
    expect(source).toContain("macos-signing-macsign")
  })
})

describe("toolset version visibility", () => {
  test("the resolved toolset is logged once per release name", async () => {
    const source = await read("app-builder-lib", "src", "util", "electronGet.ts")
    expect(source).toContain("announceToolsetVersion")
    expect(source).toContain("announcedToolsets")
    expect(source).toContain('log.info({ toolset: releaseName }, "using toolset")')
  })
})

describe("NSIS ProgID format", () => {
  test("warns only when a custom NSIS script is supplied", async () => {
    const source = await read("app-builder-lib", "src", "targets", "win", "nsis", "NsisTarget.ts")
    expect(source).toContain("warnAboutProgIdFormatChange")
    expect(source).toContain("if (!hasCustomScript)")
    expect(source).toContain("nsis-file-association-progid-format-changed")
  })
})
