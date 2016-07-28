import * as path from "path"
import { readJson, readFile } from "fs-extra-p"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

const normalizeData = require("normalize-package-data")

export async function readPackageJson(file: string): Promise<any> {
  const data = await readJson(file)
  await authors(file, data)
  normalizeData(data)
  return data
}

async function authors(file: string, data: any) {
  if (data.contributors != null) {
    return
  }

  let authorData: string | null = null
  try {
    authorData = await readFile(path.resolve(path.dirname(file), "AUTHORS"), "utf8")
  }
  catch (ignored) {
    return
  }

  data.contributors = authorData
    .split(/\r?\n/g)
    .map(it => it.replace(/^\s*#.*$/, "").trim())
}