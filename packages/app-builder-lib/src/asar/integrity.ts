import BluebirdPromise from "bluebird-lst"
import { createHash } from "crypto"
import { createReadStream } from "fs"
import { readdir } from "fs/promises"
import * as path from "path"
import { readAsarHeader, NodeIntegrity } from "./asar"

export interface AsarIntegrityOptions {
  readonly resourcesPath: string
  readonly resourcesRelativePath: string
}

export interface HeaderHash {
  algorithm: "SHA256"
  hash: string
}

export interface AsarIntegrity {
  [key: string]: HeaderHash
}

export async function computeData({ resourcesPath, resourcesRelativePath }: AsarIntegrityOptions): Promise<AsarIntegrity> {
  // sort to produce constant result
  const names = (await readdir(resourcesPath)).filter(it => it.endsWith(".asar")).sort()
  const checksums = await BluebirdPromise.map(names, it => hashHeader(path.join(resourcesPath, it)))

  const result: AsarIntegrity = {}
  for (let i = 0; i < names.length; i++) {
    result[path.join(resourcesRelativePath, names[i])] = checksums[i]
  }
  return result
}

async function hashHeader(file: string): Promise<HeaderHash> {
  const hash = createHash("sha256")
  const { header } = await readAsarHeader(file)
  hash.update(header)
  return {
    algorithm: "SHA256",
    hash: hash.digest("hex"),
  }
}

export function hashFile(file: string, blockSize = 4 * 1024 * 1024): Promise<NodeIntegrity> {
  return new Promise<NodeIntegrity>((resolve, reject) => {
    const hash = createHash("sha256")

    const blocks = new Array<string>()

    let blockBytes = 0
    let blockHash = createHash("sha256")

    function updateBlockHash(chunk: Buffer) {
      let off = 0
      while (off < chunk.length) {
        const toHash = Math.min(blockSize - blockBytes, chunk.length - off)
        blockHash.update(chunk.slice(off, off + toHash))
        off += toHash
        blockBytes += toHash

        if (blockBytes === blockSize) {
          blocks.push(blockHash.digest("hex"))
          blockHash = createHash("sha256")
          blockBytes = 0
        }
      }
    }

    createReadStream(file)
      .on("data", it => {
        // Note that `it` is a Buffer anyway so this cast is a no-op
        updateBlockHash(Buffer.from(it))
        hash.update(it)
      })
      .on("error", reject)
      .on("end", () => {
        if (blockBytes !== 0) {
          blocks.push(blockHash.digest("hex"))
        }
        resolve({
          algorithm: "SHA256",
          hash: hash.digest("hex"),
          blockSize,
          blocks,
        })
      })
  })
}

export function hashFileContents(contents: Buffer | string, blockSize = 4 * 1024 * 1024): NodeIntegrity {
  const buffer = Buffer.from(contents)
  const hash = createHash("sha256")
  hash.update(buffer)

  const blocks = new Array<string>()

  for (let off = 0; off < buffer.length; off += blockSize) {
    const blockHash = createHash("sha256")
    blockHash.update(buffer.slice(off, off + blockSize))
    blocks.push(blockHash.digest("hex"))
  }

  return {
    algorithm: "SHA256",
    hash: hash.digest("hex"),
    blockSize,
    blocks,
  }
}
