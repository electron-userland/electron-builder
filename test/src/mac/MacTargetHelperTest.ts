import { afterEach, expect } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import { Arch } from "builder-util"
import { MacTargetHelper, parsePlistFile, type PlistObject, type PlatformType } from "app-builder-lib/internal"

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
      const packager = {
        config: { electronVersion: "38.0.0" },
        resourceList: Promise.resolve([]),
        buildResourcesDir: "/nonexistent",
      }
      return new MacTargetHelper(packager as any)
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
      return new MacTargetHelper({ resourceList: Promise.resolve(resourceFiles), buildResourcesDir } as any)
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

    test("returns false when the explicit entitlements file does not exist", async ({ tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      await expect(makeHelper([], dir).isLibraryValidationDisabled("mac", { entitlements: path.join(dir, "missing.plist") })).resolves.toBe(false)
    })

    test.for<[PlatformType, string]>([
      ["mac", "entitlements.mac.plist"],
      ["mas", "entitlements.mas.plist"],
    ])("uses %s build-resources file %s when no explicit file is set", async ([targetPlatform, resourceName], { tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      await fs.writeFile(path.join(dir, resourceName), grantingPlist, "utf-8")
      await expect(makeHelper([resourceName], dir).isLibraryValidationDisabled(targetPlatform, undefined)).resolves.toBe(true)

      await fs.writeFile(path.join(dir, resourceName), nonGrantingPlist, "utf-8")
      await expect(makeHelper([resourceName], dir).isLibraryValidationDisabled(targetPlatform, undefined)).resolves.toBe(false)
    })

    test("returns true for the bundled ad-hoc template (it grants the key)", async () => {
      await expect(makeHelper([], "/nonexistent").isLibraryValidationDisabled("mac", undefined)).resolves.toBe(true)
    })

    test("returns false for mas, which defers to @electron/osx-sign's sandboxed defaults", async () => {
      await expect(makeHelper([], "/nonexistent").isLibraryValidationDisabled("mas", undefined)).resolves.toBe(false)
    })
  })

  describe("entitlement defaults", () => {
    const LOOSE_ENTITLEMENTS = ["com.apple.security.cs.allow-unsigned-executable-memory", "com.apple.security.cs.disable-library-validation"]

    function makeHelper(resourceFiles: string[] = [], buildResourcesDir = "/nonexistent"): MacTargetHelper {
      return new MacTargetHelper({ resourceList: Promise.resolve(resourceFiles), buildResourcesDir, config: {} } as any)
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

    describe("getAppEntitlements", () => {
      test("an explicit sign.entitlements wins over everything", async () => {
        await expect(makeHelper(["entitlements.mac.plist"], "/res").getAppEntitlements("mac", { entitlements: "/custom.plist" }, true)).resolves.toBe("/custom.plist")
      })

      test.for<[PlatformType, string]>([
        ["mac", "entitlements.mac.plist"],
        ["mas", "entitlements.mas.plist"],
      ])("%s uses the build-resources file %s when present", async ([targetPlatform, resourceName]) => {
        await expect(makeHelper([resourceName], "/res").getAppEntitlements(targetPlatform, undefined, false)).resolves.toBe(path.join("/res", resourceName))
      })

      test.for<[PlatformType]>([["mas"], ["mas-dev"]])("%s falls back to @electron/osx-sign's sandboxed default", async ([targetPlatform]) => {
        await expect(makeHelper().getAppEntitlements(targetPlatform, undefined, false)).resolves.toBeNull()
      })
    })

    describe("getInheritEntitlements", () => {
      test("an explicit sign.entitlementsInherit wins over everything", async () => {
        await expect(makeHelper(["entitlements.mac.inherit.plist"], "/res").getInheritEntitlements("mac", { entitlementsInherit: "/inherit.plist" }, true)).resolves.toBe(
          "/inherit.plist"
        )
      })

      test.for<[PlatformType, string]>([
        ["mac", "entitlements.mac.inherit.plist"],
        ["mas", "entitlements.mas.inherit.plist"],
      ])("%s uses the build-resources file %s when present", async ([targetPlatform, resourceName]) => {
        await expect(makeHelper([resourceName], "/res").getInheritEntitlements(targetPlatform, undefined, false)).resolves.toBe(path.join("/res", resourceName))
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

  describe("getTeamIdFromIdentity", () => {
    const cases: [string, string | null][] = [
      ["Developer ID Application: Example Inc. (A1B2C3D4E5)", "A1B2C3D4E5"],
      ["Apple Development: dev@example.com (ABCDE12345)", "ABCDE12345"],
      // no trailing team id
      ["Developer ID Application: Example Inc.", null],
      ["-", null],
      // not a 10-char alphanumeric team id
      ["Developer ID Application: Example Inc. (short)", null],
    ]

    test.each(cases)('"%s" => %s', (name, expected) => {
      expect(MacTargetHelper.getTeamIdFromIdentity({ name } as any)).toBe(expected)
    })
  })

  describe("getNotarizeOptions", { sequential: true }, () => {
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
})
