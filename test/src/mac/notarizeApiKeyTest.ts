import { MacTargetHelper } from "app-builder-lib/internal"
import { InvalidConfigurationError } from "builder-util"
import { generateKeyPairSync } from "crypto"
import * as fs from "fs/promises"
import { afterEach, beforeEach, vi } from "vitest"

// the test package does not depend on @electron/notarize, so mock the very module app-builder-lib imports
const { notarize } = vi.hoisted(() => ({ notarize: vi.fn() }))
vi.mock("../../../packages/app-builder-lib/node_modules/@electron/notarize/lib/index.js", () => ({ notarize }))

// an App Store Connect API key file (AuthKey_<KEY_ID>.p8) holds an EC P-256 key as PKCS#8 PEM
const p8 = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString()
const p8Base64 = Buffer.from(p8).toString("base64")
const p8Body = p8.split("\n")[1]

function stubApiKeyEnv(apiKey: string) {
  // the Apple ID and keychain-profile flows must not take over from a credential set on the developer's machine
  for (const name of ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID", "APPLE_KEYCHAIN", "APPLE_KEYCHAIN_PROFILE"]) {
    vi.stubEnv(name, undefined)
  }
  vi.stubEnv("APPLE_API_KEY", apiKey)
  vi.stubEnv("APPLE_API_KEY_ID", "ABCDE12345")
  vi.stubEnv("APPLE_API_ISSUER", "c055ca8c-e5a8-4836-b61d-aa5794eeb3f4")
}

function decodeError(value: string): Error | null {
  try {
    MacTargetHelper.decodeAppleApiKey(value)
    return null
  } catch (e: any) {
    return e
  }
}

