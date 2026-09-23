import { randomBytes } from "crypto"

// KSUID custom epoch (May 13, 2014 in Unix seconds)
const KSUID_EPOCH = BigInt(1400000000)
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const BASE = BigInt(62)

/**
 * Generates a K-Sortable Unique Identifier (KSUID): a 27-char base62 string
 * encoding 4 bytes of timestamp + 16 bytes of random data.
 * Compatible with https://github.com/segmentio/ksuid
 */
export function generateKsuid(): string {
  const ts = BigInt(Math.floor(Date.now() / 1000)) - KSUID_EPOCH
  const buf = Buffer.allocUnsafe(20)
  buf.writeUInt32BE(Number(ts), 0)
  randomBytes(16).copy(buf, 4)
  return base62Encode(buf)
}

function base62Encode(buf: Buffer): string {
  let n = BigInt("0x" + buf.toString("hex"))
  let result = ""
  // 27 digits: ceil(160 / log2(62)) = 27
  for (let i = 0; i < 27; i++) {
    result = ALPHABET[Number(n % BASE)] + result
    n /= BASE
  }
  return result
}
