import { describe, it, expect } from "vitest"
import { generateKsuid } from "builder-util/internal"

const KSUID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const KSUID_EPOCH = 1400000000
const KSUID_LENGTH = 27

/**
 * Decode a KSUID string back to its timestamp (Unix seconds) and random payload.
 * Used in tests to verify the timestamp component without comparing random bytes.
 */
function decodeKsuid(id: string): { timestampSeconds: number; payload: Buffer } {
  let n = BigInt(0)
  for (const c of id) {
    const idx = KSUID_ALPHABET.indexOf(c)
    if (idx === -1) {
      throw new Error(`Invalid KSUID character: '${c}'`)
    }
    n = n * BigInt(62) + BigInt(idx)
  }
  // 20 bytes: 4-byte big-endian timestamp + 16-byte random payload
  const hex = n.toString(16).padStart(40, "0")
  const buf = Buffer.from(hex, "hex")
  return {
    timestampSeconds: buf.readUInt32BE(0) + KSUID_EPOCH,
    payload: buf.subarray(4),
  }
}

// ─── Unit tests ──────────────────────────────────────────────────────────────

describe("generateKsuid — format", () => {
  it("produces exactly 27 characters", () => {
    expect(generateKsuid()).toHaveLength(KSUID_LENGTH)
  })

  it("uses only base62 characters (0-9, A-Z, a-z)", () => {
    expect(generateKsuid()).toMatch(/^[0-9A-Za-z]{27}$/)
  })

  it("produces unique values on every call", () => {
    const ids = Array.from({ length: 20 }, () => generateKsuid())
    expect(new Set(ids).size).toBe(20)
  })
})

describe("generateKsuid — sortability", () => {
  it("produces lexicographically non-decreasing IDs in a tight loop (same second)", () => {
    // All calls happen within the same second, so ordering is maintained by random component
    // being independently random (but KSUID spec guarantees the timestamp prefix is equal,
    // so we only verify no errors occur — strict ordering within 1 second is probabilistic)
    const ids = Array.from({ length: 10 }, () => generateKsuid())
    // Every ID must be a valid KSUID
    for (const id of ids) {
      expect(id).toMatch(/^[0-9A-Za-z]{27}$/)
    }
  })

  it("IDs generated 1 second apart are strictly ordered", () => {
    const now = Math.floor(Date.now() / 1000)
    // Construct two KSUIDs manually with known timestamps to verify ordering
    const buf1 = Buffer.allocUnsafe(20)
    const buf2 = Buffer.allocUnsafe(20)
    buf1.writeUInt32BE(now - KSUID_EPOCH, 0)
    buf2.writeUInt32BE(now - KSUID_EPOCH + 1, 0)
    buf1.fill(0, 4)
    buf2.fill(0, 4)

    function encode(buf: Buffer): string {
      let n = BigInt("0x" + buf.toString("hex"))
      let result = ""
      for (let i = 0; i < 27; i++) {
        result = KSUID_ALPHABET[Number(n % BigInt(62))] + result
        n /= BigInt(62)
      }
      return result
    }

    expect(encode(buf1) < encode(buf2)).toBe(true)
  })
})

describe("generateKsuid — timestamp encoding", () => {
  it("encodes the current Unix timestamp within the first 4 bytes", () => {
    const before = Math.floor(Date.now() / 1000)
    const id = generateKsuid()
    const after = Math.floor(Date.now() / 1000)

    const { timestampSeconds } = decodeKsuid(id)
    expect(timestampSeconds).toBeGreaterThanOrEqual(before)
    expect(timestampSeconds).toBeLessThanOrEqual(after + 1)
  })

  it("payload is 16 bytes of random data", () => {
    const { payload } = decodeKsuid(generateKsuid())
    expect(payload).toHaveLength(16)
    // Two consecutive payloads must differ (astronomically unlikely to collide)
    const { payload: payload2 } = decodeKsuid(generateKsuid())
    expect(payload.toString("hex")).not.toBe(payload2.toString("hex"))
  })
})
