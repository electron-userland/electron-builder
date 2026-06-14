import { afterEach, expect } from "vitest"
import { MacTargetHelper, type PlatformType } from "app-builder-lib/internal"

describe("MacTargetHelper", () => {
  describe("getCertificateTypes", () => {
    const cases: [PlatformType, string[]][] = [
      ["mas", ["Apple Distribution", "3rd Party Mac Developer Application"]],
      ["mas-dev", ["Mac Developer", "Apple Development"]],
      ["mac", ["Developer ID Application"]],
    ]

    test.each(cases)("%s", (targetPlatform, expected) => {
      expect(MacTargetHelper.getCertificateTypes(targetPlatform)).toEqual(expected)
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

    test("returns false when forceCodeSigning is false", () => {
      expect(makeHelper(false).handleNullIdentity()).toBe(false)
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

  // sequence.concurrent is enabled globally; describe.sequential prevents concurrent tests from
  // reading each other's process.env mutations before afterEach deletes them.
  describe.sequential("getNotarizeOptions", () => {
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
