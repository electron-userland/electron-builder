import { path7x, path7za } from "7zip-bin"
import { chmod } from "fs-extra"
import * as fs from "fs"

export async function getPath7za(): Promise<string> {
  if (fs.existsSync(path7za)) {
    await chmod(path7za, 0o755)
  }
  return path7za
}

export async function getPath7x(): Promise<string> {
  await chmod(path7x, 0o755)
  return path7x
}
