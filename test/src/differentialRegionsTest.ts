import { archive } from "app-builder-lib/src/targets/archive"
import { chunkFile } from "app-builder-lib/src/targets/blockmap/blockmap"
import {
  ARCHIVE_HEADER_CHUNKER,
  asarContentBoundaries,
  configureDifferentialAwareArchiveOptions,
  installerBlockMapOptions,
  locateArchiveHeaderRegions,
  locateStoredMembers,
  STORED_MEMBER_CHUNKER,
} from "app-builder-lib/src/targets/differentialUpdateInfoBuilder"
import { readAsarHeader } from "app-builder-lib/src/asar/asar"
import { dynamicImport } from "app-builder-lib/src/util/dynamicImport"
import * as fs from "fs/promises"
import * as path from "path"
import { TmpDir } from "temp-file"
import { describe } from "vitest"
import * as zlib from "zlib"

const KiB = 1024

function pseudoRandom(size: number, seed: number): Buffer {
  const buf = Buffer.allocUnsafe(size)
  let x = seed >>> 0
  for (let i = 0; i < size; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    buf[i] = x >>> 24
  }
  return buf
}

async function makeTempDir(tmpDir: TmpDir, prefix: string): Promise<string> {
  const dir = await tmpDir.getTempDir({ prefix })
  await fs.mkdir(dir, { recursive: true })
  return dir
}

/** A small app tree with a stored asar, packaged like NsisTarget packages a differential-aware app. */
async function buildPackage(dir: string, name: string, headerCompressed: boolean): Promise<string> {
  const src = path.join(dir, `${name}-src`)
  await fs.mkdir(path.join(src, "resources"), { recursive: true })
  await fs.writeFile(path.join(src, "app.exe"), pseudoRandom(40 * KiB, 1))
  await fs.writeFile(path.join(src, "LICENSE"), "license ".repeat(500))
  await fs.writeFile(path.join(src, "resources", "app.asar"), pseudoRandom(100 * KiB, 2))
  const out = path.join(dir, `${name}.7z`)
  const options = configureDifferentialAwareArchiveOptions({ withoutDir: true, compression: "normal", storedPaths: ["resources/app.asar"] }, true)
  if (headerCompressed) {
    options.isArchiveHeaderCompressed = true
  }
  await archive("7z", out, src, options)
  return out
}

/** Block starts of `file` chunked with `options`. */
async function blockStarts(file: string, options: Parameters<typeof chunkFile>[1]): Promise<Array<number>> {
  const starts: Array<number> = []
  await chunkFile(file, options, (_chunk, offset) => starts.push(offset))
  return starts
}

describe("configureDifferentialAwareArchiveOptions", () => {
  test("stores the archive header as is only for a build that writes binary block maps", ({ expect }) => {
    expect(configureDifferentialAwareArchiveOptions({}, true).isArchiveHeaderCompressed).toBe(false)
    // a JSON block map build packages exactly as before (7-Zip's default: a compressed header)
    expect(configureDifferentialAwareArchiveOptions({}, false).isArchiveHeaderCompressed).toBeUndefined()
  })
})

