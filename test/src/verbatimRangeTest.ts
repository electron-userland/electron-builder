import { archive } from "app-builder-lib/src/targets/archive"
import { buildBlockMap } from "app-builder-lib/src/targets/blockmap/blockmap"
import { findPreparedVerbatimRange, findVerbatimRange, prepareVerbatimNeedle } from "app-builder-lib/src/targets/blockmap/verbatimRange"
import { locateStoredMemberRegions, STORED_MEMBER_CHUNKER } from "app-builder-lib/src/targets/differentialUpdateInfoBuilder"
import { log } from "builder-util"
import * as fs from "fs/promises"
import * as path from "path"
import { TmpDir } from "temp-file"
import { describe, vi } from "vitest"
import { listArchiveEntryMethods } from "./helpers/archiveHelper"

const KiB = 1024
const MiB = 1024 * KiB
// findVerbatimRange scans the first 64 KiB of the needle; a needle longer than that has a tail the
// probe does not cover, which is what makes a probe hit a mere candidate.
const PROBE_SIZE = 64 * KiB

// Deterministic pseudo-random bytes (LCG) so no probe-sized run ever repeats by accident.
function pseudoRandom(size: number, seed: number): Buffer {
  const buf = Buffer.allocUnsafe(size)
  let x = seed >>> 0
  for (let i = 0; i < size; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    buf[i] = x >>> 24
  }
  return buf
}

// getTempDir only reserves the path; the tests write straight into it.
async function makeTempDir(tmpDir: TmpDir, prefix: string): Promise<string> {
  const dir = await tmpDir.getTempDir({ prefix })
  await fs.mkdir(dir, { recursive: true })
  return dir
}

// Writes `haystack` and `needle` next to each other and returns their paths.
async function writePair(dir: string, haystack: Buffer, needle: Buffer): Promise<{ haystackFile: string; needleFile: string }> {
  const haystackFile = path.join(dir, "haystack.bin")
  const needleFile = path.join(dir, "needle.bin")
  await fs.writeFile(haystackFile, haystack)
  await fs.writeFile(needleFile, needle)
  return { haystackFile, needleFile }
}

// A haystack of `size` bytes of filler with `needle` pasted in at `offset`.
function plant(size: number, needle: Buffer, offset: number, fillerSeed = 7): Buffer {
  const haystack = pseudoRandom(size, fillerSeed)
  needle.copy(haystack, offset)
  return haystack
}

