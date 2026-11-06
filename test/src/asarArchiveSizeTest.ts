import { readAsarHeader } from "app-builder-lib/src/asar/asar"
import { alignAsarContent } from "app-builder-lib/src/asar/asarAlign"
import { checkFileInArchive } from "app-builder-lib/src/asar/asarFileChecker"
import { dynamicImport } from "app-builder-lib/src/util/dynamicImport"
import { log } from "builder-util"
import * as fs from "fs/promises"
import { createRequire } from "module"
import * as path from "path"
import { vi } from "vitest"

type Asar = { createPackage(src: string, dest: string): Promise<void> }
const asar = () => dynamicImport<Asar>("@electron/asar")
// the same chromium-pickle-js asar.ts and asarAlign.ts load, resolved from app-builder-lib
const chromiumPickleJs = createRequire(new URL("../../packages/app-builder-lib/package.json", import.meta.url))("chromium-pickle-js")

// Packs a small app into `<tmp>/app.asar`. Each test gets its own temp dir: `readFilesystemSync` caches an archive's header by path (https://github.com/electron/asar/blob/fde819a/src/disk.ts#L357-L365).
async function packArchive(tmp: string): Promise<string> {
  const src = path.join(tmp, "src")
  await fs.mkdir(src, { recursive: true })
  await fs.writeFile(path.join(src, "package.json"), JSON.stringify({ name: "size-check", main: "index.js" }))
  await fs.writeFile(path.join(src, "index.js"), "module.exports = 1\n".repeat(200))
  const out = path.join(tmp, "app.asar")
  await (await asar()).createPackage(src, out)
  return out
}

const sizeMismatch = /is corrupted: the header describes an archive of \d+ bytes, but it is \d+ bytes/

test("an archive whose size matches its header passes the sanity check", async ({ expect, tmpDir }) => {
  const file = await packArchive(await tmpDir.createTempDir())
  await expect(checkFileInArchive(file, "package.json", "Application")).resolves.toBeDefined()
})

test("an archive longer than its header describes fails the sanity check", async ({ expect, tmpDir }) => {
  const file = await packArchive(await tmpDir.createTempDir())
  await fs.appendFile(file, Buffer.alloc(2482))
  await expect(checkFileInArchive(file, "package.json", "Application")).rejects.toThrow(sizeMismatch)
})

test("an archive cut short inside its last file fails the sanity check", async ({ expect, tmpDir }) => {
  const file = await packArchive(await tmpDir.createTempDir())
  const { size } = await fs.stat(file)
  await fs.truncate(file, size - 10)
  // the bytes before the cut extend past the last entry that fits in the file, so they count as trailing bytes
  await expect(checkFileInArchive(file, "package.json", "Application")).rejects.toThrow(sizeMismatch)
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

test("a bloat-style header whose entries point past the end of the archive warns and does not throw", async ({ expect, tmpDir }) => {
  const tmp = await tmpDir.createTempDir()
  const file = await packArchive(tmp)
  const bloated = path.join(tmp, "bloated.asar")
  await writeBloatedArchive(file, bloated)
  const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
  try {
    await expect(checkFileInArchive(bloated, "package.json", "Application")).resolves.toBeDefined()
    // read the calls before restoring: mockRestore clears them
    expect(warn).toHaveBeenCalledTimes(1)
  } finally {
    warn.mockRestore()
  }
})

test("a bloat-style header with trailing bytes after its last real entry fails the sanity check", async ({ expect, tmpDir }) => {
  const tmp = await tmpDir.createTempDir()
  const file = await packArchive(tmp)
  const bloated = path.join(tmp, "bloated.asar")
  await writeBloatedArchive(file, bloated)
  await fs.appendFile(bloated, Buffer.alloc(10))
  await expect(checkFileInArchive(bloated, "package.json", "Application")).rejects.toThrow(sizeMismatch)
})

test("alignAsarContent refuses an archive longer than its header describes and leaves it untouched", async ({ expect, tmpDir }) => {
  const file = await packArchive(await tmpDir.createTempDir())
  await fs.appendFile(file, Buffer.alloc(2482))
  const before = await fs.readFile(file)
  await expect(alignAsarContent(file, 512)).rejects.toThrow("refusing to align it")
  expect((await fs.readFile(file)).equals(before), "input must not be replaced").toBe(true)
})
