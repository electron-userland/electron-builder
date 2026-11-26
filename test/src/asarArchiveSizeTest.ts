import { readAsarHeader } from "app-builder-lib/src/asar/asar"
import { alignAsarContent } from "app-builder-lib/src/asar/asarAlign"
import { checkFilesInArchive } from "app-builder-lib/src/asar/asarFileChecker"
import { dynamicImport } from "app-builder-lib/src/util/dynamicImport"
import * as fs from "fs/promises"
import { createRequire } from "module"
import * as path from "path"

type Asar = { createPackage(src: string, dest: string): Promise<void> }
const asar = () => dynamicImport<Asar>("@electron/asar")
// the same chromium-pickle-js asar.ts and asarAlign.ts load, resolved from app-builder-lib
const chromiumPickleJs = createRequire(new URL("../../packages/app-builder-lib/package.json", import.meta.url))("chromium-pickle-js")

// Packs a small app into `<tmp>/app.asar`.
async function packArchive(tmp: string, indexLines = 200): Promise<string> {
  const src = path.join(tmp, "src")
  await fs.mkdir(src, { recursive: true })
  await fs.writeFile(path.join(src, "package.json"), JSON.stringify({ name: "size-check", main: "index.js" }))
  await fs.writeFile(path.join(src, "index.js"), "module.exports = 1\n".repeat(indexLines))
  const out = path.join(tmp, "app.asar")
  await (await asar()).createPackage(src, out)
  return out
}

const sizeMismatch = /is corrupted: the header describes an archive of \d+ bytes, but it is \d+ bytes/
const cutOff = /is corrupted: its content ends at byte \d+, but the archive is \d+ bytes/

test("an archive whose size matches its header passes the sanity check", async ({ expect, tmpDir }) => {
  const file = await packArchive(await tmpDir.getTempDir({ prefix: "asar-size" }))
  await expect(checkFilesInArchive(file, [{ file: "package.json", messagePrefix: "Application" }])).resolves.toBeUndefined()
})

test("an archive longer than its header describes fails the sanity check", async ({ expect, tmpDir }) => {
  const file = await packArchive(await tmpDir.getTempDir({ prefix: "asar-size" }))
  await fs.appendFile(file, Buffer.alloc(2482))
  await expect(checkFilesInArchive(file, [{ file: "package.json", messagePrefix: "Application" }])).rejects.toThrow(sizeMismatch)
})

test("an archive cut short inside its last file fails the sanity check", async ({ expect, tmpDir }) => {
  const file = await packArchive(await tmpDir.getTempDir({ prefix: "asar-size" }))
  const { size } = await fs.stat(file)
  await fs.truncate(file, size - 10)
  // the bytes before the cut extend past the last entry that fits in the file, so they count as trailing bytes
  await expect(checkFilesInArchive(file, [{ file: "package.json", messagePrefix: "Application" }])).rejects.toThrow(sizeMismatch)
})

test("an archive cut right after its header fails the sanity check", async ({ expect, tmpDir }) => {
  const file = await packArchive(await tmpDir.getTempDir({ prefix: "asar-size" }))
  const { size: headerSize } = await readAsarHeader(file)
  // only the 8-byte size prefix and the header are left: no file has content, and no bytes trail the header
  await fs.truncate(file, 8 + headerSize)
  await expect(checkFilesInArchive(file, [{ file: "package.json", messagePrefix: "Application" }])).rejects.toThrow(cutOff)
})

// Cuts the archive at the offset of its last packed file, so every earlier file stays whole. Returns the files kept and the file cut off.
async function cutAtLastFile(file: string): Promise<{ kept: Array<string>; cut: string }> {
  const { header, size: headerSize } = await readAsarHeader(file)
  const { files } = JSON.parse(header)
  const names = Object.keys(files).sort((a, b) => Number(files[a].offset) - Number(files[b].offset))
  const cut = names[names.length - 1]
  await fs.truncate(file, 8 + headerSize + Number(files[cut].offset))
  return { kept: names.slice(0, -1), cut }
}

test("an archive cut at a file boundary fails the sanity check for the file that was cut off", async ({ expect, tmpDir }) => {
  const file = await packArchive(await tmpDir.getTempDir({ prefix: "asar-size" }))
  const { kept, cut } = await cutAtLastFile(file)
  expect(kept.length).toBeGreaterThan(0)
  await expect(checkFilesInArchive(file, [{ file: cut, messagePrefix: "Application" }])).rejects.toThrow(cutOff)
})

