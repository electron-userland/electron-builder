import { build, parse } from "plist"
import * as fs from "fs"

function sortObjectKeys(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys)
  }

  return Object.keys(obj)
    .sort()
    .reduce((result: any, key: string) => {
      result[key] = sortObjectKeys(obj[key])
      return result
    }, {})
}

export async function savePlistFile(path: string, data: any): Promise<void> {
  const sortedData = sortObjectKeys(data)
  const plist = build(sortedData)
  await fs.promises.writeFile(path, plist)
}

export async function parsePlistFile(file: string): Promise<any> {
  const data = await fs.promises.readFile(file, "utf8")
  return parse(data)
}
