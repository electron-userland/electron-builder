import { CancellationToken } from "builder-util-runtime"
import { FileWithEmbeddedBlockMapDifferentialDownloader } from "electron-updater/src/differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader"
import fsExtra from "fs-extra"
import { TmpDir } from "temp-file"
import { deflateRawSync } from "zlib"
import { expect, test } from "vitest"

class TestDownloader extends FileWithEmbeddedBlockMapDifferentialDownloader {
  constructor(
    oldFile: string,
    private readonly remoteMetadata: Buffer,
    info: { size?: number; blockMapSize?: number } = {}
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
    return this.remoteMetadata
  }
}

test("closes an old file once when its embedded blockmap is invalid", async () => {
  const tmpDir = new TmpDir("embedded-blockmap-test")
  try {
    const oldFile = await tmpDir.getTempFile({ suffix: ".bin" })
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
  } finally {
    await tmpDir.cleanup()
  }
})

async function downloadError(oldFileContent: Buffer, remoteMetadata: Buffer, info: { size?: number; blockMapSize?: number } = {}): Promise<any> {
  const tmpDir = new TmpDir("embedded-blockmap-test")
  try {
    const oldFile = await tmpDir.getTempFile({ suffix: ".bin" })
    await fsExtra.outputFile(oldFile, oldFileContent)
    return await new TestDownloader(oldFile, remoteMetadata, info)
      .download()
      .then(() => null)
      .catch(error => error)
  } finally {
    await tmpDir.cleanup()
  }
}

/** `blockMap` followed by its 4-byte size, as appended to the file */
function embedded(blockMap: Buffer): Buffer {
  const size = Buffer.alloc(4)
  size.writeUInt32BE(blockMap.length, 0)
  return Buffer.concat([blockMap, size])
}

test("rejects an embedded block map of size 0, or one that does not fit the file", async () => {
  const metadata = embedded(deflateRawSync(JSON.stringify({ version: "2", files: [] })))
  for (const info of [{ blockMapSize: 0 }, { blockMapSize: metadata.length }, { size: 3 }]) {
    const error = await downloadError(metadata, metadata, info)
    expect(error?.code, JSON.stringify(info)).toBe("ERR_UPDATER_INVALID_BLOCKMAP")
  }
})

test("rejects the size an old file declares for its embedded block map before allocating it", async () => {
  const metadata = embedded(deflateRawSync(JSON.stringify({ version: "2", files: [] })))
  // the last 4 bytes of the old file claim a 4 GB block map
  const oldFile = Buffer.concat([Buffer.alloc(100), Buffer.from([0xff, 0xff, 0xff, 0xff])])
  const error = await downloadError(oldFile, metadata)
  expect(error?.code).toBe("ERR_UPDATER_INVALID_BLOCKMAP")
  expect(error?.message).toContain("Invalid embedded block map size 4294967295")
})

test("does not inflate an embedded block map past the limit for the file's size", async () => {
  // ~2 MiB of JSON for a file of a few KiB, whose limit is ~1 MiB
  const bomb = embedded(deflateRawSync(`{"version":"2","files":[${" ".repeat(2 * 1024 * 1024)}]}`))
  const error = await downloadError(bomb, bomb)
  expect(error?.code).toBe("ERR_BUFFER_TOO_LARGE")
})
