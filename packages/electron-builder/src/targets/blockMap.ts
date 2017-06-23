import { createHash } from "crypto"
import { walk } from "electron-builder-util/out/fs"
import { open, read, Stats } from "fs-extra-p"
import { safeDump } from "js-yaml"
import * as path from "path"

async function computeBlocks(inputFile: string, stat: Stats): Promise<Array<string>> {
  const fd = await open(inputFile, "r")

  const chunkSize = 64 * 1024
  const buffer = Buffer.allocUnsafe(chunkSize)
  const size = stat.size
  const blocks = []

  for (let offset = 0; offset < size; offset += chunkSize) {
    const actualChunkSize = Math.min(size - offset, chunkSize)
    await read(fd, buffer, 0, actualChunkSize, offset)

    const hash = createHash("sha256")
    hash.update(actualChunkSize === chunkSize ? buffer : buffer.slice(0, actualChunkSize))
    blocks.push(hash.digest("base64"))
  }

  return blocks
}

export async function computeBlockMap(appOutDir: string): Promise<string> {
  const files = new Map<string, Stats>()
  await walk(appOutDir, (it: string) => !it.endsWith(`${path.sep}.DS_Store`), (file, fileStat) => {
    if (fileStat.isFile()) {
      files.set(file, fileStat)
    }
  })

  const info: Array<any> = []
  for (const [file, stat] of files.entries()) {
    const blocks = await computeBlocks(file, stat)
    info.push({name: file.substring(appOutDir.length + 1).replace(/\\/g, "/"), blocks: blocks})
  }
  return safeDump(info)
}