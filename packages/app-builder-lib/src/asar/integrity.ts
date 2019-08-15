import BluebirdPromise from "bluebird-lst"
import { createHash } from "crypto"
import { createReadStream } from "fs"
import { readdir } from "fs-extra"
import * as path from "path"

export interface AsarIntegrityOptions {
  /**
   * Allows external asar files.
   *
   * @default false
   */
  readonly externalAllowed?: boolean
}

export interface AsarIntegrity extends AsarIntegrityOptions {
  checksums: { [key: string]: string; }
}

export async function computeData(resourcesPath: string, options?: AsarIntegrityOptions | null): Promise<AsarIntegrity> {
  // sort to produce constant result
  const names = (await readdir(resourcesPath)).filter(it => it.endsWith(".asar")).sort()
  const checksums = await BluebirdPromise.map(names, it => hashFile(path.join(resourcesPath, it)))

  const result: { [key: string]: string; } = {}
  for (let i = 0; i < names.length; i++) {
    result[names[i]] = checksums[i]
  }
  return {checksums: result, ...options}
}

function hashFile(file: string, algorithm: string = "sha512", encoding: "hex" | "base64" | "latin1" = "base64") {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash(algorithm)
    hash
      .on("error", reject)
      .setEncoding(encoding)

    createReadStream(file)
      .on("error", reject)
      .on("end", () => {
        hash.end()
        resolve(hash.read() as string)
      })
      .pipe(hash, {end: false})
  })
}