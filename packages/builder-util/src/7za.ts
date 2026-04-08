import { path7x, path7za } from "7zip-bin"
import * as fs from "fs"
import fsExtra from "fs-extra"

export async function getPath7za(): Promise<string> {
  if (fs.existsSync(path7za)) {
    await fsExtra.chmod(path7za, 0o755)
  }
  return path7za
}

export async function getPath7x(): Promise<string> {
  await fsExtra.chmod(path7x, 0o755)
  return path7x
}
