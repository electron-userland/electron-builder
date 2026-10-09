import { afterEach, beforeEach, expect, vi } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import { Arch, InvalidConfigurationError, log } from "builder-util"
import { PlatformPackager, type MacPackager } from "app-builder-lib"
import {
  isLoadableMachOFileType,
  isMachOFile,
  MachOFileType,
  MacTargetHelper,
  parsePlistFile,
  parseSigningTeamId,
  readMachOFileType,
  type PlistObject,
  type PlatformType,
} from "app-builder-lib/internal"
import { savePlistFile } from "app-builder-lib/src/util/mac/plist"

/** A packager stub that resolves resources with the real `getResource`, so the tests exercise its contract (containment, project-dir fallback, missing-file error). */
function fakePackager(resourceFiles: string[] = [], buildResourcesDir = "/nonexistent", config: Record<string, unknown> = {}): MacPackager {
  return {
    config,
    info: { buildResourcesDir },
    projectDir: buildResourcesDir,
    resourceList: Promise.resolve(resourceFiles),
    getResource: PlatformPackager.prototype.getResource,
  } as any
}

// Mach-O fixtures shared by the warnAboutForeignSignedBinaries and readMachOFileType tests
const CPU_TYPE_ARM64 = 0x0100000c
const CPU_SUBTYPE_ALL = 0

/** `magic`, `cputype`, `cpusubtype`, `filetype` — the first 16 bytes of a thin header, in the given byte order. */
function thinHeader(filetype: number, endian: "LE" | "BE"): Buffer {
  const header = Buffer.alloc(32)
  if (endian === "LE") {
    Buffer.from([0xcf, 0xfa, 0xed, 0xfe]).copy(header, 0)
    header.writeUInt32LE(CPU_TYPE_ARM64, 4)
    header.writeUInt32LE(CPU_SUBTYPE_ALL, 8)
    header.writeUInt32LE(filetype, 12)
  } else {
    Buffer.from([0xfe, 0xed, 0xfa, 0xce]).copy(header, 0)
    header.writeUInt32BE(CPU_TYPE_ARM64, 4)
    header.writeUInt32BE(CPU_SUBTYPE_ALL, 8)
    header.writeUInt32BE(filetype, 12)
  }
  return header
}

/** A fat header with one `fat_arch` whose slice (a thin little-endian header) sits at `sliceOffset`. */
function fatBinary(filetype: number, sliceOffset: number): Buffer {
  const fat = Buffer.alloc(sliceOffset + 32)
  Buffer.from([0xca, 0xfe, 0xba, 0xbe]).copy(fat, 0)
  fat.writeUInt32BE(1, 4) // nfat_arch
  fat.writeUInt32BE(CPU_TYPE_ARM64, 8) // cputype
  fat.writeUInt32BE(CPU_SUBTYPE_ALL, 12) // cpusubtype
  fat.writeUInt32BE(sliceOffset, 16) // offset
  fat.writeUInt32BE(32, 20) // size
  fat.writeUInt32BE(12, 24) // align (2^12)
  thinHeader(filetype, "LE").copy(fat, sliceOffset)
  return fat
}

async function writeBinary(dir: string, name: string, bytes: Buffer | number[]): Promise<string> {
  const file = path.join(dir, name)
  await fs.writeFile(file, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes))
  return file
}

