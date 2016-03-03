import * as fs from "fs-extra"
import { Promise as BluebirdPromise } from "bluebird"

const readFileAsync: ((filename: string, encoding?: string) => Promise<string | Buffer>) = BluebirdPromise.promisify(fs.readFile)

export function readText(file: string): BluebirdPromise<string> {
  return <BluebirdPromise<string>>readFileAsync(file, "utf8")
}

export function deleteFile(path: string, ignoreIfNotExists: boolean = false): BluebirdPromise<any> {
  return new BluebirdPromise<any>((resolve, reject) => {
    fs.unlink(path, it => it == null || (ignoreIfNotExists && it.code === "ENOENT") ? resolve(null) : reject(it))
  })
}

// returns new name
export function renameFile(oldPath: string, newPath: string): BluebirdPromise<string> {
  return new BluebirdPromise<any>((resolve, reject) => {
    fs.rename(oldPath, newPath, error => error == null ? resolve(newPath) : reject(error))
  })
}

// returns copied name
export function copyFile(src: string, dest: string): BluebirdPromise<string> {
  return new BluebirdPromise<any>((resolve, reject) => {
    fs.copy(src, dest, error => error == null ? resolve(dest) : reject(error))
  })
}

const statFileAsync = BluebirdPromise.promisify(fs.stat)

export function stat(path: string): BluebirdPromise<fs.Stats> {
  return statFileAsync(path)
}