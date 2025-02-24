import { build, parse } from "plist"
import * as fs from "fs"

type PlistValue = string | number | boolean | Date | PlistObject | PlistValue[]

interface PlistObject {
  [key: string]: PlistValue
}

function sortObjectKeys(obj: PlistValue): PlistValue {
  if (obj === null || typeof obj !== "object") {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys)
  }

  const result: PlistObject = {}
  Object.keys(obj)
    .sort()
    .forEach(key => {
      result[key] = sortObjectKeys((obj as PlistObject)[key])
    })
  return result
}

export async function savePlistFile(path: string, data: PlistValue): Promise<void> {
  const sortedData = sortObjectKeys(data)
  const plist = build(sortedData)
  await fs.promises.writeFile(path, plist)
}

export async function parsePlistFile(file: string): Promise<PlistValue> {
  const data = await fs.promises.readFile(file, "utf8")
  return parse(data) as PlistValue
}

export type { PlistValue, PlistObject }