describe("findVerbatimRange", () => {
  const needle = pseudoRandom(100 * KiB, 42)

  test("needle at offset 0", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "verbatim-range")
    const files = await writePair(dir, plant(300 * KiB, needle, 0), needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toEqual({ offset: 0, size: needle.length })
  })

  test("needle mid-file", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "verbatim-range")
    const offset = 123_457
    const files = await writePair(dir, plant(300 * KiB, needle, offset), needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toEqual({ offset, size: needle.length })
  })

  test("needle at the very end", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "verbatim-range")
    const size = 300 * KiB
    const offset = size - needle.length
    const files = await writePair(dir, plant(size, needle, offset), needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toEqual({ offset, size: needle.length })
  })

  // The haystack is read in chunks; a needle whose probe straddles a chunk edge must still be found.
  // Boundaries at several power-of-two multiples cover any chunk size the implementation picks.
  for (const boundary of [256 * KiB, 512 * KiB, 1 * MiB, 2 * MiB]) {
    test(`needle straddling the ${boundary / KiB} KiB read boundary`, async ({ expect, tmpDir }) => {
      const dir = await makeTempDir(tmpDir, "verbatim-range")
      const offset = boundary - 1000
      const files = await writePair(dir, plant(3 * MiB, needle, offset), needle)
      expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toEqual({ offset, size: needle.length })
    })
  }

  test("needle smaller than the probe straddling a read boundary", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "verbatim-range")
    const smallNeedle = pseudoRandom(300, 99)
    const offset = 1 * MiB - 100
    const files = await writePair(dir, plant(2 * MiB, smallNeedle, offset), smallNeedle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toEqual({ offset, size: smallNeedle.length })
  })

  // The probe (first 64 KiB of the needle) also occurs earlier with a different tail: that candidate
  // must be rejected by the full comparison and the scan must go on to the real occurrence.
  test("skips a false-positive probe hit and returns the real match", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "verbatim-range")
    const decoyOffset = 10 * KiB
    const realOffset = 700 * KiB
    const haystack = plant(1 * MiB, needle, realOffset)
    needle.subarray(0, PROBE_SIZE).copy(haystack, decoyOffset)
    // decoy tail differs from the needle's tail
    haystack[decoyOffset + PROBE_SIZE] = needle[PROBE_SIZE] ^ 0xff
    const files = await writePair(dir, haystack, needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toEqual({ offset: realOffset, size: needle.length })
  })

  test("false-positive probe hit with no real match returns null", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "verbatim-range")
    const haystack = pseudoRandom(512 * KiB, 3)
    needle.subarray(0, PROBE_SIZE).copy(haystack, 200 * KiB)
    const files = await writePair(dir, haystack, needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toBeNull()
  })

  test("not found", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "verbatim-range")
    const files = await writePair(dir, pseudoRandom(512 * KiB, 3), needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toBeNull()
  })

  test("needle larger than haystack returns null", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "verbatim-range")
    const files = await writePair(dir, needle.subarray(0, needle.length - 1), needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toBeNull()
  })

  test("needle equal to haystack", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "verbatim-range")
    const files = await writePair(dir, needle, needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toEqual({ offset: 0, size: needle.length })
  })

  test("a probe hit too close to the end to fit the needle is not a match", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "verbatim-range")
    // haystack ends with the first 80 KiB of the needle — the probe matches but the needle can't fit
    const haystack = Buffer.concat([pseudoRandom(200 * KiB, 5), needle.subarray(0, 80 * KiB)])
    const files = await writePair(dir, haystack, needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toBeNull()
  })

  test("empty needle throws", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "verbatim-range")
    const files = await writePair(dir, pseudoRandom(4 * KiB, 1), Buffer.alloc(0))
    await expect(findVerbatimRange(files.haystackFile, files.needleFile)).rejects.toThrow("empty")
  })

  // The needle occurs twice; `startOffset` selects which occurrence the scan starts from.
  test("startOffset skips occurrences that start before it", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "verbatim-range")
    const first = 20 * KiB
    const second = 400 * KiB
    const haystack = plant(600 * KiB, needle, first)
    needle.copy(haystack, second)
    const files = await writePair(dir, haystack, needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toEqual({ offset: first, size: needle.length })
    expect(await findVerbatimRange(files.haystackFile, files.needleFile, first)).toEqual({ offset: first, size: needle.length })
    expect(await findVerbatimRange(files.haystackFile, files.needleFile, first + 1)).toEqual({ offset: second, size: needle.length })
    expect(await findVerbatimRange(files.haystackFile, files.needleFile, first + needle.length)).toEqual({ offset: second, size: needle.length })
    expect(await findVerbatimRange(files.haystackFile, files.needleFile, second + 1)).toBeNull()
  })

  test("startOffset after which the needle cannot fit returns null", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "verbatim-range")
    const size = 300 * KiB
    const files = await writePair(dir, plant(size, needle, size - needle.length), needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile, size - needle.length)).toEqual({ offset: size - needle.length, size: needle.length })
    expect(await findVerbatimRange(files.haystackFile, files.needleFile, size - needle.length + 1)).toBeNull()
    expect(await findVerbatimRange(files.haystackFile, files.needleFile, size + 1)).toBeNull()
  })

  test("invalid startOffset throws", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "verbatim-range")
    const files = await writePair(dir, plant(300 * KiB, needle, 0), needle)
    await expect(findVerbatimRange(files.haystackFile, files.needleFile, -1)).rejects.toThrow("startOffset")
    await expect(findVerbatimRange(files.haystackFile, files.needleFile, 1.5)).rejects.toThrow("startOffset")
  })

  // A needle prepared once is searched for repeatedly without being read again; two files with the
  // same bytes prepare to the same hash, which is how identical members are recognized.
  test("a prepared needle finds every occurrence in turn", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "verbatim-range")
    const offsets = [10 * KiB, 300 * KiB, 450 * KiB]
    const haystack = pseudoRandom(700 * KiB, 8)
    for (const offset of offsets) {
      needle.copy(haystack, offset)
    }
    const files = await writePair(dir, haystack, needle)
    const twinFile = path.join(dir, "twin.bin")
    await fs.writeFile(twinFile, needle)

    const prepared = await prepareVerbatimNeedle(files.needleFile)
    expect(prepared).toMatchObject({ file: files.needleFile, size: needle.length })
    expect(prepared.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(prepared.probe.equals(needle.subarray(0, PROBE_SIZE))).toBe(true)
    expect((await prepareVerbatimNeedle(twinFile)).hash).toBe(prepared.hash)

    const found: Array<number> = []
    for (let from = 0; ;) {
      const range = await findPreparedVerbatimRange(files.haystackFile, prepared, from)
      if (range == null) {
        break
      }
      found.push(range.offset)
      from = range.offset + range.size
    }
    expect(found).toEqual(offsets)
  })

  test("preparing an empty needle throws", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "verbatim-range")
    const emptyFile = path.join(dir, "empty.bin")
    await fs.writeFile(emptyFile, Buffer.alloc(0))
    await expect(prepareVerbatimNeedle(emptyFile)).rejects.toThrow("empty")
  })
})

