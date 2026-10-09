import { InvalidConfigurationError } from "builder-util"
import { createHash } from "crypto"
import { promises as fs } from "fs"
import * as path from "path"
import { checksumCacheKey, checksumMismatchMessage, parseChecksum, verifyFileChecksum } from "app-builder-lib/src/util/checksum"

const SHA256 = "56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4"
// the documented v26 customNsisBinary default checksum (base64-encoded SHA-512)
const SHA512_BASE64 = "VKMiizYdmNdJOWpRGz4trl4lD++BvYP2irAXpMilheUP0pc93iKlWAoP843Vlraj8YG19CVn0j+dCo/hURz9+Q=="

describe("parseChecksum", () => {
  test("classifies SHA-256 hex", ({ expect }) => {
    expect(parseChecksum(SHA256, "label")).toEqual({ algorithm: "sha256", encoding: "hex", value: SHA256 })
  })

  test("lowercases uppercase SHA-256 hex and trims whitespace", ({ expect }) => {
    expect(parseChecksum(`  ${SHA256.toUpperCase()}\n`, "label")).toEqual({ algorithm: "sha256", encoding: "hex", value: SHA256 })
  })

  test("classifies base64 SHA-512, preserving case", ({ expect }) => {
    expect(parseChecksum(` ${SHA512_BASE64} `, "label")).toEqual({ algorithm: "sha512", encoding: "base64", value: SHA512_BASE64 })
  })

  test.for([
    ["a sha256: prefixed value", `sha256:${SHA256}`],
    ["an SRI-style sha512- prefixed value", `sha512-${SHA512_BASE64}`],
    ["a SHA-512 in hex", "ab".repeat(64)],
    ["a truncated hex value", SHA256.substring(0, 20)],
    ["a base64 SHA-512 without padding", SHA512_BASE64.slice(0, -2)],
    ["a url-safe base64 SHA-512", SHA512_BASE64.replace(/\+/g, "-").replace(/\//g, "_")],
    ["a SHA-256 in base64", createHash("sha256").update("x").digest("base64")],
    ["an empty string", ""],
  ] as const)("rejects %s without echoing it", ([, value], { expect }) => {
    let error: any
    try {
      parseChecksum(value, "ToolsetCustom.checksum for test", "https://example.com/docs")
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain("ToolsetCustom.checksum for test")
    expect(error.message).toContain("shasum -a 256 <archive>")
    expect(error.message).toContain("openssl dgst -sha512 -binary <archive> | openssl base64 -A")
    expect(error.message).toContain("See https://example.com/docs")
    if (value.length > 0) {
      expect(error.message).not.toContain(value)
    }
  })

  test("rejects a non-string value from a JS config", ({ expect }) => {
    expect(() => parseChecksum(undefined as any, "label")).toThrow(InvalidConfigurationError)
    expect(() => parseChecksum(12345 as any, "label")).toThrow(InvalidConfigurationError)
  })
})

describe("checksumCacheKey", () => {
  test("is the SHA-256 hex value itself, so existing cache directory names are unchanged", ({ expect }) => {
    expect(checksumCacheKey(parseChecksum(SHA256.toUpperCase(), "label"))).toBe(SHA256)
  })

  test("is the hex form of a base64 SHA-512: no '/' or '+' can reach a directory name", ({ expect }) => {
    const key = checksumCacheKey(parseChecksum(SHA512_BASE64, "label"))
    expect(key).toMatch(/^[0-9a-f]{128}$/)
    expect(key).toBe(Buffer.from(SHA512_BASE64, "base64").toString("hex"))
    // the documented value starts with "VKMiizYd", which is filesystem-safe by chance; its hex prefix always is
    expect(key.substring(0, 8)).toBe("54a3228b")
  })
})

describe("verifyFileChecksum", () => {
  async function writeFixture(tmpDir: { createTempDir: (options?: { prefix: string }) => Promise<string> }, content: string): Promise<string> {
    const dir = await tmpDir.createTempDir({ prefix: "checksum-test" })
    const file = path.join(dir, "archive.bin")
    await fs.writeFile(file, content)
    return file
  }

  test("matches SHA-256 hex and base64 SHA-512 of the file", async ({ expect, tmpDir }) => {
    const file = await writeFixture(tmpDir, "archive bytes")
    const sha256 = createHash("sha256").update("archive bytes").digest("hex")
    const sha512 = createHash("sha512").update("archive bytes").digest("base64")
    expect(await verifyFileChecksum(file, parseChecksum(sha256.toUpperCase(), "label"))).toEqual({ matches: true, actual: sha256 })
    expect(await verifyFileChecksum(file, parseChecksum(sha512, "label"))).toEqual({ matches: true, actual: sha512 })
  })

  test("reports the actual digest on mismatch and leaves the file in place", async ({ expect, tmpDir }) => {
    const file = await writeFixture(tmpDir, "archive bytes")
    const expected = parseChecksum(createHash("sha512").update("other bytes").digest("base64"), "label")
    const actual = createHash("sha512").update("archive bytes").digest("base64")
    expect(await verifyFileChecksum(file, expected)).toEqual({ matches: false, actual })
    expect(await fs.readFile(file, "utf8")).toBe("archive bytes")
    const message = checksumMismatchMessage("my archive", expected, actual)
    expect(message).toContain("sha512 checksum mismatch for my archive")
    expect(message).toContain(expected.value)
    expect(message).toContain(actual)
  })

  test("rejects when the file does not exist", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "checksum-test" })
    await expect(verifyFileChecksum(path.join(dir, "missing.bin"), parseChecksum(SHA256, "label"))).rejects.toThrow(/ENOENT/)
  })
})
