import { HeaderHash } from "app-builder-lib/src/asar/integrity"
import { ASAR_INTEGRITY_DIGEST_SENTINEL, computeAsarIntegrityDigest, writeAsarIntegrityDigest } from "app-builder-lib/src/electron/mac/asarIntegrityDigest"
import { createHash } from "crypto"
import * as fs from "fs/promises"
import * as path from "path"

const SENTINEL = Buffer.from(ASAR_INTEGRITY_DIGEST_SENTINEL)
const SLOT_LENGTH = 34
// mirrors the scan chunk size, so a sentinel can be placed across a read boundary
const CHUNK = 4 * 1024 * 1024

// A stand-in `Electron Framework`: non-zero filler with a sentinel (followed by an unwritten slot) at each offset.
function fakeFramework(size: number, sentinelOffsets: Array<number>): Buffer {
  const binary = Buffer.alloc(size, 0xab)
  for (const offset of sentinelOffsets) {
    SENTINEL.copy(binary, offset)
    binary.fill(0, offset + SENTINEL.length, Math.min(size, offset + SENTINEL.length + SLOT_LENGTH))
  }
  return binary
}

function expectSlotWritten(expect: any, binary: Buffer, sentinelOffset: number, digest: Buffer) {
  const slot = sentinelOffset + SENTINEL.length
  expect(binary[slot]).toBe(1) // used
  expect(binary[slot + 1]).toBe(1) // version
  expect(binary.subarray(slot + 2, slot + SLOT_LENGTH).equals(digest)).toBe(true)
}

// Checked against Electron 41.3.0 with the integrity fuse on: the app launches with these digests, and exits with
// "Failed to get integrity for validatable asar archive" with the digest of the same entries in localeCompare order.
describe("computeAsarIntegrityDigest", () => {
  const appAsar: HeaderHash = { algorithm: "SHA256", hash: "697f2a6b9d6432470fe072c343c1714768b5fc304bd6f5fa7a4810821785f854" }
  const zetaAsar: HeaderHash = { algorithm: "SHA256", hash: "0".repeat(64) }

  test("hashes key, algorithm and hash of each entry", ({ expect }) => {
    const digest = computeAsarIntegrityDigest({ "Resources/app.asar": appAsar })
    expect(digest.toString("hex")).toBe("3d190382a0a7e6bcbe9928aab2dbc9b7d9ccceff8961e16115b48a8357edda8d")
  })

  // Electron sorts with NSLiteralSearch: "Z" (0x5A) before "a" (0x61), the reverse of localeCompare
  test("sorts the keys by UTF-16 code unit like Electron, not by locale", ({ expect }) => {
    const digest = computeAsarIntegrityDigest({ "Resources/app.asar": appAsar, "Resources/Zeta.asar": zetaAsar })
    expect(digest.toString("hex")).toBe("79930f4684961180fcfba4e60254df23a95d9929bb8f12a894f685312af2fd34")
    expect(digest.toString("hex")).not.toBe("26f070862bd3f0dbf06e8479836022f359ca822120bdb5da2fea4437c1b28434")
  })

  test("does not depend on the order of the entries", ({ expect }) => {
    const digest = computeAsarIntegrityDigest({ "Resources/Zeta.asar": zetaAsar, "Resources/app.asar": appAsar })
    expect(digest.toString("hex")).toBe("79930f4684961180fcfba4e60254df23a95d9929bb8f12a894f685312af2fd34")
  })
})

describe("writeAsarIntegrityDigest", () => {
  const digest = createHash("sha256").update("digest").digest()

  async function writeFramework(tmpDir: any, binary: Buffer): Promise<string> {
    const file = path.join(await tmpDir.createTempDir(), "Electron Framework")
    await fs.writeFile(file, binary)
    return file
  }

  test("writes the slot and leaves every other byte untouched", async ({ expect, tmpDir }) => {
    const original = fakeFramework(4096, [100])
    const file = await writeFramework(tmpDir, original)

    expect(await writeAsarIntegrityDigest(file, digest)).toBe(1)

    const patched = await fs.readFile(file)
    expectSlotWritten(expect, patched, 100, digest)
    const slot = 100 + SENTINEL.length
    const withoutSlot = (binary: Buffer) => Buffer.concat([binary.subarray(0, slot), binary.subarray(slot + SLOT_LENGTH)])
    expect(patched.length).toBe(original.length)
    expect(withoutSlot(patched).equals(withoutSlot(original))).toBe(true)
  })

  test("finds a sentinel that straddles a read chunk boundary", async ({ expect, tmpDir }) => {
    const offset = CHUNK - 10
    const file = await writeFramework(tmpDir, fakeFramework(CHUNK + 1024, [offset]))

    expect(await writeAsarIntegrityDigest(file, digest)).toBe(1)
    expectSlotWritten(expect, await fs.readFile(file), offset, digest)
  })

  test("writes the slot of every slice of a universal binary", async ({ expect, tmpDir }) => {
    const offsets = [1024, CHUNK + 1024]
    const file = await writeFramework(tmpDir, fakeFramework(CHUNK + 4096, offsets))

    expect(await writeAsarIntegrityDigest(file, digest)).toBe(2)
    const patched = await fs.readFile(file)
    for (const offset of offsets) {
      expectSlotWritten(expect, patched, offset, digest)
    }
  })

  test("leaves a binary without a slot (Electron < 41) untouched", async ({ expect, tmpDir }) => {
    const original = fakeFramework(4096, [])
    const file = await writeFramework(tmpDir, original)

    expect(await writeAsarIntegrityDigest(file, digest)).toBe(0)
    expect((await fs.readFile(file)).equals(original)).toBe(true)
  })

  test("writes nothing if there are more slots than slices of a universal binary", async ({ expect, tmpDir }) => {
    const original = fakeFramework(4096, [100, 1100, 2100])
    const file = await writeFramework(tmpDir, original)

    await expect(writeAsarIntegrityDigest(file, digest)).rejects.toThrow(/Found 3 ASAR integrity digest slots/)
    expect((await fs.readFile(file)).equals(original)).toBe(true)
  })

  test("writes nothing if any slot is truncated", async ({ expect, tmpDir }) => {
    const size = 4096
    const original = fakeFramework(size, [100, size - SENTINEL.length - 10])
    const file = await writeFramework(tmpDir, original)

    await expect(writeAsarIntegrityDigest(file, digest)).rejects.toThrow(/truncated/)
    expect((await fs.readFile(file)).equals(original)).toBe(true)
  })

  test("rejects a digest that is not 32 bytes", async ({ expect, tmpDir }) => {
    const file = await writeFramework(tmpDir, fakeFramework(4096, [100]))
    await expect(writeAsarIntegrityDigest(file, Buffer.alloc(16))).rejects.toThrow(/must be 32 bytes/)
  })
})
