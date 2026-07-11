import { FilterStats, log, statOrNull, walk } from "builder-util"
import { createHash } from "crypto"
import { readdir } from "fs/promises"
import * as path from "path"
import { FileMatcher } from "../fileMatcher.js"
import { readAsarHeader } from "./asar.js"

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

  const extraResources = await Promise.all(
    (extraResourceMatchers ?? []).map(async (matcher: FileMatcher): Promise<Match[]> => {
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
  )
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
  const hashes = await Promise.all(allAsars.map(async ([, from]) => hashHeader(from)))
  const asarIntegrity: AsarIntegrity = {}
  for (let i = 0; i < allAsars.length; i++) {
    const [asar] = allAsars[i]
    asarIntegrity[asar] = hashes[i]
  }
  return asarIntegrity
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
