import { createHash } from "crypto"
import { fstat, open, read } from "fs-extra-p"

// main exe not changed if unsigned, but if signed - each sign noticeably changes the file
export async function computeBlocks(inputFile: string): Promise<Array<string>> {
  const fd = await open(inputFile, "r")

  const chunkSize = 64 * 1024
  const buffer = Buffer.allocUnsafe(chunkSize)
  const stat = await fstat(fd)
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