// The production use: an app package built with `storedPaths` keeps the asar as a verbatim Copy
// member, and the region handed to the block map must be exactly those bytes.
describe("locateStoredMemberRegions", () => {
  async function makeAppDir(root: string, asar: Buffer): Promise<string> {
    const dir = path.join(root, "app")
    await fs.mkdir(path.join(dir, "resources"), { recursive: true })
    await fs.writeFile(path.join(dir, "app.txt"), "compressible ".repeat(2000))
    await fs.writeFile(path.join(dir, "resources", "app.asar"), asar)
    return dir
  }

  test("locates the stored asar in a 7z produced by archive() with storedPaths", async ({ expect, tmpDir }) => {
    const root = await makeTempDir(tmpDir, "stored-member-regions")
    const asarBytes = pseudoRandom(200 * KiB, 2024)
    const dir = await makeAppDir(root, asarBytes)
    const outFile = path.join(root, "stored.7z")
    await archive("7z", outFile, dir, { withoutDir: true, solid: false, storedPaths: ["resources/app.asar"] })
    expect((await listArchiveEntryMethods(outFile)).get("resources/app.asar")).toBe("Copy")

    const asarFile = path.join(dir, "resources", "app.asar")
    const regions = await locateStoredMemberRegions(outFile, [asarFile])
    expect(regions).toHaveLength(1)
    const [{ offset, size, chunker }] = regions
    expect(size).toBe(asarBytes.length)
    expect(chunker).toBe(STORED_MEMBER_CHUNKER)
    const archiveBytes = await fs.readFile(outFile)
    expect(archiveBytes.subarray(offset, offset + size).equals(asarBytes)).toBe(true)
  })

  // Several arch packages are embedded in one universal installer; the regions of all their stored
  // members must come back ascending, each covering its own member's bytes.
  test("returns one region per member, sorted by offset", async ({ expect, tmpDir }) => {
    const root = await makeTempDir(tmpDir, "stored-member-regions")
    const first = pseudoRandom(70 * KiB, 11)
    const second = pseudoRandom(90 * KiB, 12)
    const firstFile = path.join(root, "first.asar")
    const secondFile = path.join(root, "second.asar")
    await fs.writeFile(firstFile, first)
    await fs.writeFile(secondFile, second)
    // installer-like container: filler, second member, filler, first member, filler
    const container = Buffer.concat([pseudoRandom(50 * KiB, 1), second, pseudoRandom(30 * KiB, 2), first, pseudoRandom(20 * KiB, 3)])
    const containerFile = path.join(root, "installer.bin")
    await fs.writeFile(containerFile, container)

    const regions = await locateStoredMemberRegions(containerFile, [firstFile, secondFile])
    expect(regions.map(it => ({ offset: it.offset, size: it.size }))).toEqual([
      { offset: 50 * KiB, size: second.length },
      { offset: 50 * KiB + second.length + 30 * KiB, size: first.length },
    ])
  })

  test("a member not found verbatim is skipped without failing", async ({ expect, tmpDir }) => {
    const root = await makeTempDir(tmpDir, "stored-member-regions")
    const present = pseudoRandom(70 * KiB, 21)
    const missing = pseudoRandom(70 * KiB, 22)
    const presentFile = path.join(root, "present.asar")
    const missingFile = path.join(root, "missing.asar")
    await fs.writeFile(presentFile, present)
    await fs.writeFile(missingFile, missing)
    const containerFile = path.join(root, "installer.bin")
    await fs.writeFile(containerFile, Buffer.concat([pseudoRandom(10 * KiB, 1), present]))

    const regions = await locateStoredMemberRegions(containerFile, [missingFile, presentFile])
    expect(regions).toEqual([{ offset: 10 * KiB, size: present.length, chunker: STORED_MEMBER_CHUNKER }])
  })

  test("no members yields no regions", async ({ expect, tmpDir }) => {
    const root = await makeTempDir(tmpDir, "stored-member-regions")
    const containerFile = path.join(root, "installer.bin")
    await fs.writeFile(containerFile, pseudoRandom(10 * KiB, 1))
    expect(await locateStoredMemberRegions(containerFile, [])).toEqual([])
  })

  // A pure-JS app packaged for x64 + arm64 has byte-identical asars, and the universal installer embeds
  // both packages: each member must be matched to its own copy so the regions never overlap (the block
  // map builder rejects overlapping regions, which used to fail such builds).
  test("byte-identical members each get their own region", async ({ expect, tmpDir }) => {
    const root = await makeTempDir(tmpDir, "stored-member-regions")
    const asar = pseudoRandom(100 * KiB, 31)
    const x64File = path.join(root, "x64.asar")
    const arm64File = path.join(root, "arm64.asar")
    await fs.writeFile(x64File, asar)
    await fs.writeFile(arm64File, asar)
    const secondCopy = 50 * KiB + asar.length + 30 * KiB
    const container = Buffer.concat([pseudoRandom(50 * KiB, 1), asar, pseudoRandom(30 * KiB, 2), asar, pseudoRandom(20 * KiB, 3)])
    const containerFile = path.join(root, "installer.bin")
    await fs.writeFile(containerFile, container)

    const regions = await locateStoredMemberRegions(containerFile, [x64File, arm64File])
    expect(regions.map(it => ({ offset: it.offset, size: it.size }))).toEqual([
      { offset: 50 * KiB, size: asar.length },
      { offset: secondCopy, size: asar.length },
    ])
    // the regions are what the installer's block map is built with
    await expect(buildBlockMap(containerFile, "gzip", path.join(root, "installer.blockmap"), { regions })).resolves.toMatchObject({ size: container.length })
  })

  // Identical members resume the scan past their previous copy; a different member in between must
  // still be found wherever it is, and the member order must not matter.
  test("identical members interleaved with a different one each get their own region", async ({ expect, tmpDir }) => {
    const root = await makeTempDir(tmpDir, "stored-member-regions")
    const same = pseudoRandom(90 * KiB, 51)
    const other = pseudoRandom(70 * KiB, 52)
    const sameFiles = ["x64.asar", "ia32.asar", "arm64.asar"].map(it => path.join(root, it))
    for (const file of sameFiles) {
      await fs.writeFile(file, same)
    }
    const otherFile = path.join(root, "other.asar")
    await fs.writeFile(otherFile, other)
    // layout: same, other, same, same
    const container = Buffer.concat([pseudoRandom(5 * KiB, 1), same, pseudoRandom(5 * KiB, 2), other, pseudoRandom(5 * KiB, 3), same, pseudoRandom(5 * KiB, 4), same])
    const containerFile = path.join(root, "installer.bin")
    await fs.writeFile(containerFile, container)
    const expected = [
      { offset: 5 * KiB, size: same.length },
      { offset: 10 * KiB + same.length, size: other.length },
      { offset: 15 * KiB + same.length + other.length, size: same.length },
      { offset: 20 * KiB + 2 * same.length + other.length, size: same.length },
    ]

    for (const memberFiles of [
      [sameFiles[0], otherFile, sameFiles[1], sameFiles[2]],
      [otherFile, ...sameFiles],
      [...sameFiles, otherFile],
    ]) {
      const regions = await locateStoredMemberRegions(containerFile, memberFiles)
      expect(regions.map(it => ({ offset: it.offset, size: it.size }))).toEqual(expected)
    }
  })

  // Three identical members (x64 + ia32 + arm64) but the artifact holds only two copies: the third has
  // no copy of its own and is skipped rather than reusing a claimed range.
  test("identical members beyond the copies in the artifact are skipped", async ({ expect, tmpDir }) => {
    const root = await makeTempDir(tmpDir, "stored-member-regions")
    const asar = pseudoRandom(80 * KiB, 32)
    const memberFiles = ["x64.asar", "ia32.asar", "arm64.asar"].map(it => path.join(root, it))
    for (const file of memberFiles) {
      await fs.writeFile(file, asar)
    }
    const containerFile = path.join(root, "installer.bin")
    await fs.writeFile(containerFile, Buffer.concat([pseudoRandom(10 * KiB, 1), asar, asar, pseudoRandom(5 * KiB, 2)]))

    const warn = vi.spyOn(log, "warn")
    try {
      const regions = await locateStoredMemberRegions(containerFile, memberFiles)
      expect(regions.map(it => ({ offset: it.offset, size: it.size }))).toEqual([
        { offset: 10 * KiB, size: asar.length },
        { offset: 10 * KiB + asar.length, size: asar.length },
      ])
      expect(warn.mock.calls.filter(it => String(it[1]).includes("not found verbatim"))).toHaveLength(1)
    } finally {
      warn.mockRestore()
    }
  })

  // `asar: false` with "store-asar": the member is not in the package at all and its file does not
  // exist — it must be skipped, not stat()ed into an ENOENT that fails the build.
  test("a member file that does not exist is skipped without failing", async ({ expect, tmpDir }) => {
    const root = await makeTempDir(tmpDir, "stored-member-regions")
    const present = pseudoRandom(60 * KiB, 41)
    const presentFile = path.join(root, "present.asar")
    await fs.writeFile(presentFile, present)
    const absentFile = path.join(root, "resources", "app.asar")
    const containerFile = path.join(root, "installer.bin")
    await fs.writeFile(containerFile, Buffer.concat([pseudoRandom(10 * KiB, 1), present]))

    const warn = vi.spyOn(log, "warn")
    try {
      expect(await locateStoredMemberRegions(containerFile, [absentFile])).toEqual([])
      expect(await locateStoredMemberRegions(containerFile, [absentFile, presentFile])).toEqual([{ offset: 10 * KiB, size: present.length, chunker: STORED_MEMBER_CHUNKER }])
      expect(warn.mock.calls.filter(it => String(it[1]).includes("does not exist"))).toHaveLength(2)
    } finally {
      warn.mockRestore()
    }
  })
})
