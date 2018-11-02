import { createHash } from "crypto"
import { createReadStream } from "fs"

export function hashFile(file: string, algorithm: string = "sha512", encoding: "base64" | "hex" = "base64", options?: any) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash(algorithm)
    hash
      .on("error", reject)
      .setEncoding(encoding)

    createReadStream(file, {...options, highWaterMark: 1024 * 1024 /* better to use more memory but hash faster */})
      .on("error", reject)
      .on("end", () => {
        hash.end()
        resolve(hash.read() as string)
      })
      .pipe(hash, {end: false})
  })
}