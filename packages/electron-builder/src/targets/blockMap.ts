import { path7za } from "7zip-bin"
import BluebirdPromise from "bluebird-lst"
import { exec, hashFile, spawn } from "builder-util"
import { createHash } from "crypto"
import { BLOCK_MAP_FILE_NAME, BlockMap } from "electron-builder-http/out/differentialUpdate/blockMapApi"
import { openZip } from "electron-builder-http/out/differentialUpdate/localZip"
import { PackageFileInfo } from "electron-builder-http/out/updateInfo"
import { outputFile, read, stat } from "fs-extra-p"
import { safeDump } from "js-yaml"
import * as path from "path"
import { PlatformPackager } from "../platformPackager"
import { compute7zCompressArgs } from "./archive"

/*
Approach like AppX block map, but with one difference - block not compressed individually, instead, the whole file is compressed using LZMA compression.
See (Package File in the developer readme) about compression. So, delta will be not ideal (because compressed data can change not only actually changed block in the file, but others,
and we don't set even dict size and default 64M is used), but full package size will be still relative small and will save initial download time/costs.
 */

// reduce dict size to avoid large block invalidation on change
export async function createDifferentialPackage(archiveFile: string, packager: PlatformPackager<any>): Promise<PackageFileInfo> {
  // Deflate to be able to decompress block map on the fly without 7za
  const args = compute7zCompressArgs("normal", "zip", {method: "Deflate"})
  args.push(archiveFile)

  // compute block map using compressed file data

  const blockMap = await computeBlockMap(archiveFile, "lzma", (process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL || "9") as any)
  // https://superuser.com/a/966241, use leading ~ symbol to add file to the end (and avoid file rewrite)
  const blockMapFile = await packager.info.tempDirManager.getTempFile({prefix: "~", suffix: "blockMap.yml"})
  await outputFile(blockMapFile, safeDump(blockMap))
  await spawn(path7za, args.concat(blockMapFile), {
    cwd: path.dirname(archiveFile),
  })
  // rename to final name (file order will be not changed and preserved as is)
  await exec(path7za, ["rn", archiveFile, path.basename(blockMapFile), BLOCK_MAP_FILE_NAME])
  return await createPackageFileInfo(archiveFile)
}

export async function createPackageFileInfo(file: string): Promise<PackageFileInfo> {
  return {
    file,
    size: (await stat(file)).size,
    sha512: await hashFile(file),
  }
}

async function computeBlocks(fd: number, start: number, end: number): Promise<Array<string>> {
  const chunkSize = 64 * 1024
  const buffer = Buffer.allocUnsafe(chunkSize)
  const blocks = []

  for (let offset = start; offset < end; offset += chunkSize) {
    const actualChunkSize = Math.min(end - offset, chunkSize)
    await read(fd, buffer, 0, actualChunkSize, offset)

    const hash = createHash("md5")
    hash.update(actualChunkSize === chunkSize ? buffer : buffer.slice(0, actualChunkSize))
    blocks.push(hash.digest("base64"))
  }

  return blocks
}

export async function computeBlockMap(archiveFile: string, compressionMethod: "lzma", compressionLevel: 9 | 1): Promise<BlockMap> {
  const zip = await openZip(archiveFile)
  try {
    const entries = await zip.readEntries()
    const files = await BluebirdPromise.map(entries, async entry => {
      const blocks = await computeBlocks(zip.fd, entry.dataStart, entry.dataStart + entry.compressedSize)
      return {
        name: (entry.fileName as string).replace(/\\/g, "/"),
        size: entry.compressedSize,
        blocks,
      }
    }, {concurrency: 8})
    return {
      blockSize: 64,
      hashMethod: "md5",
      compressionMethod,
      compressionLevel,
      files,
    }
  }
  finally {
    await zip.close()
  }
}