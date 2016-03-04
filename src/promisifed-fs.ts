import * as fs from "fs-extra-p"
import { Promise as BluebirdPromise } from "bluebird"

const readFileAsync: ((filename: string, encoding?: string) => Promise<string | Buffer>) = BluebirdPromise.promisify(fs.readFile)

export function readText(file: string): BluebirdPromise<string> {
  return <BluebirdPromise<string>>readFileAsync(file, "utf8")
}