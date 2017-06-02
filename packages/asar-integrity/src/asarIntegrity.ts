import BluebirdPromise from "bluebird-lst"
import { createHash } from "crypto"
import { createReadStream } from "fs"
import { readdir } from "fs-extra-p"
import * as path from "path"

export async function computeData(resourcesPath: string): Promise<{ [key: string]: string; }> {
  // sort to produce constant result
  const names = (await readdir(resourcesPath)).filter(it => it.endsWith(".asar")).sort()
  const checksums = await BluebirdPromise.map(names, it => hashFile(path.join(resourcesPath, it), "sha512"))

  const result: { [key: string]: string; } = {}
  for (let i = 0; i < names.length; i++) {
    result[names[i]] = checksums[i]
  }
  return result
}

export function hashFile(file: string, algorithm: string) {
  return new BluebirdPromise<string>((resolve, reject) => {
    const hash = createHash(algorithm)
    hash
      .on("error", reject)
      .setEncoding("hex")

    createReadStream(file)
      .on("error", reject)
      .on("end", () => {
        hash.end()
        resolve(<string>hash.read())
      })
      .pipe(hash, {end: false})
  })
}