import { path7za } from "7zip-bin"
import { exec, spawn } from "builder-util"
import { outputFile } from "fs-extra-p"
import { safeDump } from "js-yaml"
import * as path from "path"
import { PlatformPackager } from "../../platformPackager"
import { ArchiveOptions, compute7zCompressArgs } from "../archive"
import { computeBlockMap } from "../blockMap"

/*
Approach like AppX block map, but with one difference - block not compressed individually, instead, the whole file is compressed using LZMA compression.
See (Package File in the developer readme) about compression. So, delta will be not ideal (because compressed data can change not only actually changed block in the file, but others,
and we don't set even dict size and default 64M is used), but full package size will be still relative small and will save initial download time/costs.
 */

// reduce dict size to avoid large block invalidation on change
export async function createDifferentialPackage(archiveFile: string, archiveOptions: ArchiveOptions, packager: PlatformPackager<any>) {
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
  await exec(path7za, ["rn", archiveFile, path.basename(blockMapFile), "blockMap.yml"])
}