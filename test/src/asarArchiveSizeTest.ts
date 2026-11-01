import { alignAsarContent } from "app-builder-lib/src/asar/asarAlign"
import { checkFileInArchive } from "app-builder-lib/src/asar/asarFileChecker"
import { dynamicImport } from "app-builder-lib/src/util/dynamicImport"
import * as fs from "fs/promises"
import * as path from "path"

type Asar = { createPackage(src: string, dest: string): Promise<void> }
const asar = () => dynamicImport<Asar>("@electron/asar")

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

test("an archive shorter than its header describes fails the sanity check", async ({ expect, tmpDir }) => {
  const file = await packArchive(await tmpDir.createTempDir())
  const { size } = await fs.stat(file)
  await fs.truncate(file, size - 10)
  await expect(checkFileInArchive(file, "package.json", "Application")).rejects.toThrow(sizeMismatch)
})

test("alignAsarContent refuses an archive longer than its header describes and leaves it untouched", async ({ expect, tmpDir }) => {
  const file = await packArchive(await tmpDir.createTempDir())
  await fs.appendFile(file, Buffer.alloc(2482))
  const before = await fs.readFile(file)
  await expect(alignAsarContent(file, 512)).rejects.toThrow("refusing to align it")
  expect((await fs.readFile(file)).equals(before), "input must not be replaced").toBe(true)
})

test("an archive whose packed content changed at the same size fails the sanity check", async ({ expect, tmpDir }) => {
  const file = await packArchive(await tmpDir.createTempDir())
  const bytes = await fs.readFile(file)
  // flip one byte of index.js in place: the archive keeps its size, so only the content hash can catch it
  const at = bytes.indexOf("module.exports")
  expect(at, "index.js content is in the archive").toBeGreaterThan(0)
  bytes[at] = "n".charCodeAt(0)
  await fs.writeFile(file, bytes)
  await expect(checkFileInArchive(file, "package.json", "Application")).rejects.toThrow(/does not match the SHA256 its header records/)
})

test("an aligned archive keeps its content hashes and passes the sanity check", async ({ expect, tmpDir }) => {
  const file = await packArchive(await tmpDir.createTempDir())
  await alignAsarContent(file, 512)
  await expect(checkFileInArchive(file, "package.json", "Application")).resolves.toBeDefined()
})
