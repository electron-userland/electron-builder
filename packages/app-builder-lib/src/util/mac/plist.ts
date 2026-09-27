import plist_1 from "plist"
import * as fs from "fs/promises"

type PlistValue = string | number | boolean | Date | Buffer | PlistObject | PlistValue[]

interface PlistObject {
  [key: string]: PlistValue
}

function sortObjectKeys(obj: PlistValue): PlistValue {
  if (obj === null || typeof obj !== "object") {
    return obj
  }

  // `<data>` parses to a Buffer and `<date>` to a Date. Both are objects, so recursing into them rewrites the
  // Buffer as a `<dict>` of byte integers and the Date as an empty `<dict>` — they must be passed through as-is.
  if (Buffer.isBuffer(obj) || obj instanceof Date) {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys)
  }

  const result: PlistObject = {}
  Object.keys(obj)
    .sort()
    .forEach(key => {
      result[key] = sortObjectKeys(obj[key])
    })
  return result
}

export async function savePlistFile(path: string, data: PlistValue): Promise<void> {
  const sortedData = sortObjectKeys(data)
  const plist = plist_1.build(sortedData)
  await fs.writeFile(path, plist)
}

export async function parsePlistFile<T>(file: string): Promise<T> {
  const data = await fs.readFile(file, "utf8")
  return plist_1.parse(data) as T
}

export type { PlistValue, PlistObject }
