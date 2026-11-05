import { BlockMapDataHolder, CancellationToken } from "builder-util-runtime"
import { blockMapSizeLimit } from "electron-updater/src/differentialDownloader/DifferentialDownloader"
import { FileWithEmbeddedBlockMapDifferentialDownloader } from "electron-updater/src/differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader"
import fsExtra from "fs-extra"
import * as path from "path"
import { deflateRawSync } from "zlib"
import { afterEach, expect, test, vi } from "vitest"

class TestDownloader extends FileWithEmbeddedBlockMapDifferentialDownloader {
  remoteReads = 0

  constructor(
    oldFile: string,
    private readonly remoteMetadata: Buffer,
    info: Partial<BlockMapDataHolder> = {}
  ) {
    super({ size: remoteMetadata.length, blockMapSize: remoteMetadata.length - 4, sha512: "unused", ...info }, {} as any, {
      oldFile,
      newFile: `${oldFile}.new`,
      newUrl: new URL("https://example.com/update"),
      logger: { info() {}, warn() {}, error() {} },
      requestHeaders: null,
      cancellationToken: new CancellationToken(),
    })
  }

  protected override async readRemoteBytes(): Promise<Buffer> {
    this.remoteReads++
    return this.remoteMetadata
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

const MiB = 1024 * 1024
// a valid embedded blockmap and its 4-byte trailer, as the end of a remote file
const REMOTE_METADATA = Buffer.concat([deflateRawSync(JSON.stringify({ version: "2", files: [] })), Buffer.alloc(4)])

test("closes an old file once when its embedded blockmap is invalid", async ({ tmpDir }) => {
  const oldFile = path.join(await tmpDir.getTempDir({ prefix: "embedded-blockmap-test" }), "old.bin")
  const invalidBlockMap = Buffer.alloc(5)
  invalidBlockMap.writeUInt32BE(1, 1)
  await fsExtra.outputFile(oldFile, invalidBlockMap)

  const compressedBlockMap = deflateRawSync(JSON.stringify({ version: "2", files: [] }))
  const remoteMetadata = Buffer.concat([compressedBlockMap, Buffer.alloc(4)])
  const error = await new TestDownloader(oldFile, remoteMetadata)
    .download()
    .then(() => null)
    .catch(error => error)
  expect(error).toBeInstanceOf(Error)
  expect(error.code).not.toBe("EBADF")
})

test("rejects an embedded blockmap that inflates past the size limit for the file", async ({ tmpDir }) => {
  // still a valid map: a few KB of deflate that inflates just past the 8 MiB limit of a small file
  const inflating = deflateRawSync(Buffer.concat([Buffer.from(JSON.stringify({ version: "2", files: [] })), Buffer.alloc(8 * MiB, " ")]))
  const oldFile = path.join(await tmpDir.getTempDir({ prefix: "embedded-blockmap-test" }), "old.bin")
  const downloader = new TestDownloader(oldFile, Buffer.concat([inflating, Buffer.alloc(4)]))
  await expect(downloader.download()).rejects.toMatchObject({ code: "ERR_BUFFER_TOO_LARGE" })
})

test("rejects an old file whose embedded blockmap inflates past the size limit for it", async ({ tmpDir }) => {
  // a small old file (limit: the 8 MiB floor) whose trailer declares a few KB of deflate that inflates just past it
  const inflating = deflateRawSync(Buffer.concat([Buffer.from(JSON.stringify({ version: "2", files: [] })), Buffer.alloc(8 * MiB, " ")]))
  const trailer = Buffer.alloc(4)
  trailer.writeUInt32BE(inflating.length)
  const oldFile = path.join(await tmpDir.getTempDir({ prefix: "embedded-blockmap-test" }), "old.bin")
  await fsExtra.outputFile(oldFile, Buffer.concat([inflating, trailer]))

  await expect(new TestDownloader(oldFile, REMOTE_METADATA).download()).rejects.toMatchObject({ code: "ERR_BUFFER_TOO_LARGE" })
})

test.for([
  { name: "zero", info: { blockMapSize: 0 } },
  { name: "negative", info: { blockMapSize: -1 } },
  { name: "not an integer", info: { blockMapSize: 1.5 } },
  { name: "missing", info: { blockMapSize: undefined } },
  { name: "given for a file of unknown size", info: { size: undefined } },
  { name: "larger than the file", info: { blockMapSize: REMOTE_METADATA.length - 3 } },
  { name: "past the size limit for the file", info: { size: 100 * MiB, blockMapSize: 9 * MiB } },
])("rejects a blockMapSize that is $name before requesting it", async ({ info }) => {
  const downloader = new TestDownloader("unused", REMOTE_METADATA, info)
  await expect(downloader.download()).rejects.toThrow(/blockMapSize/)
  expect(downloader.remoteReads).toBe(0)
})

test("rejects an old file whose embedded blockmap length is larger than the file, without allocating it", async ({ tmpDir }) => {
  const oldFile = path.join(await tmpDir.getTempDir({ prefix: "embedded-blockmap-test" }), "old.bin")
  const trailer = Buffer.alloc(5)
  trailer.writeUInt32BE(0xffffffff, 1)
  await fsExtra.outputFile(oldFile, trailer)
  const allocUnsafe = vi.spyOn(Buffer, "allocUnsafe")

  await expect(new TestDownloader(oldFile, REMOTE_METADATA).download()).rejects.toThrow(/declares a 4294967295-byte block map/)
  expect(allocUnsafe).not.toHaveBeenCalledWith(0xffffffff)
})

test("rejects an old file whose embedded blockmap fits in the file but is past the size limit for it, without allocating it", async ({ tmpDir }) => {
  const oldFile = path.join(await tmpDir.getTempDir({ prefix: "embedded-blockmap-test" }), "old.bin")
  // an 8 MiB + 8 byte file (limit: the 8 MiB floor) whose trailer declares an 8 MiB + 1 byte map, which the file holds
  const fileSize = 8 * MiB + 8
  const blockMapSize = 8 * MiB + 1
  const trailer = Buffer.alloc(4)
  trailer.writeUInt32BE(blockMapSize)
  await fsExtra.outputFile(oldFile, Buffer.alloc(0))
  await fsExtra.truncate(oldFile, fileSize - trailer.length)
  await fsExtra.appendFile(oldFile, trailer)
  const allocUnsafe = vi.spyOn(Buffer, "allocUnsafe")

  await expect(new TestDownloader(oldFile, REMOTE_METADATA).download()).rejects.toThrow(`declares a ${blockMapSize}-byte block map`)
  expect(allocUnsafe).not.toHaveBeenCalledWith(blockMapSize)
})

test.for([
  { name: "the 8 MiB floor for a small file", fileSize: 1, limit: 8 * MiB },
  { name: "the 8 MiB floor up to a 128 MiB file", fileSize: 128 * MiB, limit: 8 * MiB },
  { name: "size / 16 just above the floor", fileSize: 128 * MiB + 16, limit: 8 * MiB + 1 },
  { name: "size / 16 (rounded up) between the floor and the cap", fileSize: 512 * MiB + 1, limit: 32 * MiB + 1 },
  { name: "size / 16 just below the cap", fileSize: 1024 * MiB - 16, limit: 64 * MiB - 1 },
  { name: "the 64 MiB cap for a 1 GiB file", fileSize: 1024 * MiB, limit: 64 * MiB },
  { name: "the 64 MiB cap for a larger file", fileSize: 4096 * MiB, limit: 64 * MiB },
  { name: "the 64 MiB cap for an unknown size (undefined)", fileSize: undefined, limit: 64 * MiB },
  { name: "the 64 MiB cap for an unknown size (null)", fileSize: null, limit: 64 * MiB },
  { name: "the 64 MiB cap for NaN", fileSize: NaN, limit: 64 * MiB },
  { name: "the 64 MiB cap for zero", fileSize: 0, limit: 64 * MiB },
  { name: "the 64 MiB cap for a negative size", fileSize: -1, limit: 64 * MiB },
])("blockMapSizeLimit is $name", ({ fileSize, limit }) => {
  expect(blockMapSizeLimit(fileSize)).toBe(limit)
})
