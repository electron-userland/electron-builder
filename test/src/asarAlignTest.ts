import { alignAsarContent, validateContentAlignment } from "app-builder-lib/src/asar/asarAlign"
import { InvalidConfigurationError, log } from "builder-util"
import { readAsar, readAsarHeader } from "app-builder-lib/src/asar/asar"
import { dynamicImport } from "app-builder-lib/src/util/dynamicImport"
import { Platform } from "app-builder-lib"
import * as fs from "fs/promises"
import * as path from "path"
import { app, appThrows, linuxDirTarget } from "./helpers/packTester.js"

type Asar = { createPackage(src: string, dest: string): Promise<void>; extractFile(archive: string, filename: string): Buffer }
const asar = () => dynamicImport<Asar>("@electron/asar")

// Deterministic tree: sizes straddle the alignment so padding is non-trivial, plus a nested dir,
// an empty file and a file that is an exact multiple of the alignment.
function makeTree(): Map<string, Buffer> {
  const files = new Map<string, Buffer>()
  let seed = 7
  const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0)
  for (let i = 0; i < 40; i++) {
    const size = i === 0 ? 0 : i === 1 ? 1024 : 100 + (next() % 3000)
    const buf = Buffer.alloc(size)
    for (let j = 0; j < size; j++) {
      buf[j] = next() & 0xff
    }
    files.set(i % 3 === 0 ? `lib/mod${i}.js` : `src/deep/er/file${i}.txt`, buf)
  }
  files.set("package.json", Buffer.from(JSON.stringify({ name: "aligned", main: "lib/mod0.js" })))
  return files
}

async function writeTree(root: string, files: Map<string, Buffer>): Promise<void> {
  for (const [rel, content] of files) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true })
    await fs.writeFile(path.join(root, rel), content)
  }
}

async function packTree(tmp: string, name: string, files: Map<string, Buffer>): Promise<string> {
  const src = path.join(tmp, `${name}-src`)
  await writeTree(src, files)
  const out = path.join(tmp, `${name}.asar`)
  await (await asar()).createPackage(src, out)
  return out
}

function walkOffsets(node: any, prefix: string, into: Map<string, any>): void {
  for (const [name, child] of Object.entries<any>(node.files ?? {})) {
    const rel = prefix ? `${prefix}/${name}` : name
    if (child.files != null) {
      walkOffsets(child, rel, into)
    } else {
      into.set(rel, child)
    }
  }
}

async function headerEntries(file: string): Promise<Map<string, any>> {
  const entries = new Map<string, any>()
  walkOffsets(JSON.parse((await readAsarHeader(file)).header), "", entries)
  return entries
}