describe("MacTargetHelper", () => {
  describe("getCertificateTypes", () => {
    const cases: [PlatformType, "development" | "distribution", string[]][] = [
      ["mas", "distribution", ["Apple Distribution", "3rd Party Mac Developer Application"]],
      ["mas", "development", ["Mac Developer", "Apple Development"]],
      ["mas-dev", "development", ["Mac Developer", "Apple Development"]],
      ["mas-dev", "distribution", ["Apple Distribution", "3rd Party Mac Developer Application"]],
      ["mac", "distribution", ["Developer ID Application"]],
      ["mac", "development", ["Mac Developer", "Apple Development"]],
    ]

    test.each(cases)("%s %s", (targetPlatform, type, expected) => {
      expect(MacTargetHelper.getCertificateTypes(targetPlatform, type)).toEqual(expected)
    })
  })

  describe("resolveSigningType", () => {
    const cases: [PlatformType, "development" | "distribution" | undefined, string][] = [
      // default is derived from the build flavor
      ["mas-dev", undefined, "development"],
      ["mas", undefined, "distribution"],
      ["mac", undefined, "distribution"],
      // an explicit sign.type wins over the default
      ["mac", "development", "development"],
      ["mas", "development", "development"],
      ["mas-dev", "distribution", "distribution"],
    ]

    test.each(cases)("targetPlatform=%s configType=%s => %s", (targetPlatform, configType, expected) => {
      expect(MacTargetHelper.resolveSigningType(targetPlatform, configType)).toBe(expected)
    })
  })

  describe("shouldCreateMasInstaller", () => {
    const cases: [PlatformType, "development" | "distribution" | undefined, boolean][] = [
      ["mas", undefined, true],
      ["mas", "distribution", true],
      // explicit development signing on a mas build skips the .pkg installer
      ["mas", "development", false],
      ["mas-dev", undefined, false],
      ["mac", undefined, false],
      ["mac", "development", false],
    ]

    test.each(cases)("targetPlatform=%s configType=%s => %s", (targetPlatform, configType, expected) => {
      expect(MacTargetHelper.shouldCreateMasInstaller(targetPlatform, configType)).toBe(expected)
    })
  })

  describe("buildSignOptions", () => {
    function makeHelper(): MacTargetHelper {
      return new MacTargetHelper(fakePackager([], "/nonexistent", { electronVersion: "38.0.0" }))
    }

    const identity = { name: "Test Identity", hash: "HASH" } as any

    const cases: [PlatformType, "development" | "distribution" | undefined, string][] = [
      ["mac", undefined, "distribution"],
      ["mas", undefined, "distribution"],
      ["mas-dev", undefined, "development"],
      // explicit sign.type is forwarded to @electron/osx-sign
      ["mac", "development", "development"],
      ["mas", "development", "development"],
    ]

    test.each(cases)("targetPlatform=%s type=%s => signs with type %s", async (targetPlatform, type, expected) => {
      const config = type == null ? undefined : { type }
      const signOptions = await makeHelper().buildSignOptions("/project/My.app", identity, config, null, Arch.x64, targetPlatform)
      expect(signOptions.type).toBe(expected)
      expect(signOptions.platform).toBe(targetPlatform === "mac" ? "darwin" : "mas")
    })
  })

  // `codesign --sign` needs the unique hash (a common name can match several valid certs), while
  // @electron/osx-sign's entitlements automation needs the `(TEAMID)` suffix of the name. See
  // MacTargetHelper.resolveSignIdentity.
  describe("resolveSignIdentity", () => {
    const HASH = "0123456789ABCDEF0123456789ABCDEF01234567"
    const identity = { name: "Developer ID Application: Foo (TEAM123)", hash: HASH } as any

    const entitlementsPlist = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
${body}
  </dict>
</plist>
`
    const sandboxedPlist = entitlementsPlist(`    <key>com.apple.security.app-sandbox</key>
    <true/>`)
    const nonSandboxedPlist = entitlementsPlist(`    <key>com.apple.security.cs.allow-jit</key>
    <true/>`)

    function makeHelper(resourceFiles: string[] = [], buildResourcesDir = "/nonexistent"): MacTargetHelper {
      return new MacTargetHelper(fakePackager(resourceFiles, buildResourcesDir))
    }

    async function makeApp(dir: string, info: Record<string, unknown> = {}): Promise<string> {
      const appPath = path.join(dir, "My.app")
      await fs.mkdir(path.join(appPath, "Contents"), { recursive: true })
      await savePlistFile(path.join(appPath, "Contents", "Info.plist"), { CFBundleIdentifier: "com.example.app", ...info })
      return appPath
    }

    const readInfo = (appPath: string) => parsePlistFile<PlistObject>(path.join(appPath, "Contents", "Info.plist"))

    test("a mac build signs with the hash and leaves Info.plist alone", async ({ tmpDir }) => {
      const appPath = await makeApp(await tmpDir.createTempDir())
      await expect(makeHelper().resolveSignIdentity(appPath, identity, undefined, "mac")).resolves.toBe(HASH)
      expect((await readInfo(appPath)).ElectronTeamID).toBeUndefined()
    })

    test.for<[PlatformType]>([["mas"], ["mas-dev"]])("a %s build signs with the hash and fills in ElectronTeamID", async ([targetPlatform], { tmpDir }) => {
      const appPath = await makeApp(await tmpDir.createTempDir())
      await expect(makeHelper().resolveSignIdentity(appPath, identity, undefined, targetPlatform)).resolves.toBe(HASH)
      expect((await readInfo(appPath)).ElectronTeamID).toBe("TEAM123")
    })

    test("an existing ElectronTeamID is preserved", async ({ tmpDir }) => {
      const appPath = await makeApp(await tmpDir.createTempDir(), { ElectronTeamID: "EXISTING" })
      await expect(makeHelper().resolveSignIdentity(appPath, identity, undefined, "mas")).resolves.toBe(HASH)
      expect((await readInfo(appPath)).ElectronTeamID).toBe("EXISTING")
    })

    // @electron/osx-sign takes the Team ID from the profile, so there is nothing to fill in
    test("a configured provisioningProfile signs with the hash without touching Info.plist", async ({ tmpDir }) => {
      const appPath = await makeApp(await tmpDir.createTempDir())
      await expect(makeHelper().resolveSignIdentity(appPath, identity, { provisioningProfile: "foo.provisionprofile" }, "mas")).resolves.toBe(HASH)
      expect((await readInfo(appPath)).ElectronTeamID).toBeUndefined()
    })

    test("preAutoEntitlements: false signs with the hash without touching Info.plist", async ({ tmpDir }) => {
      const appPath = await makeApp(await tmpDir.createTempDir())
      await expect(makeHelper().resolveSignIdentity(appPath, identity, { preAutoEntitlements: false }, "mas")).resolves.toBe(HASH)
      expect((await readInfo(appPath)).ElectronTeamID).toBeUndefined()
    })

    // a darwin build whose own entitlements enable the App Sandbox reaches the same automation as MAS
    test("a sandboxed mac build fills in ElectronTeamID too", async ({ tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const appPath = await makeApp(dir)
      await fs.writeFile(path.join(dir, "entitlements.mac.plist"), sandboxedPlist, "utf-8")
      await expect(makeHelper(["entitlements.mac.plist"], dir).resolveSignIdentity(appPath, identity, undefined, "mac")).resolves.toBe(HASH)
      expect((await readInfo(appPath)).ElectronTeamID).toBe("TEAM123")
    })

    // a self-signed cert has no `(TEAMID)` suffix — keep the name so osx-sign reports it in its own error
    test("an identity name with no Team ID falls back to the name", async ({ tmpDir }) => {
      const appPath = await makeApp(await tmpDir.createTempDir())
      const nameOnly = { name: "Developer ID Application: Foo", hash: HASH } as any
      await expect(makeHelper().resolveSignIdentity(appPath, nameOnly, undefined, "mas")).resolves.toBe("Developer ID Application: Foo")
      expect((await readInfo(appPath)).ElectronTeamID).toBeUndefined()
    })

    test("ad-hoc signing keeps the ad-hoc identity", async ({ tmpDir }) => {
      const appPath = await makeApp(await tmpDir.createTempDir())
      await expect(makeHelper().resolveSignIdentity(appPath, { name: "-" } as any, undefined, "mac")).resolves.toBe("-")
      expect((await readInfo(appPath)).ElectronTeamID).toBeUndefined()
    })

    test("an identity with no hash falls back to the name", async ({ tmpDir }) => {
      const appPath = await makeApp(await tmpDir.createTempDir())
      await expect(makeHelper().resolveSignIdentity(appPath, { name: identity.name } as any, undefined, "mas")).resolves.toBe(identity.name)
    })

    test("an unreadable Info.plist falls back to the name instead of throwing", async () => {
      await expect(makeHelper().resolveSignIdentity("/nonexistent/My.app", identity, undefined, "mas")).resolves.toBe(identity.name)
    })

    test("buildSignOptions forwards the resolved identity", async ({ tmpDir }) => {
      const appPath = await makeApp(await tmpDir.createTempDir())
      const helper = new MacTargetHelper(fakePackager([], "/nonexistent", { electronVersion: "38.0.0" }))
      const signOptions = await helper.buildSignOptions(appPath, identity, undefined, null, Arch.x64, "mas")
      expect(signOptions.identity).toBe(HASH)
      expect((await readInfo(appPath)).ElectronTeamID).toBe("TEAM123")
    })

    // MAS build supplying its own entitlements without the App Sandbox: osx-sign's automation bails before the
    // identity regex, so there is nothing to feed and nothing to rewrite
    test("a mas build whose own entitlements omit the App Sandbox is left alone", async ({ tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const appPath = await makeApp(dir)
      await fs.writeFile(path.join(dir, "entitlements.mas.plist"), nonSandboxedPlist, "utf-8")
      await expect(makeHelper(["entitlements.mas.plist"], dir).resolveSignIdentity(appPath, identity, undefined, "mas")).resolves.toBe(HASH)
      expect((await readInfo(appPath)).ElectronTeamID).toBeUndefined()
    })

    // osx-sign tests the key for truthiness, not for a literal boolean, so a plist spelling it as a string still
    // reaches the identity regex and still needs the Team ID
    test("app-sandbox spelled as a string still counts as sandboxed", async ({ tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const appPath = await makeApp(dir)
      await fs.writeFile(path.join(dir, "entitlements.mac.plist"), sandboxedPlist.replace("<true/>", "<string>true</string>"), "utf-8")
      await expect(makeHelper(["entitlements.mac.plist"], dir).resolveSignIdentity(appPath, identity, undefined, "mac")).resolves.toBe(HASH)
      expect((await readInfo(appPath)).ElectronTeamID).toBe("TEAM123")
    })

    // osx-sign gates its automation on `!filePath.includes('.app/')`, so a sign.binaries entry is signed outside
    // any `.app/` path and reaches the identity regex under the INHERIT entitlements — the app entitlements alone
    // are not enough to predict whether the Team ID is needed.
    test("a sandboxed inherit plist counts when sign.binaries are signed alongside the bundle", async ({ tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const appPath = await makeApp(dir)
      const external = path.join(dir, "tool")
      await fs.writeFile(external, "", "utf-8")
      await fs.writeFile(path.join(dir, "entitlements.mac.inherit.plist"), sandboxedPlist, "utf-8")
      const helper = makeHelper(["entitlements.mac.inherit.plist"], dir)
      await expect(helper.resolveSignIdentity(appPath, identity, { binaries: [external] }, "mac")).resolves.toBe(HASH)
      expect((await readInfo(appPath)).ElectronTeamID).toBe("TEAM123")
    })

    // ...but with nothing signed outside the bundle, the inherit entitlements never reach the automation
    test("a sandboxed inherit plist alone does not count", async ({ tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const appPath = await makeApp(dir)
      await fs.writeFile(path.join(dir, "entitlements.mac.inherit.plist"), sandboxedPlist, "utf-8")
      await expect(makeHelper(["entitlements.mac.inherit.plist"], dir).resolveSignIdentity(appPath, identity, undefined, "mac")).resolves.toBe(HASH)
      expect((await readInfo(appPath)).ElectronTeamID).toBeUndefined()
    })

    // A custom signer replaces @electron/osx-sign, so none of its automation runs — the identity must stay the
    // unique hash and Info.plist must not be touched on its behalf. Each fallback branch is pinned separately:
    // they return identity.name for the osx-sign path, which for a delegated signer would reintroduce #10237.
    describe("custom signer", () => {
      test.for<[string, PlatformType]>([
        ["mas", "mas"],
        ["mas-dev", "mas-dev"],
        ["mac", "mac"],
      ])("a %s build with a custom signer gets the hash and an untouched Info.plist", async ([, targetPlatform], { tmpDir }) => {
        const appPath = await makeApp(await tmpDir.createTempDir())
        await expect(makeHelper().resolveSignIdentity(appPath, identity, undefined, targetPlatform, true)).resolves.toBe(HASH)
        expect((await readInfo(appPath)).ElectronTeamID).toBeUndefined()
      })

      test("an identity name with no Team ID still gets the hash", async ({ tmpDir }) => {
        const appPath = await makeApp(await tmpDir.createTempDir())
        const nameOnly = { name: "Developer ID Application: Foo", hash: HASH } as any
        await expect(makeHelper().resolveSignIdentity(appPath, nameOnly, undefined, "mas", true)).resolves.toBe(HASH)
        expect((await readInfo(appPath)).ElectronTeamID).toBeUndefined()
      })

      test("an unreadable Info.plist still gets the hash", async () => {
        await expect(makeHelper().resolveSignIdentity("/nonexistent/My.app", identity, undefined, "mas", true)).resolves.toBe(HASH)
      })

      test("ad-hoc signing still keeps the ad-hoc identity", async ({ tmpDir }) => {
        const appPath = await makeApp(await tmpDir.createTempDir())
        await expect(makeHelper().resolveSignIdentity(appPath, { name: "-" } as any, undefined, "mas", true)).resolves.toBe("-")
      })

      test("buildSignOptions forwards the hash unmutated", async ({ tmpDir }) => {
        const appPath = await makeApp(await tmpDir.createTempDir())
        const helper = new MacTargetHelper(fakePackager([], "/nonexistent", { electronVersion: "38.0.0" }))
        const signOptions = await helper.buildSignOptions(appPath, identity, undefined, null, Arch.x64, "mas", true)
        expect(signOptions.identity).toBe(HASH)
        expect((await readInfo(appPath)).ElectronTeamID).toBeUndefined()
      })
    })
  })

  describe("isMasTarget", () => {
    const cases: [string, boolean][] = [
      ["mas", true],
      ["mas-dev", true],
      ["mac", false],
      ["dmg", false],
      ["zip", false],
      ["pkg", false],
      ["", false],
    ]

    test.each(cases)('"%s" => %s', (name, expected) => {
      expect(MacTargetHelper.isMasTarget(name)).toBe(expected)
    })
  })

  describe("getPlatformTypeFromTarget", () => {
    const cases: [string, string][] = [
      ["mas", "mas"],
      ["mas-dev", "mas-dev"],
      ["mac", "mac"],
      ["dmg", "mac"],
      ["zip", "mac"],
      ["pkg", "mac"],
      ["", "mac"],
    ]

    test.each(cases)('"%s" => "%s"', (name, expected) => {
      expect(MacTargetHelper.getPlatformTypeFromTarget(name)).toBe(expected)
    })
  })

  describe("assertSafePathForCommandUsage", () => {
    test("passes for normal paths", () => {
      expect(() => MacTargetHelper.assertSafePathForCommandUsage("/some/normal/path", "test path")).not.toThrow()
      expect(() => MacTargetHelper.assertSafePathForCommandUsage("/Users/mike/My App/build", "test path")).not.toThrow()
      expect(() => MacTargetHelper.assertSafePathForCommandUsage("MyApp-1.0.0.pkg", "artifact name")).not.toThrow()
    })

    const unsafeChars: [string, string][] = [
      ["null byte", "\0"],
      ["carriage return", "\r"],
      ["newline", "\n"],
      ["double quote", '"'],
      ["single quote", "'"],
      ["backtick", "`"],
      ["dollar sign", "$"],
      ["semicolon", ";"],
      ["ampersand", "&"],
      ["pipe", "|"],
      ["less than", "<"],
      ["greater than", ">"],
    ]

    test.each(unsafeChars)("throws for path containing %s", (_label, char) => {
      expect(() => MacTargetHelper.assertSafePathForCommandUsage(`/path/with${char}char`, "test path")).toThrow("contains unsupported shell-special characters")
    })
  })

  describe("handleNullIdentity", () => {
    function makeHelper(forceCodeSigning: boolean): MacTargetHelper {
      return new MacTargetHelper({ forceCodeSigning } as any)
    }

    test("throws when forceCodeSigning is true", () => {
      expect(() => makeHelper(true).handleNullIdentity()).toThrow("identity explicitly is set to null")
    })

    test(`returns "skipped:disabled" when forceCodeSigning is false`, () => {
      expect(makeHelper(false).handleNullIdentity()).toBe("skipped:disabled")
    })
  })

  describe("isHardenedRuntimeEnabledForSigning", () => {
    const cases: [PlatformType, boolean | undefined, boolean][] = [
      // non-MAS: defaults to true
      ["mac", undefined, true],
      ["mac", true, true],
      ["mac", false, false],
      // MAS (and mas-dev): defaults to false
      ["mas", undefined, false],
      ["mas", false, false],
      ["mas", true, true],
      ["mas-dev", undefined, false],
      ["mas-dev", true, true],
    ]

    test.each(cases)("targetPlatform=%s hardenedRuntime=%s => %s", (targetPlatform, hardenedRuntime, expected) => {
      expect(MacTargetHelper.isHardenedRuntimeEnabledForSigning(targetPlatform, hardenedRuntime)).toBe(expected)
    })
  })

  describe("isLibraryValidationDisabled", () => {
    const plistWith = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
${body}
  </dict>
</plist>
`
    const grantingPlist = plistWith(`    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>`)
    const nonGrantingPlist = plistWith(`    <key>com.apple.security.cs.allow-jit</key>
    <true/>`)

    function makeHelper(resourceFiles: string[], buildResourcesDir: string): MacTargetHelper {
      return new MacTargetHelper(fakePackager(resourceFiles, buildResourcesDir))
    }

    test("returns true when the explicit entitlements file grants the key", async ({ tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const file = path.join(dir, "custom.plist")
      await fs.writeFile(file, grantingPlist, "utf-8")
      await expect(makeHelper([], dir).isLibraryValidationDisabled("mac", { entitlements: file })).resolves.toBe(true)
    })

    test("returns false when the explicit entitlements file lacks the key", async ({ tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const file = path.join(dir, "custom.plist")
      await fs.writeFile(file, nonGrantingPlist, "utf-8")
      await expect(makeHelper([], dir).isLibraryValidationDisabled("mac", { entitlements: file })).resolves.toBe(false)
    })

    test("returns false when the explicit entitlements file cannot be parsed", async ({ tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const file = path.join(dir, "garbage.plist")
      await fs.writeFile(file, "not a plist at all <<<", "utf-8")
      await expect(makeHelper([], dir).isLibraryValidationDisabled("mac", { entitlements: file })).resolves.toBe(false)
    })

    test("throws for an explicit entitlements file that does not exist", async ({ tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const promise = makeHelper([], dir).isLibraryValidationDisabled("mac", { entitlements: path.join(dir, "missing.plist") })
      await expect(promise).rejects.toThrow(InvalidConfigurationError)
      await expect(promise).rejects.toThrow("cannot find specified resource")
    })

    test.for<[PlatformType, string, string]>([
      ["mac", "entitlements.mac.plist", "entitlements.mac.inherit.plist"],
      ["mas", "entitlements.mas.plist", "entitlements.mas.inherit.plist"],
    ])("uses %s build-resources files %s and %s when no explicit files are set", async ([targetPlatform, appResource, inheritResource], { tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const helper = makeHelper([appResource, inheritResource], dir)
      await fs.writeFile(path.join(dir, appResource), grantingPlist, "utf-8")
      await fs.writeFile(path.join(dir, inheritResource), grantingPlist, "utf-8")
      await expect(helper.isLibraryValidationDisabled(targetPlatform, undefined)).resolves.toBe(true)

      // the app grants it but the helpers do not — under ad-hoc signing they have no Team ID either, so they would crash
      await fs.writeFile(path.join(dir, inheritResource), nonGrantingPlist, "utf-8")
      await expect(helper.isLibraryValidationDisabled(targetPlatform, undefined)).resolves.toBe(false)

      await fs.writeFile(path.join(dir, appResource), nonGrantingPlist, "utf-8")
      await fs.writeFile(path.join(dir, inheritResource), grantingPlist, "utf-8")
      await expect(helper.isLibraryValidationDisabled(targetPlatform, undefined)).resolves.toBe(false)
    })

    test("returns false when the app entitlements grant the key but a custom inherit file does not", async ({ tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const entitlements = path.join(dir, "entitlements.plist")
      const entitlementsInherit = path.join(dir, "entitlements.inherit.plist")
      await fs.writeFile(entitlements, grantingPlist, "utf-8")
      await fs.writeFile(entitlementsInherit, nonGrantingPlist, "utf-8")
      await expect(makeHelper([], dir).isLibraryValidationDisabled("mac", { entitlements, entitlementsInherit })).resolves.toBe(false)
    })

    test("returns false when a custom inherit file grants the key but the app entitlements do not", async ({ tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const entitlements = path.join(dir, "entitlements.plist")
      const entitlementsInherit = path.join(dir, "entitlements.inherit.plist")
      await fs.writeFile(entitlements, nonGrantingPlist, "utf-8")
      await fs.writeFile(entitlementsInherit, grantingPlist, "utf-8")
      await expect(makeHelper([], dir).isLibraryValidationDisabled("mac", { entitlements, entitlementsInherit })).resolves.toBe(false)
    })

    test("returns true when both the app and a custom inherit file grant the key", async ({ tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const entitlements = path.join(dir, "entitlements.plist")
      const entitlementsInherit = path.join(dir, "entitlements.inherit.plist")
      await fs.writeFile(entitlements, grantingPlist, "utf-8")
      await fs.writeFile(entitlementsInherit, grantingPlist, "utf-8")
      await expect(makeHelper([], dir).isLibraryValidationDisabled("mac", { entitlements, entitlementsInherit })).resolves.toBe(true)
    })

    test("returns true when the app entitlements grant the key and the inherit file falls back to the ad-hoc template", async ({ tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const entitlements = path.join(dir, "entitlements.plist")
      await fs.writeFile(entitlements, grantingPlist, "utf-8")
      await expect(makeHelper([], dir).isLibraryValidationDisabled("mac", { entitlements })).resolves.toBe(true)
    })

    test("returns true for the bundled ad-hoc templates (both grant the key)", async () => {
      await expect(makeHelper([], "/nonexistent").isLibraryValidationDisabled("mac", undefined)).resolves.toBe(true)
    })

    test("returns false for mas, which defers to @electron/osx-sign's sandboxed defaults", async () => {
      await expect(makeHelper([], "/nonexistent").isLibraryValidationDisabled("mas", undefined)).resolves.toBe(false)
    })
  })

  describe("entitlement defaults", () => {
    const LOOSE_ENTITLEMENTS = ["com.apple.security.cs.allow-unsigned-executable-memory", "com.apple.security.cs.disable-library-validation"]

    function makeHelper(resourceFiles: string[] = [], buildResourcesDir = "/nonexistent"): MacTargetHelper {
      return new MacTargetHelper(fakePackager(resourceFiles, buildResourcesDir))
    }

    async function keysOf(file: string | null): Promise<string[]> {
      expect(file).not.toBeNull()
      return Object.keys(await parsePlistFile<PlistObject>(file!)).sort()
    }

    describe("bundled templates", () => {
      test("the default mac template grants only the JIT exception", async () => {
        const file = await makeHelper().getAppEntitlements("mac", undefined, false)
        expect(await keysOf(file)).toEqual(["com.apple.security.cs.allow-jit"])
      })

      // regression guard for the historical default that weakened every app built by electron-builder
      test.each(LOOSE_ENTITLEMENTS)("the default mac template does not grant %s", async key => {
        const file = await makeHelper().getAppEntitlements("mac", undefined, false)
        expect(await keysOf(file)).not.toContain(key)
      })

      test("the ad-hoc template additionally disables library validation", async () => {
        const file = await makeHelper().getAppEntitlements("mac", undefined, true)
        expect(await keysOf(file)).toEqual(["com.apple.security.cs.allow-jit", "com.apple.security.cs.disable-library-validation"])
      })
    })

    // both resolvers share the explicit-path handling; `option` is the `sign.*` key and `convention` the `build/` file name
    describe.each<{ method: "getAppEntitlements" | "getInheritEntitlements"; option: "entitlements" | "entitlementsInherit"; convention: string }>([
      { method: "getAppEntitlements", option: "entitlements", convention: "entitlements.mac.plist" },
      { method: "getInheritEntitlements", option: "entitlementsInherit", convention: "entitlements.mac.inherit.plist" },
    ])("$method explicit path", ({ method, option, convention }) => {
      test(`an explicit sign.${option} wins over everything`, async ({ tmpDir }) => {
        const dir = await tmpDir.createTempDir()
        const custom = path.join(dir, "custom.plist")
        await fs.writeFile(custom, "")
        await expect(makeHelper([convention], dir)[method]("mac", { [option]: custom }, true)).resolves.toBe(custom)
      })

      test("a relative explicit path is resolved against the build resources dir", async ({ tmpDir }) => {
        const dir = await tmpDir.createTempDir()
        await fs.writeFile(path.join(dir, "custom.plist"), "")
        await expect(makeHelper([], dir)[method]("mac", { [option]: "custom.plist" }, true)).resolves.toBe(path.join(dir, "custom.plist"))
      })

      test("an explicit path that does not exist is a configuration error", async ({ tmpDir }) => {
        const dir = await tmpDir.createTempDir()
        await expect(makeHelper([convention], dir)[method]("mac", { [option]: path.join(dir, "missing.plist") }, true)).rejects.toThrow(InvalidConfigurationError)
      })

      test.for<[string | null]>([[null], [""]])(`sign.${option}: %j falls back to the build-resources convention file`, async ([value], { tmpDir }) => {
        const dir = await tmpDir.createTempDir()
        await expect(makeHelper([convention], dir)[method]("mac", { [option]: value }, true)).resolves.toBe(path.join(dir, convention))
      })
    })

    describe("getAppEntitlements", () => {
      test.for<[PlatformType, string]>([
        ["mac", "entitlements.mac.plist"],
        ["mas", "entitlements.mas.plist"],
      ])("%s uses the build-resources file %s when present", async ([targetPlatform, resourceName], { tmpDir }) => {
        const dir = await tmpDir.createTempDir()
        await expect(makeHelper([resourceName], dir).getAppEntitlements(targetPlatform, undefined, false)).resolves.toBe(path.join(dir, resourceName))
      })

      test.for<[PlatformType]>([["mas"], ["mas-dev"]])("%s falls back to @electron/osx-sign's sandboxed default", async ([targetPlatform]) => {
        await expect(makeHelper().getAppEntitlements(targetPlatform, undefined, false)).resolves.toBeNull()
      })
    })

    describe("getInheritEntitlements", () => {
      test.for<[PlatformType, string]>([
        ["mac", "entitlements.mac.inherit.plist"],
        ["mas", "entitlements.mas.inherit.plist"],
      ])("%s uses the build-resources file %s when present", async ([targetPlatform, resourceName], { tmpDir }) => {
        const dir = await tmpDir.createTempDir()
        await expect(makeHelper([resourceName], dir).getInheritEntitlements(targetPlatform, undefined, false)).resolves.toBe(path.join(dir, resourceName))
      })

      // the helpers are where the blanket plist did the most damage: renderer/GPU processes were handed
      // entitlements Chromium only grants to the plugin helper
      test.for<[PlatformType]>([["mac"], ["mas"]])("%s defers nested binaries to @electron/osx-sign's per-file defaults", async ([targetPlatform]) => {
        await expect(makeHelper().getInheritEntitlements(targetPlatform, undefined, false)).resolves.toBeNull()
      })

      test("ad-hoc mac builds apply the ad-hoc template to nested binaries too", async () => {
        const file = await makeHelper().getInheritEntitlements("mac", undefined, true)
        expect(await keysOf(file)).toContain("com.apple.security.cs.disable-library-validation")
      })
    })

    describe("getOptionsForFile", () => {
      const appPath = "/project/My.app"
      const realIdentity = { name: "Developer ID Application: Example Inc. (A1B2C3D4E5)", hash: "HASH" } as any
      const adHocIdentity = { name: "-" } as any

      test("signs the app with the trimmed default and leaves helpers to @electron/osx-sign", async () => {
        const optionsForFile = await makeHelper().getOptionsForFile(appPath, "mac", undefined, realIdentity)

        expect(await keysOf(optionsForFile(appPath).entitlements as string)).toEqual(["com.apple.security.cs.allow-jit"])
        expect(optionsForFile(`${appPath}/Contents/Frameworks/My Helper (Renderer).app`).entitlements).toBeUndefined()
        expect(optionsForFile(`${appPath}/Contents/Frameworks/Electron Framework.framework`).entitlements).toBeUndefined()
      })

      test("ad-hoc builds keep library validation disabled everywhere", async () => {
        const optionsForFile = await makeHelper().getOptionsForFile(appPath, "mac", undefined, adHocIdentity)

        for (const file of [appPath, `${appPath}/Contents/Frameworks/My Helper (Renderer).app`]) {
          expect(await keysOf(optionsForFile(file).entitlements as string)).toContain("com.apple.security.cs.disable-library-validation")
        }
      })

      test("login items still use entitlementsLoginHelper", async () => {
        const optionsForFile = await makeHelper().getOptionsForFile(appPath, "mac", { entitlementsLoginHelper: "/login.plist" }, realIdentity)
        expect(optionsForFile(`${appPath}/Contents/Library/LoginItems/Helper.app`).entitlements).toBe("/login.plist")
      })

      test("mas defers both the app and its children to @electron/osx-sign", async () => {
        const optionsForFile = await makeHelper().getOptionsForFile(appPath, "mas", undefined, realIdentity)
        expect(optionsForFile(appPath).entitlements).toBeUndefined()
        expect(optionsForFile(`${appPath}/Contents/Frameworks/My Helper.app`).entitlements).toBeUndefined()
      })
    })
  })

  describe("isAdHocIdentity", () => {
    test.each([
      ["-", true],
      ["Developer ID Application: Example Inc. (A1B2C3D4E5)", false],
    ])('"%s" => %s', (name, expected) => {
      expect(MacTargetHelper.isAdHocIdentity({ name } as any)).toBe(expected)
    })

    test("null identity is not ad-hoc", () => {
      expect(MacTargetHelper.isAdHocIdentity(null)).toBe(false)
    })
  })

  describe("warnAboutForeignSignedBinaries", () => {
    const realIdentity = { name: "Developer ID Application: Example Inc. (A1B2C3D4E5)", hash: "HASH" } as any
    const adHocIdentity = { name: "-" } as any
    const TEAM_ID = "TEAMID1234"

    function makeHelper(resourceFiles: string[] = [], buildResourcesDir = "/nonexistent"): MacTargetHelper {
      return new MacTargetHelper(fakePackager(resourceFiles, buildResourcesDir))
    }

    async function makeApp(tmpDir: { createTempDir(): Promise<string> }): Promise<string> {
      const appPath = path.join(await tmpDir.createTempDir(), "App.app")
      await fs.mkdir(path.join(appPath, "Contents", "Resources"), { recursive: true })
      return appPath
    }

    let warn: ReturnType<typeof vi.spyOn>
    let readTeamId: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
      warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
      // `codesign` only exists on macOS: stub the read so the scan itself runs everywhere.
      // The app bundle reads as signed by TEAM_ID; everything inside it reads as unsigned unless a test says otherwise.
      readTeamId = vi.spyOn(MacTargetHelper.prototype, "readSigningTeamId").mockImplementation(async (file: string) => (file.endsWith(".app") ? TEAM_ID : null))
    })
    afterEach(() => {
      warn.mockRestore()
      readTeamId.mockRestore()
    })

    test("skips mas targets", async ({ expect }) => {
      await expect(makeHelper().warnAboutForeignSignedBinaries("/nonexistent/App.app", realIdentity, "mas", { hardenedRuntime: true })).resolves.toBeUndefined()
      expect(warn).not.toHaveBeenCalled()
      expect(readTeamId).not.toHaveBeenCalled()
    })

    test("skips ad-hoc identities", async ({ expect }) => {
      await expect(makeHelper().warnAboutForeignSignedBinaries("/nonexistent/App.app", adHocIdentity, "mac", undefined)).resolves.toBeUndefined()
      expect(warn).not.toHaveBeenCalled()
      expect(readTeamId).not.toHaveBeenCalled()
    })

    test("skips builds with the hardened runtime disabled", async ({ expect }) => {
      await expect(makeHelper().warnAboutForeignSignedBinaries("/nonexistent/App.app", realIdentity, "mac", { hardenedRuntime: false })).resolves.toBeUndefined()
      expect(warn).not.toHaveBeenCalled()
      expect(readTeamId).not.toHaveBeenCalled()
    })

    test("skips apps whose entitlements grant disable-library-validation", async ({ expect, tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const file = path.join(dir, "entitlements.plist")
      await fs.writeFile(
        file,
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
  </dict>
</plist>
`,
        "utf-8"
      )
      await expect(makeHelper().warnAboutForeignSignedBinaries("/nonexistent/App.app", realIdentity, "mac", { entitlements: file })).resolves.toBeUndefined()
      expect(warn).not.toHaveBeenCalled()
      expect(readTeamId).not.toHaveBeenCalled()
    })

    test("skips apps without an app.asar.unpacked or Contents/PlugIns directory", async ({ expect, tmpDir }) => {
      const appPath = await makeApp(tmpDir)
      await expect(makeHelper().warnAboutForeignSignedBinaries(appPath, realIdentity, "mac", undefined)).resolves.toBeUndefined()
      expect(warn).not.toHaveBeenCalled()
      expect(readTeamId).not.toHaveBeenCalled()
    })

    test("skips the scan when the app bundle itself has no Team ID", async ({ expect, tmpDir }) => {
      readTeamId.mockImplementation(async () => null)
      const appPath = await makeApp(tmpDir)
      const dir = path.join(appPath, "Contents", "Resources", "app.asar.unpacked", "node_modules", "x", "build", "Release")
      await fs.mkdir(dir, { recursive: true })
      await writeBinary(dir, "x.node", thinHeader(MachOFileType.MH_DYLIB, "LE"))
      await expect(makeHelper().warnAboutForeignSignedBinaries(appPath, realIdentity, "mac", undefined)).resolves.toBeUndefined()
      expect(warn).not.toHaveBeenCalled()
      expect(readTeamId).toHaveBeenCalledTimes(1)
      expect(readTeamId).toHaveBeenCalledWith(appPath)
    })

    test("scans a Contents/PlugIns directory even without app.asar.unpacked and reports a foreign-signed bundle", async ({ expect, tmpDir }) => {
      // Contents/PlugIns is never re-signed by buildSignOptions, so a bundle there keeps whatever signature it shipped with
      const appPath = await makeApp(tmpDir)
      const dir = path.join(appPath, "Contents", "PlugIns", "Foo.bundle", "Contents", "MacOS")
      await fs.mkdir(dir, { recursive: true })
      const bundle = await writeBinary(dir, "Foo", thinHeader(MachOFileType.MH_BUNDLE, "LE"))
      await expect(makeHelper().warnAboutForeignSignedBinaries(appPath, realIdentity, "mac", undefined)).resolves.toBeUndefined()
      expect(readTeamId).toHaveBeenCalledWith(bundle)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0][0]).toMatchObject({ files: path.join("Contents", "PlugIns", "Foo.bundle", "Contents", "MacOS", "Foo"), teamId: TEAM_ID })
    })

    test("reports an unsigned dylib in app.asar.unpacked", async ({ expect, tmpDir }) => {
      const appPath = await makeApp(tmpDir)
      const dir = path.join(appPath, "Contents", "Resources", "app.asar.unpacked", "node_modules", "x", "build", "Release")
      await fs.mkdir(dir, { recursive: true })
      await writeBinary(dir, "x.node", thinHeader(MachOFileType.MH_DYLIB, "LE"))
      await expect(makeHelper().warnAboutForeignSignedBinaries(appPath, realIdentity, "mac", undefined)).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0][0]).toMatchObject({
        files: path.join("Contents", "Resources", "app.asar.unpacked", "node_modules", "x", "build", "Release", "x.node"),
        teamId: TEAM_ID,
      })
    })

    test("does not report executables — they are spawned, not loaded, so library validation never applies", async ({ expect, tmpDir }) => {
      const appPath = await makeApp(tmpDir)
      const dir = path.join(appPath, "Contents", "Resources", "app.asar.unpacked", "node_modules", "ffmpeg-static")
      await fs.mkdir(dir, { recursive: true })
      const ffmpeg = await writeBinary(dir, "ffmpeg", thinHeader(MachOFileType.MH_EXECUTE, "LE"))
      await expect(makeHelper().warnAboutForeignSignedBinaries(appPath, realIdentity, "mac", undefined)).resolves.toBeUndefined()
      expect(warn).not.toHaveBeenCalled()
      // the filetype check short-circuits before codesign is ever consulted for the executable
      expect(readTeamId).not.toHaveBeenCalledWith(ffmpeg)
    })

    test("does not report libraries signed by the app's own team", async ({ expect, tmpDir }) => {
      readTeamId.mockImplementation(async () => TEAM_ID)
      const appPath = await makeApp(tmpDir)
      const dir = path.join(appPath, "Contents", "Resources", "app.asar.unpacked", "node_modules", "x", "build", "Release")
      await fs.mkdir(dir, { recursive: true })
      const node = await writeBinary(dir, "x.node", thinHeader(MachOFileType.MH_DYLIB, "LE"))
      await expect(makeHelper().warnAboutForeignSignedBinaries(appPath, realIdentity, "mac", undefined)).resolves.toBeUndefined()
      expect(readTeamId).toHaveBeenCalledWith(node)
      expect(warn).not.toHaveBeenCalled()
    })

    test("ignores non-Mach-O files such as scripts and text", async ({ expect, tmpDir }) => {
      const appPath = await makeApp(tmpDir)
      const dir = path.join(appPath, "Contents", "Resources", "app.asar.unpacked", "node_modules", "x")
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, "run.sh"), "#!/bin/sh\necho hi\n", "utf-8")
      await fs.writeFile(path.join(dir, "package.json"), "{}", "utf-8")
      await expect(makeHelper().warnAboutForeignSignedBinaries(appPath, realIdentity, "mac", undefined)).resolves.toBeUndefined()
      expect(warn).not.toHaveBeenCalled()
      expect(readTeamId).toHaveBeenCalledTimes(1)
    })
  })

  describe("readMachOFileType", () => {
    test("reads the filetype of a 64-bit little-endian dylib", async ({ expect, tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      await expect(readMachOFileType(await writeBinary(dir, "libfoo.dylib", thinHeader(MachOFileType.MH_DYLIB, "LE")))).resolves.toBe(MachOFileType.MH_DYLIB)
    })

    test("reads the filetype of a 64-bit little-endian executable", async ({ expect, tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      await expect(readMachOFileType(await writeBinary(dir, "ffmpeg", thinHeader(MachOFileType.MH_EXECUTE, "LE")))).resolves.toBe(MachOFileType.MH_EXECUTE)
    })

    test("reads the filetype of a 64-bit little-endian bundle", async ({ expect, tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      await expect(readMachOFileType(await writeBinary(dir, "foo.node", thinHeader(MachOFileType.MH_BUNDLE, "LE")))).resolves.toBe(MachOFileType.MH_BUNDLE)
    })

    test("reads the filetype of a big-endian thin Mach-O", async ({ expect, tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      await expect(readMachOFileType(await writeBinary(dir, "thin-be.dylib", thinHeader(MachOFileType.MH_DYLIB, "BE")))).resolves.toBe(MachOFileType.MH_DYLIB)
    })

    test("reads the filetype of a fat/universal binary from its first slice", async ({ expect, tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      await expect(readMachOFileType(await writeBinary(dir, "fat.node", fatBinary(MachOFileType.MH_DYLIB, 4096)))).resolves.toBe(MachOFileType.MH_DYLIB)
    })

    test("returns null for a fat header whose slice lies past the end of the file", async ({ expect, tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      await expect(readMachOFileType(await writeBinary(dir, "truncated.node", fatBinary(MachOFileType.MH_DYLIB, 4096).subarray(0, 4096)))).resolves.toBeNull()
    })

    test("returns null for a Java class file that shares the fat magic", async ({ expect, tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      // minor_version=0, major_version=65 (JDK 21) sits where a fat header keeps nfat_arch
      const classFile = Buffer.concat([Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x41]), Buffer.alloc(56)])
      await expect(readMachOFileType(await writeBinary(dir, "Foo.class", classFile))).resolves.toBeNull()
    })

    test("returns null for a shell script", async ({ expect, tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const file = path.join(dir, "run.sh")
      await fs.writeFile(file, "#!/bin/sh\n", "utf-8")
      await expect(readMachOFileType(file)).resolves.toBeNull()
    })

    test("returns null for a file shorter than the magic", async ({ expect, tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      await expect(readMachOFileType(await writeBinary(dir, "short.bin", [0xcf, 0xfa]))).resolves.toBeNull()
    })

    test("returns null for a nonexistent path", async ({ expect, tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      await expect(readMachOFileType(path.join(dir, "missing.node"))).resolves.toBeNull()
    })

    test("isMachOFile reports any Mach-O header regardless of filetype", async ({ expect, tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      await expect(isMachOFile(await writeBinary(dir, "ffmpeg", thinHeader(MachOFileType.MH_EXECUTE, "LE")))).resolves.toBe(true)
      await expect(isMachOFile(await writeBinary(dir, "short.bin", [0xcf, 0xfa]))).resolves.toBe(false)
    })
  })

  describe("isLoadableMachOFileType", () => {
    test("treats dylibs and bundles as loadable", () => {
      expect(isLoadableMachOFileType(MachOFileType.MH_DYLIB)).toBe(true)
      expect(isLoadableMachOFileType(MachOFileType.MH_BUNDLE)).toBe(true)
    })

    test("does not treat executables as loadable — they are spawned, not loaded", () => {
      expect(isLoadableMachOFileType(MachOFileType.MH_EXECUTE)).toBe(false)
    })

    test("does not treat non-Mach-O files as loadable", () => {
      expect(isLoadableMachOFileType(null)).toBe(false)
    })
  })

  describe("parseSigningTeamId", () => {
    const codesignOutput = (teamIdLine: string | null) =>
      [
        "Executable=/Users/me/App.app/Contents/Resources/app.asar.unpacked/node_modules/foo/build/Release/foo.node",
        "Identifier=foo",
        "Format=Mach-O universal (x86_64 arm64)",
        "CodeDirectory v=20500 size=1234 flags=0x10000(runtime) hashes=30+2 location=embedded",
        "Hash type=sha256 size=32",
        "Signature size=8981",
        "Authority=Developer ID Application: Example Inc. (ABCDE12345)",
        "Authority=Developer ID Certification Authority",
        "Authority=Apple Root CA",
        "Timestamp=1 Jan 2026 at 00:00:00",
        ...(teamIdLine == null ? [] : [teamIdLine]),
        "Sealed Resources=none",
        "Internal requirements count=1 size=180",
        "",
      ].join("\n")

    test("returns the TeamIdentifier from verbose codesign output", () => {
      expect(parseSigningTeamId(codesignOutput("TeamIdentifier=ABCDE12345"))).toBe("ABCDE12345")
    })

    test("returns null for the `not set` placeholder", () => {
      expect(parseSigningTeamId(codesignOutput("TeamIdentifier=not set"))).toBeNull()
    })

    test("returns null when the field is absent", () => {
      expect(parseSigningTeamId(codesignOutput(null))).toBeNull()
      expect(parseSigningTeamId("")).toBeNull()
    })

    test("trims trailing whitespace and carriage returns", () => {
      expect(parseSigningTeamId(codesignOutput("TeamIdentifier=ABCDE12345 \r"))).toBe("ABCDE12345")
    })
  })

  describe("getNotarizeOptions", { concurrent: false }, () => {
    const envKeys = [
      "APPLE_ID",
      "APPLE_APP_SPECIFIC_PASSWORD",
      "APPLE_TEAM_ID",
      "APPLE_API_KEY",
      "APPLE_API_KEY_ID",
      "APPLE_API_ISSUER",
      "APPLE_KEYCHAIN",
      "APPLE_KEYCHAIN_PROFILE",
    ]

    afterEach(() => {
      for (const key of envKeys) {
        delete process.env[key]
      }
    })

    test("returns undefined when no credentials are set", () => {
      expect(MacTargetHelper.getNotarizeOptions("/My.app")).toBeUndefined()
    })

    test("returns app-specific-password config when all three vars are set", () => {
      process.env.APPLE_ID = "dev@example.com"
      process.env.APPLE_APP_SPECIFIC_PASSWORD = "xxxx-yyyy"
      process.env.APPLE_TEAM_ID = "TEAM123"

      expect(MacTargetHelper.getNotarizeOptions("/My.app")).toMatchObject({
        appPath: "/My.app",
        appleId: "dev@example.com",
        appleIdPassword: "xxxx-yyyy",
        teamId: "TEAM123",
      })
    })

    test("throws when APPLE_ID is set but APPLE_APP_SPECIFIC_PASSWORD is missing", () => {
      process.env.APPLE_ID = "dev@example.com"
      expect(() => MacTargetHelper.getNotarizeOptions("/My.app")).toThrow("APPLE_APP_SPECIFIC_PASSWORD env var needs to be set")
    })

    test("throws when APPLE_APP_SPECIFIC_PASSWORD is set but APPLE_ID is missing", () => {
      process.env.APPLE_APP_SPECIFIC_PASSWORD = "xxxx-yyyy"
      expect(() => MacTargetHelper.getNotarizeOptions("/My.app")).toThrow("APPLE_ID env var needs to be set")
    })

    test("throws when APPLE_ID + password are set but APPLE_TEAM_ID is missing", () => {
      process.env.APPLE_ID = "dev@example.com"
      process.env.APPLE_APP_SPECIFIC_PASSWORD = "xxxx-yyyy"
      expect(() => MacTargetHelper.getNotarizeOptions("/My.app")).toThrow("APPLE_TEAM_ID env var needs to be set")
    })

    test("returns API key config when all three API vars are set", () => {
      process.env.APPLE_API_KEY = "/path/to/key.p8"
      process.env.APPLE_API_KEY_ID = "KEYID123"
      process.env.APPLE_API_ISSUER = "issuer-uuid"

      expect(MacTargetHelper.getNotarizeOptions("/My.app")).toMatchObject({
        appPath: "/My.app",
        appleApiKey: "/path/to/key.p8",
        appleApiKeyId: "KEYID123",
        appleApiIssuer: "issuer-uuid",
      })
    })

    test("throws when only some API key vars are set", () => {
      process.env.APPLE_API_KEY = "/path/to/key.p8"
      expect(() => MacTargetHelper.getNotarizeOptions("/My.app")).toThrow("APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER need to be set")
    })

    test("returns keychain-profile config", () => {
      process.env.APPLE_KEYCHAIN_PROFILE = "my-profile"

      expect(MacTargetHelper.getNotarizeOptions("/My.app")).toMatchObject({
        appPath: "/My.app",
        keychainProfile: "my-profile",
      })
    })

    test("includes keychain when both APPLE_KEYCHAIN and APPLE_KEYCHAIN_PROFILE are set", () => {
      process.env.APPLE_KEYCHAIN_PROFILE = "my-profile"
      process.env.APPLE_KEYCHAIN = "/path/to/keychain.keychain"

      expect(MacTargetHelper.getNotarizeOptions("/My.app")).toMatchObject({
        keychainProfile: "my-profile",
        keychain: "/path/to/keychain.keychain",
      })
    })
  })

  // resolveSignIdentity rewrites the app's Info.plist through savePlistFile. With `--prepackaged` that is the first
  // write the file ever sees from electron-builder, so the round trip has to be lossless for every plist type.
  describe("savePlistFile round trip", () => {
    test("preserves <data> and <date> values", async ({ tmpDir }) => {
      const file = path.join(await tmpDir.createTempDir(), "Info.plist")
      const data = Buffer.from("ABCD")
      const date = new Date("2024-01-02T03:04:05Z")
      await savePlistFile(file, { CFBundleIdentifier: "com.example.app", SomeData: data, SomeDate: date })
      const parsed = await parsePlistFile<Record<string, any>>(file)
      expect(Buffer.isBuffer(parsed.SomeData)).toBe(true)
      expect((parsed.SomeData as Buffer).toString()).toBe("ABCD")
      expect(parsed.SomeDate).toBeInstanceOf(Date)
      expect((parsed.SomeDate as Date).toISOString()).toBe(date.toISOString())
    })
  })
})
