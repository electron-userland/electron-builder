import { CancellationToken } from "builder-util-runtime"
import { FileWithEmbeddedBlockMapDifferentialDownloader } from "electron-updater/src/differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader"
import fsExtra from "fs-extra"
import { TmpDir } from "temp-file"
import { deflateRawSync } from "zlib"
import { expect, test } from "vitest"

class TestDownloader extends FileWithEmbeddedBlockMapDifferentialDownloader {
  constructor(
    oldFile: string,
    private readonly remoteMetadata: Buffer
  ) {
    super({ size: remoteMetadata.length, blockMapSize: remoteMetadata.length - 4, sha512: "unused" }, {} as any, {
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