describe("alignAsarContent", () => {
  test("aligns every packed file to the boundary, keeps content, sizes and integrity", async ({ expect, tmpDir }) => {
    const tmp = await tmpDir.createTempDir()
    const files = makeTree()
    const file = await packTree(tmp, "app", files)
    const before = await headerEntries(file)
    const sizeBefore = (await fs.stat(file)).size

    const result = await alignAsarContent(file, 512)

    expect(result.files).toBe(files.size)
    expect(result.sizeBefore).toBe(sizeBefore)
    expect(result.sizeAfter).toBe((await fs.stat(file)).size)
    expect(result.sizeAfter - result.sizeBefore).toBeLessThanOrEqual(result.paddingBytes + 16) // header may grow by a few offset digits
    expect(result.paddingBytes).toBeLessThan(files.size * 512)

    const after = await headerEntries(file)
    expect([...after.keys()]).toEqual([...before.keys()])
    for (const [rel, entry] of after) {
      expect(parseInt(entry.offset, 10) % 512, `${rel} offset ${entry.offset}`).toBe(0)
      const { offset: _o, ...rest } = entry
      const { offset: _b, ...restBefore } = before.get(rel)
      expect(rest, `${rel}: everything but offset must be unchanged`).toEqual(restBefore)
    }

    // content readable through both @electron/asar and app-builder-lib's own reader
    const electronAsar = await asar()
    const ownReader = await readAsar(file)
    for (const [rel, content] of files) {
      // both readers split the lookup path on path.sep
      const native = rel.split("/").join(path.sep)
      expect(electronAsar.extractFile(file, native).equals(content), `extractFile(${rel})`).toBe(true)
      expect((await ownReader.readFile(native)).equals(content), `readFile(${rel})`).toBe(true)
    }
  })

  test("preserves file order in the content region", async ({ expect, tmpDir }) => {
    const tmp = await tmpDir.createTempDir()
    const file = await packTree(tmp, "order", makeTree())
    const orderBefore = [...(await headerEntries(file))].sort((a, b) => parseInt(a[1].offset, 10) - parseInt(b[1].offset, 10)).map(([rel]) => rel)
    await alignAsarContent(file, 512)
    const orderAfter = [...(await headerEntries(file))].sort((a, b) => parseInt(a[1].offset, 10) - parseInt(b[1].offset, 10)).map(([rel]) => rel)
    expect(orderAfter).toEqual(orderBefore)
  })

  test("is idempotent", async ({ expect, tmpDir }) => {
    const tmp = await tmpDir.createTempDir()
    const file = await packTree(tmp, "idem", makeTree())
    const first = await alignAsarContent(file, 512)
    const once = await fs.readFile(file)
    const again = await alignAsarContent(file, 512)
    // the layout already carries its padding, so re-aligning adds nothing and rewrites the same bytes
    expect(again.paddingBytes).toBe(first.paddingBytes)
    expect(again.sizeAfter).toBe(again.sizeBefore)
    expect((await fs.readFile(file)).equals(once)).toBe(true)
  })

  // The property the differential updater needs: growing one file inside its slot leaves every other
  // file's offset untouched, so the header only changes in that file's own entry.
  test("a small in-place growth shifts no other offsets once aligned", async ({ expect, tmpDir }) => {
    const tmp = await tmpDir.createTempDir()
    const v1Files = makeTree()
    const v2Files = new Map(v1Files)
    const target = "lib/mod3.js"
    v2Files.set(target, Buffer.concat([v1Files.get(target)!, Buffer.from("// +7 b")]))

    const v1 = await packTree(tmp, "v1", v1Files)
    const v2 = await packTree(tmp, "v2", v2Files)
    const shifted = (a: Map<string, any>, b: Map<string, any>) => [...a].filter(([rel, e]) => e.offset !== b.get(rel).offset).map(([rel]) => rel)

    const shiftedUnaligned = shifted(await headerEntries(v1), await headerEntries(v2))
    expect(shiftedUnaligned.length).toBeGreaterThan(1)

    await alignAsarContent(v1, 512)
    await alignAsarContent(v2, 512)
    expect(shifted(await headerEntries(v1), await headerEntries(v2))).toEqual([])
  })

  test("leaves unpacked files and links alone", async ({ expect, tmpDir }) => {
    const tmp = await tmpDir.createTempDir()
    const files = makeTree()
    const src = path.join(tmp, "unpacked-src")
    await writeTree(src, files)
    await fs.symlink("mod0.js", path.join(src, "lib", "alias.js"))
    const file = path.join(tmp, "unpacked.asar")
    const { createPackageWithOptions } = await dynamicImport<any>("@electron/asar")
    await createPackageWithOptions(src, file, { unpack: "**/file4.txt" })
    const before = await headerEntries(file)
    expect(before.get("src/deep/er/file4.txt").unpacked).toBe(true)
    expect(before.get("lib/alias.js").link).toBeDefined()

    await alignAsarContent(file, 512)
    const after = await headerEntries(file)
    expect(after.get("src/deep/er/file4.txt")).toEqual(before.get("src/deep/er/file4.txt"))
    expect(after.get("lib/alias.js")).toEqual(before.get("lib/alias.js"))
    expect((await asar()).extractFile(file, path.join("lib", "mod0.js")).equals(files.get("lib/mod0.js")!)).toBe(true)
  })

  test("rejects a non-positive or fractional alignment with InvalidConfigurationError", async ({ expect, tmpDir }) => {
    const tmp = await tmpDir.createTempDir()
    const file = await packTree(tmp, "bad", makeTree())
    for (const bad of [0, -512, 1.5, NaN]) {
      await expect(alignAsarContent(file, bad)).rejects.toThrow(InvalidConfigurationError)
      await expect(alignAsarContent(file, bad)).rejects.toThrow("positive integer")
    }
    expect(() => validateContentAlignment("512")).toThrow(InvalidConfigurationError)
    expect(() => validateContentAlignment(512)).not.toThrow()
  })

  test("leaves the original untouched and removes the temp file when the rewrite fails", async ({ expect, tmpDir }) => {
    const tmp = await tmpDir.createTempDir()
    const file = await packTree(tmp, "broken", makeTree())
    const original = await fs.readFile(file)
    // truncate the content region: copying the last file must hit EOF and abort the rewrite
    await fs.truncate(file, original.length - 1)
    const truncated = await fs.readFile(file)

    await expect(alignAsarContent(file, 512)).rejects.toThrow("Unexpected end of asar content")
    expect((await fs.readFile(file)).equals(truncated), "input must not be replaced").toBe(true)
    await expect(fs.stat(`${file}.aligning`)).rejects.toThrow()
  })

  // The two controls the differential updater relies on: a byte inside a padding gap belongs to no file,
  // a byte inside a file's content is seen through the rewritten offset of exactly that file.
  test("padding gaps are outside every file; content is read through the new offsets", async ({ expect, tmpDir }) => {
    const tmp = await tmpDir.createTempDir()
    const files = makeTree()
    const file = await packTree(tmp, "flip", files)
    await alignAsarContent(file, 512)
    const { size: headerSize } = await readAsarHeader(file)
    const contentStart = 8 + headerSize
    const packed = [...(await headerEntries(file))]
      .filter(([, e]) => e.offset != null)
      .map(([rel, e]) => ({ rel, offset: parseInt(e.offset, 10), size: e.size as number }))
      .sort((a, b) => a.offset - b.offset)
    const withGap = packed.find((f, i) => i + 1 < packed.length && f.offset + f.size < packed[i + 1].offset)!
    expect(withGap, "expected a padding gap between two files").toBeDefined()

    const readAll = async () => {
      const reader = await readAsar(file)
      const out = new Map<string, Buffer>()
      for (const { rel } of packed) {
        out.set(rel, await reader.readFile(rel.split("/").join(path.sep)))
      }
      return out
    }
    const flip = async (position: number) => {
      const fd = await fs.open(file, "r+")
      try {
        const one = Buffer.alloc(1)
        await fd.read(one, 0, 1, position)
        one[0] ^= 0xff
        await fd.write(one, 0, 1, position)
      } finally {
        // a failed close must not replace an error thrown by the read/write above
        await fd.close().catch((e: unknown) => log.warn({ file, error: (e as Error).message }, "flip: closing failed"))
      }
    }

    const before = await readAll()
    await flip(contentStart + withGap.offset + withGap.size) // first padding byte after the file
    expect(await readAll()).toEqual(before)

    await flip(contentStart + withGap.offset + Math.floor(withGap.size / 2)) // inside the file
    const after = await readAll()
    expect(after.get(withGap.rel)!.equals(before.get(withGap.rel)!)).toBe(false)
    for (const [rel, content] of before) {
      if (rel !== withGap.rel) {
        expect(after.get(rel)!.equals(content), rel).toBe(true)
      }
    }
  })
})

// Through the packager: `asar.contentAlignment` is validated before anything is packed and applied to
// the app.asar electron-builder writes. (A launch of the aligned archive under the integrity fuses is
// covered by the AppImage case in updater/blackboxInstallTest.)
test.ifNotWindows("asar.contentAlignment aligns the packed app.asar", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
      config: { asar: { contentAlignment: 512 } },
    },
    {
      packed: async context => {
        const entries = await headerEntries(path.join(context.getResources(Platform.LINUX), "app.asar"))
        const packed = [...entries].filter(([, e]) => e.offset != null)
        expect(packed.length).toBeGreaterThan(0)
        for (const [rel, e] of packed) {
          expect(parseInt(e.offset, 10) % 512, `${rel} @ ${e.offset}`).toBe(0)
        }
      },
    }
  )
)

test.ifNotWindows("an invalid asar.contentAlignment fails before packing", ({ expect }) =>
  appThrows(
    expect,
    {
      targets: linuxDirTarget,
      config: { asar: { contentAlignment: -512 } },
    },
    {},
    error => {
      expect(error).toBeInstanceOf(InvalidConfigurationError)
      expect(error.message).toContain("asar.contentAlignment must be a positive integer")
    }
  )
)