describe("locateArchiveHeaderRegions", () => {
  test("the archive itself: the region is its header, stored as is and small", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "hdr-region")
    const pkg = await buildPackage(dir, "pkg", false)
    const size = (await fs.stat(pkg)).size
    const regions = await locateArchiveHeaderRegions(pkg, [pkg])
    expect(regions).toHaveLength(1)
    const [region] = regions
    expect(region.chunker).toEqual(ARCHIVE_HEADER_CHUNKER)
    // the header is the tail of a 7z archive
    expect(region.offset + region.size).toBe(size)
    expect(region.size).toBeGreaterThan(0)
    expect(region.size).toBeLessThan(4 * KiB)
    // and starts with the kHeader id, i.e. it is not an encoded (compressed) header
    const handle = await fs.open(pkg, "r")
    try {
      const first = Buffer.alloc(1)
      await handle.read(first, 0, 1, region.offset)
      expect(first[0]).toBe(0x01)
    } finally {
      await handle.close()
    }
    // the header region is a block boundary on both edges and chunked finely
    const starts = await blockStarts(pkg, { regions })
    expect(starts).toContain(region.offset)
    const headerBlocks = starts.filter(it => it >= region.offset)
    expect(headerBlocks.length).toBeGreaterThanOrEqual(1)
  })

  test("embedded in an installer: located verbatim, and two byte-identical archives get their own regions", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "hdr-embedded")
    const pkg = await buildPackage(dir, "pkg", false)
    const pkgBytes = await fs.readFile(pkg)
    const [own] = await locateArchiveHeaderRegions(pkg, [pkg])
    const prefix = pseudoRandom(70 * KiB, 3)
    const between = pseudoRandom(3 * KiB, 4)
    const installer = path.join(dir, "installer.bin")
    await fs.writeFile(installer, Buffer.concat([prefix, pkgBytes, between, pkgBytes, pseudoRandom(KiB, 5)]))

    const regions = await locateArchiveHeaderRegions(installer, [pkg, pkg])
    expect(regions).toEqual([
      { offset: prefix.length + own.offset, size: own.size, chunker: ARCHIVE_HEADER_CHUNKER },
      { offset: prefix.length + pkgBytes.length + between.length + own.offset, size: own.size, chunker: ARCHIVE_HEADER_CHUNKER },
    ])
  })

  test("a compressed header, a non-7z file and a missing file yield no region", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "hdr-none")
    const compressed = await buildPackage(dir, "compressed", true)
    expect(await locateArchiveHeaderRegions(compressed, [compressed])).toEqual([])
    const text = path.join(dir, "notes.txt")
    await fs.writeFile(text, "not an archive at all, just text that is long enough to read 32 bytes from")
    expect(await locateArchiveHeaderRegions(text, [text])).toEqual([])
    expect(await locateArchiveHeaderRegions(text, [path.join(dir, "missing.7z")])).toEqual([])
  })

  test("a start header that fails its CRC, or names a header past the end of the artifact, yields no region instead of failing the block map", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "hdr-invalid")
    const pkg = await buildPackage(dir, "pkg", false)
    const bytes = await fs.readFile(pkg)
    expect(await locateArchiveHeaderRegions(pkg, [pkg])).toHaveLength(1)

    const badCrc = path.join(dir, "bad-crc.7z")
    const corrupted = Buffer.from(bytes)
    corrupted[8] ^= 0xff
    await fs.writeFile(badCrc, corrupted)
    expect(await locateArchiveHeaderRegions(badCrc, [badCrc])).toEqual([])

    // a consistent start header (valid CRC) whose next header extends past the end of the file
    const pastEnd = path.join(dir, "past-end.7z")
    const truncated = Buffer.from(bytes)
    truncated.writeBigUInt64LE(BigInt(bytes.length), 20)
    truncated.writeUInt32LE(zlib.crc32(truncated.subarray(12, 32)), 8)
    await fs.writeFile(pastEnd, truncated)
    expect(await locateArchiveHeaderRegions(pastEnd, [pastEnd])).toEqual([])
  })

  test("an archive that is not in the artifact yields no region", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "hdr-absent")
    const pkg = await buildPackage(dir, "pkg", false)
    const other = path.join(dir, "other.bin")
    await fs.writeFile(other, pseudoRandom(200 * KiB, 6))
    expect(await locateArchiveHeaderRegions(other, [pkg])).toEqual([])
  })
})

