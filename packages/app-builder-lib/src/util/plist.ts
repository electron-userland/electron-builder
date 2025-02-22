import { build } from "plist"
import * as fs from "fs"

export async function savePlistFile(path: string, data: any): Promise<void> {
  const plist = build(data)
  await fs.promises.writeFile(path, plist)
}
