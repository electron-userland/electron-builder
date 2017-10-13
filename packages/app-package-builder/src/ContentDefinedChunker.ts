import { createHash } from "crypto"
import { read } from "fs-extra-p"
import { FileChunks } from "builder-util-runtime/out/blockMapApi"
import { Rabin } from "rabin-bindings"

export class ContentDefinedChunker {
  async computeChunks(fd: number, start: number, end: number, name: string): Promise<FileChunks> {
    const fileSize = end - start
    const buffer = Buffer.allocUnsafe(Math.min(4 * 1024 * 1024, fileSize))

    const rabin = Rabin()
    const avgBits = 12
    const min = 8 * 1024
    // see note in the nsis.ts about archive dict size
    const max = 32 * 1024
    rabin.configure(avgBits, min, max)

    const checksums: Array<string> = []
    const allSizes: Array<number> = []

    let tailBufferData: Buffer | null = null
    let readOffset = start
    while (true) {
      const actualBufferSize = Math.min(end - readOffset, buffer.length)
      await read(fd, buffer, 0, actualBufferSize, readOffset)

      const dataBuffer: Buffer = buffer.length === actualBufferSize ? buffer : buffer.slice(0, actualBufferSize)
      const sizes: Array<number> = []
      rabin.fingerprint([dataBuffer], sizes)

      let chunkStart = 0
      for (const size of sizes) {
        allSizes.push(size)
        let chunkEnd = chunkStart + size

        const hash = createHash("sha256")
        if (tailBufferData !== null) {
          hash.update(tailBufferData)
          // if there is the tail data (already processed by rabin data), first size includes it
          chunkEnd -= tailBufferData.length
          tailBufferData = null
        }
        hash.update(dataBuffer.slice(chunkStart, chunkEnd))
        checksums.push(hash.digest("base64"))
        chunkStart = chunkEnd
      }

      const tailSize = actualBufferSize - chunkStart
      if (tailSize !== 0) {
        if (tailBufferData !== null) {
          throw new Error(`Internal error (${name}): tailBufferData must be null`)
        }
        tailBufferData = dataBuffer.slice(chunkStart, chunkStart + tailSize)
      }

      readOffset += actualBufferSize
      if (readOffset >= end) {
        if (tailBufferData !== null) {
          allSizes.push(tailSize)
          checksums.push(computeChecksum(tailBufferData))
        }
        break
      }
      else if (tailBufferData !== null) {
        // copy data
        tailBufferData = Buffer.from(tailBufferData)
      }
    }

    const totalSize = allSizes.reduce((accumulator, currentValue) => accumulator + currentValue)
    if (totalSize !== fileSize) {
      throw new Error(`Internal error (${name}): size mismatch: expected: ${fileSize}, got: ${totalSize}`)
    }

    return {checksums, sizes: allSizes}
  }
}

function computeChecksum(chunk: Buffer) {
  // node-base91 doesn't make a lot of sense - 29KB vs 30KB Because for base64 string value in the yml never escaped, but node-base91 often escaped (single quotes) and it adds extra 2 symbols.
  return createHash("sha256")
    .update(chunk)
    .digest("base64")
}
