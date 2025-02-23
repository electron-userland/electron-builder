import { build } from "plist"
import * as fs from "fs"

export async function savePlistFile(path: string, data: any): Promise<void> {
  console.log("before plist test is here", JSON.stringify(data))
  const plist = build(data)
  console.log("plist test is here", plist)
  await fs.promises.writeFile(path, plist)
}