test("an archive cut at a file boundary passes when the file cut off is not one the check names", async ({ expect, tmpDir }) => {
  const file = await packArchive(await tmpDir.getTempDir({ prefix: "asar-size" }))
  const { kept } = await cutAtLastFile(file)
  // the header alone cannot tell a cut-off file it does not check from a bloat entry
  await expect(
    checkFilesInArchive(
      file,
      kept.map(it => ({ file: it, messagePrefix: "Application" }))
    )
  ).resolves.toBeUndefined()
})

test("every file the check names must fit in the archive, not only the first", async ({ expect, tmpDir }) => {
  const file = await packArchive(await tmpDir.getTempDir({ prefix: "asar-size" }))
  const { kept, cut } = await cutAtLastFile(file)
  const check = checkFilesInArchive(
    file,
    [...kept, cut].map(it => ({ file: it, messagePrefix: "Application" }))
  )
  await expect(check).rejects.toThrow(cutOff)
  await expect(check).rejects.toThrow(`"${cut}"`)
})

// `statFile` caches an archive's header by path (https://github.com/electron/asar/blob/fde819a/src/disk.ts#L357-L365)
test("an archive rebuilt at the same path in one process is checked against its new header", async ({ expect, tmpDir }) => {
  const tmp = await tmpDir.getTempDir({ prefix: "asar-size" })
  const file = await packArchive(tmp, 2000)
  await expect(checkFilesInArchive(file, [{ file: "package.json", messagePrefix: "Application" }])).resolves.toBeUndefined()
  // a much smaller index.js: the entries of the first archive point past the end of the second
  await fs.rm(file)
  await packArchive(tmp, 1)
  await expect(checkFilesInArchive(file, [{ file: "package.json", messagePrefix: "Application" }])).resolves.toBeUndefined()
})

// asarmor's default afterPack patch (createBloatPatch) adds about 100 header entries whose offset sits near MAX_SAFE_INTEGER and whose size is 1 GiB.
// The archive content stays as it was packed; only the header grows, and its entries point far past the end of the file.
async function writeBloatedArchive(file: string, bloated: string): Promise<void> {
  const original = await fs.readFile(file)
  const { header, size: headerSize } = await readAsarHeader(file)
  const parsed = JSON.parse(header)
  for (let i = 0; i < 100; i++) {
    parsed.files[`bloat${i}`] = { offset: String(Number.MAX_SAFE_INTEGER - 2 ** 30), size: 2 ** 30 }
  }
  const headerPickle = chromiumPickleJs.createEmpty()
  headerPickle.writeString(JSON.stringify(parsed))
  const headerBuf: Buffer = headerPickle.toBuffer()
  const sizePickle = chromiumPickleJs.createEmpty()
  sizePickle.writeUInt32(headerBuf.length)
  await fs.writeFile(bloated, Buffer.concat([sizePickle.toBuffer(), headerBuf, original.subarray(8 + headerSize)]))
}

test("a bloat-style header whose entries point past the end of the archive passes the sanity check", async ({ expect, tmpDir }) => {
  const tmp = await tmpDir.getTempDir({ prefix: "asar-size" })
  const file = await packArchive(tmp)
  const bloated = path.join(tmp, "bloated.asar")
  await writeBloatedArchive(file, bloated)
  await expect(checkFilesInArchive(bloated, [{ file: "package.json", messagePrefix: "Application" }])).resolves.toBeUndefined()
})

test("a bloat-style header with trailing bytes after its last real entry fails the sanity check", async ({ expect, tmpDir }) => {
  const tmp = await tmpDir.getTempDir({ prefix: "asar-size" })
  const file = await packArchive(tmp)
  const bloated = path.join(tmp, "bloated.asar")
  await writeBloatedArchive(file, bloated)
  await fs.appendFile(bloated, Buffer.alloc(10))
  await expect(checkFilesInArchive(bloated, [{ file: "package.json", messagePrefix: "Application" }])).rejects.toThrow(sizeMismatch)
})

test("alignAsarContent refuses an archive longer than its header describes and leaves it untouched", async ({ expect, tmpDir }) => {
  const file = await packArchive(await tmpDir.getTempDir({ prefix: "asar-size" }))
  await fs.appendFile(file, Buffer.alloc(2482))
  const before = await fs.readFile(file)
  await expect(alignAsarContent(file, 512)).rejects.toThrow("refusing to re-lay it out")
  expect((await fs.readFile(file)).equals(before), "input must not be replaced").toBe(true)
})