beforeEach(() => {
  notarize.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("decodeAppleApiKey", () => {
  test("returns null for a path, which goes to notarytool unchanged", ({ expect }) => {
    // notarytool resolves relative paths and expands `~` itself; `/Users/me/certs/cert` is valid base64, but not of a PEM file
    for (const value of ["/path/to/AuthKey_ABCDE12345.p8", "AuthKey_ABCDE12345.p8", "~/private_keys/AuthKey_ABCDE12345.p8", "/Users/me/certs/cert"]) {
      expect(MacTargetHelper.decodeAppleApiKey(value), value).toBeNull()
    }
  })

  test("decodes base64-encoded .p8 contents, on one line or wrapped", ({ expect }) => {
    for (const value of [p8Base64, `${p8Base64}\n`, `${p8Base64.match(/.{1,76}/g)!.join("\n")}\n`]) {
      expect(MacTargetHelper.decodeAppleApiKey(value)?.toString()).toBe(p8)
    }
  })

  test("rejects key material it cannot use, without showing it", ({ expect }) => {
    const rejected: Array<[string, string, RegExp]> = [
      ["a raw PEM", p8, /APPLE_API_KEY holds PEM text/],
      ["quoted", `"${p8Base64}"`, /APPLE_API_KEY looks like a base64-encoded key but is not valid standard base64/],
      ["missing its last character", p8Base64.slice(0, -1), /APPLE_API_KEY looks like a base64-encoded key but is not valid standard base64/],
      ["cut on a 4-character boundary", p8Base64.slice(0, 120), /APPLE_API_KEY decodes to PEM text that is not a valid private key/],
    ]
    for (const [name, value, message] of rejected) {
      const error = decodeError(value)
      expect(error, name).toBeInstanceOf(InvalidConfigurationError)
      expect(error!.message, name).toMatch(message)
      expect(error!.message, name).toContain("base64 < AuthKey_<KEY_ID>.p8 | tr -d '\\n'")
      expect(error!.message, name).not.toContain(value.trim())
      expect(error!.message, name).not.toContain(p8Body)
    }
  })
})

describe("notarizeIfProvided with APPLE_API_KEY", () => {
  function createHelper(tempDirManager: any, notarizeOption?: boolean) {
    return new MacTargetHelper({ platformOptions: { notarize: notarizeOption }, tempDirManager } as any)
  }

  test("passes a path to notarize unchanged and writes no key file", async ({ expect, tmpDir }) => {
    stubApiKeyEnv("~/private_keys/AuthKey_ABCDE12345.p8")
    const getTempFile = vi.spyOn(tmpDir, "getTempFile")
    await createHelper(tmpDir).notarizeIfProvided("/My.app")
    expect(notarize).toHaveBeenCalledWith(expect.objectContaining({ appPath: "/My.app", appleApiKey: "~/private_keys/AuthKey_ABCDE12345.p8" }))
    expect(getTempFile).not.toHaveBeenCalled()
  })

  test("writes base64 contents to a private temporary .p8 file for notarytool and deletes it afterwards", async ({ expect, tmpDir }) => {
    stubApiKeyEnv(p8Base64)
    const seen: Array<{ file: string; content: string; mode: number }> = []
    notarize.mockImplementation(async (options: any) => {
      seen.push({ file: options.appleApiKey, content: await fs.readFile(options.appleApiKey, "utf8"), mode: (await fs.stat(options.appleApiKey)).mode & 0o777 })
    })
    const helper = createHelper(tmpDir)
    // notarization runs per arch and per pkg, possibly at the same time: each call gets its own file
    await Promise.all([helper.notarizeIfProvided("/x64/My.app"), helper.notarizeIfProvided("/arm64/My.app")])

    expect(seen).toHaveLength(2)
    expect(seen[0].file).not.toBe(seen[1].file)
    for (const { file, content, mode } of seen) {
      expect(file.endsWith(".p8")).toBe(true)
      expect(content).toBe(p8)
      if (process.platform !== "win32") {
        expect(mode).toBe(0o600)
      }
      await expect(fs.stat(file)).rejects.toMatchObject({ code: "ENOENT" })
    }
    expect(notarize.mock.calls[0][0]).toMatchObject({ appleApiKeyId: "ABCDE12345", appleApiIssuer: "c055ca8c-e5a8-4836-b61d-aa5794eeb3f4" })
  })

  test("deletes the key file when notarization fails, and the failure propagates unchanged", async ({ expect, tmpDir }) => {
    stubApiKeyEnv(p8Base64)
    const failure = new Error("notarytool failed")
    let keyFile = ""
    notarize.mockImplementation((options: any) => {
      keyFile = options.appleApiKey
      return Promise.reject(failure)
    })
    await expect(createHelper(tmpDir).notarizeIfProvided("/My.app")).rejects.toBe(failure)
    await expect(fs.stat(keyFile)).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("an invalid APPLE_API_KEY fails before notarize runs", async ({ expect, tmpDir }) => {
    stubApiKeyEnv(p8)
    await expect(createHelper(tmpDir).notarizeIfProvided("/My.app")).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect(notarize).not.toHaveBeenCalled()
  })

  test("notarize: false neither validates APPLE_API_KEY nor notarizes", async ({ expect, tmpDir }) => {
    stubApiKeyEnv(p8)
    await createHelper(tmpDir, false).notarizeIfProvided("/My.app")
    expect(notarize).not.toHaveBeenCalled()
  })

  test("the Apple ID flow takes precedence, so APPLE_API_KEY is not validated", async ({ expect, tmpDir }) => {
    stubApiKeyEnv(p8)
    vi.stubEnv("APPLE_ID", "dev@example.com")
    vi.stubEnv("APPLE_APP_SPECIFIC_PASSWORD", "xxxx-yyyy-zzzz-wwww")
    vi.stubEnv("APPLE_TEAM_ID", "TEAM123456")
    await createHelper(tmpDir).notarizeIfProvided("/My.app")
    expect(notarize).toHaveBeenCalledWith(expect.objectContaining({ appleId: "dev@example.com" }))
  })
})
