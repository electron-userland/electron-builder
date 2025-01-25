import BluebirdPromise from "bluebird-lst"
import { createHash } from "crypto"
import { createReadStream } from "fs"
import { readdir } from "fs/promises"
import * as path from "path"
import { readAsarHeader, NodeIntegrity } from "./asar"
import { FileMatcher } from "../fileMatcher"
import { statOrNull, walk, FilterStats, log } from "builder-util"

export interface AsarIntegrityOptions {
  readonly resourcesPath: string
  readonly resourcesRelativePath: string
  readonly resourcesDestinationPath: string
  readonly extraResourceMatchers: Array<FileMatcher> | null
}

export interface HeaderHash {
  algorithm: "SHA256"
  hash: string
}

export interface AsarIntegrity {
  [key: string]: HeaderHash
}

export async function computeData({ resourcesPath, resourcesRelativePath, resourcesDestinationPath, extraResourceMatchers }: AsarIntegrityOptions): Promise<AsarIntegrity> {
  type Match = Pick<FileMatcher, "to" | "from">
  type IntegrityMap = {
    [filepath: string]: string
  }
  const isAsar = (filepath: string) => filepath.endsWith(".asar")

  const resources = await readdir(resourcesPath)
  const resourceAsars = resources.filter(isAsar).reduce<IntegrityMap>(
    (prev, filename) => ({
      ...prev,
      [path.join(resourcesRelativePath, filename)]: path.join(resourcesPath, filename),
    }),
    {}
  )

  const extraResources = await BluebirdPromise.map(extraResourceMatchers ?? [], async (matcher: FileMatcher): Promise<Match[]> => {
    const { from, to } = matcher
    const stat = await statOrNull(from)
    if (stat == null) {
      log.warn({ from }, `file source doesn't exist`)
      return []
    }
    if (stat.isFile()) {
      return [{ from, to }]
    }

    if (matcher.isEmpty() || matcher.containsOnlyIgnore()) {
      matcher.prependPattern("**/*")
    }
    const matcherFilter = matcher.createFilter()
    const extraResourceMatches = await walk(matcher.from, (file: string, stats: FilterStats) => matcherFilter(file, stats) || stats.isDirectory())
    return extraResourceMatches.map(from => ({ from, to: matcher.to }))
  })
  const extraResourceAsars = extraResources
    .flat(1)
    .filter(match => isAsar(match.from))
    .reduce<IntegrityMap>((prev, { to, from }) => {
      const prefix = path.relative(resourcesDestinationPath, to)
      return {
        ...prev,
        [path.join(resourcesRelativePath, prefix, path.basename(from))]: from,
      }
    }, {})

  // sort to produce constant result
  const allAsars = [...Object.entries(resourceAsars), ...Object.entries(extraResourceAsars)].sort(([name1], [name2]) => name1.localeCompare(name2))
  return BluebirdPromise.reduce(allAsars, async (prev, [relativePathKey, from]) => ({ ...prev, [relativePathKey]: await hashHeader(from) }), {} as AsarIntegrity)
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
