import * as fs from "fs"
import { parse as _parseJson } from "json-parse-helpfulerror"
import { Promise as BluebirdPromise } from "bluebird"
import rimraf = require("rimraf")

const readFileAsync: ((filename: string, encoding?: string) => Promise<string | Buffer>) = BluebirdPromise.promisify(fs.readFile)
const writeFileAsync = BluebirdPromise.promisify(fs.writeFile)

export function readFile(file: string): BluebirdPromise<string> {
  return <BluebirdPromise<string>>readFileAsync(file, "utf8")
}

export function writeFile(path: string, data: string | Buffer): BluebirdPromise<any> {
  return writeFileAsync(path, data)
}

export function parseJsonFile(file: string): BluebirdPromise<any> {
  return readFile(file).
    then(it => parseJson(it, file))
}

export function parseJson(data: string, path: string): any {
  try {
    return _parseJson(data)
  }
  catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error("Cannot parse '" + path + "': " + e.message)
    }
    else {
      throw e
    }
  }
}

export function deleteFile(path: string, ignoreIfNotExists: boolean = false): BluebirdPromise<any> {
  return new BluebirdPromise<any>((resolve, reject) => {
    fs.unlink(path, it => it == null || (ignoreIfNotExists && it.code === "ENOENT") ? resolve(null) : reject(it))
  })
}

export function deleteDirectory(path: string) {
  return new BluebirdPromise<any>((resolve, reject) => {
    rimraf(path, {glob: false}, error => error == null ? resolve(null) : reject(error))
  })
}

// returns new name
export function renameFile(oldPath: string, newPath: string): BluebirdPromise<string> {
  return new BluebirdPromise<any>((resolve, reject) => {
    fs.rename(oldPath, newPath, error => error == null ? resolve(newPath) : reject(error))
  })
}

const statFileAsync = BluebirdPromise.promisify(fs.stat)

export function stat(path: string): BluebirdPromise<fs.Stats> {
  return statFileAsync(path)
}