describe("asarContentBoundaries", () => {
  async function packAsar(dir: string): Promise<{ file: string; packed: Array<string> }> {
    const src = path.join(dir, "app-src")
    await fs.mkdir(path.join(src, "lib", "deep"), { recursive: true })
    const packed = ["package.json", "lib/a.js", "lib/b.js", "lib/deep/c.js", "main.js"]
    for (const [i, rel] of packed.entries()) {
      await fs.writeFile(path.join(src, rel), pseudoRandom(700 + i * 333, 10 + i))
    }
    await fs.writeFile(path.join(src, "big.bin"), pseudoRandom(4 * KiB, 20))
    await fs.symlink("a.js", path.join(src, "lib", "alias.js"))
    const { createPackageWithOptions } = await dynamicImport<any>("@electron/asar")
    const file = path.join(dir, "app.asar")
    await createPackageWithOptions(src, file, { unpack: "**/big.bin" })
    return { file, packed }
  }

  test("one boundary at the content start and at every packed file; unpacked files and links contribute none", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "asar-bounds")
    const { file, packed } = await packAsar(dir)
    const { header, size: headerSize } = await readAsarHeader(file)
    const entries = new Map<string, any>()
    const walk = (node: any, prefix: string) => {
      for (const [name, child] of Object.entries<any>(node.files ?? {})) {
        const rel = prefix ? `${prefix}/${name}` : name
        if (child.files != null) {
          walk(child, rel)
        } else {
          entries.set(rel, child)
        }
      }
    }
    walk(JSON.parse(header), "")
    expect(entries.get("big.bin").unpacked).toBe(true)
    expect(entries.get("lib/alias.js").link).toBeDefined()

    const regionOffset = 12_345
    const region = { offset: regionOffset, size: (await fs.stat(file)).size, chunker: STORED_MEMBER_CHUNKER }
    const boundaries = await asarContentBoundaries([{ file, region }])

    const contentStart = regionOffset + 8 + headerSize
    const expected = new Set<number>([contentStart])
    for (const rel of packed) {
      expected.add(contentStart + parseInt(entries.get(rel).offset, 10))
    }
    expect(boundaries).toEqual([...expected].sort((a, b) => a - b))
    // strictly inside the region, ascending, no duplicates
    for (const boundary of boundaries) {
      expect(boundary).toBeGreaterThan(regionOffset)
      expect(boundary).toBeLessThan(regionOffset + region.size)
    }
  })

  test("a stored member that is not an asar contributes nothing", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "asar-bounds-none")
    const file = path.join(dir, "data.bin")
    await fs.writeFile(file, pseudoRandom(50 * KiB, 30))
    expect(await asarContentBoundaries([{ file, region: { offset: 0, size: 50 * KiB, chunker: STORED_MEMBER_CHUNKER } }])).toEqual([])
  })

  test("boundaries of a located stored asar are block starts of the artifact's v3 chunking", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "asar-bounds-located")
    const { file } = await packAsar(dir)
    const artifact = path.join(dir, "artifact.bin")
    await fs.writeFile(artifact, Buffer.concat([pseudoRandom(9 * KiB, 40), await fs.readFile(file), pseudoRandom(2 * KiB, 41)]))
    const members = await locateStoredMembers(artifact, [file])
    expect(members).toHaveLength(1)
    expect(members[0].file).toBe(file)
    expect(members[0].region.offset).toBe(9 * KiB)
    const boundaries = await asarContentBoundaries(members)
    expect(boundaries.length).toBeGreaterThan(3)
    const starts = await blockStarts(artifact, { regions: members.map(it => it.region), boundaries })
    for (const boundary of boundaries) {
      expect(starts, `block boundary at ${boundary}`).toContain(boundary)
    }
  })
})

describe("installerBlockMapOptions", () => {
  test("only the binary format reads the asar headers and the archive headers; the JSON format gets the stored member regions alone", async ({ expect, tmpDir }) => {
    const dir = await makeTempDir(tmpDir, "installer-options")
    const src = path.join(dir, "app-src")
    await fs.mkdir(src, { recursive: true })
    for (const [i, rel] of ["a.js", "b.js", "c.js"].entries()) {
      await fs.writeFile(path.join(src, rel), pseudoRandom(900 + i * 211, 50 + i))
    }
    const { createPackageWithOptions } = await dynamicImport<any>("@electron/asar")
    const asar = path.join(dir, "app.asar")
    await createPackageWithOptions(src, asar, {})
    const installer = path.join(dir, "installer.exe")
    await fs.writeFile(installer, Buffer.concat([pseudoRandom(5 * KiB, 60), await fs.readFile(asar), pseudoRandom(KiB, 61)]))
    const members = await locateStoredMembers(installer, [asar])
    expect(members).toHaveLength(1)

    expect(await installerBlockMapOptions(installer, members, [], "v2")).toEqual({ regions: [members[0].region] })
    const binary = await installerBlockMapOptions(installer, members, [], "v3")
    expect(binary?.regions).toEqual([members[0].region])
    expect(binary?.v3Boundaries).toEqual(await asarContentBoundaries(members))
    expect(binary?.v3Boundaries?.length).toBeGreaterThan(1)
    // nothing stored: no options at all
    expect(await installerBlockMapOptions(installer, [], [], "v2")).toBeUndefined()
  })
})
