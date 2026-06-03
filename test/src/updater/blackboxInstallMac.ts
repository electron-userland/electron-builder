import { getArchSuffix } from "builder-util/src/util"
import { Arch } from "electron-builder"
import path from "path"

export function installMac(dirPath: string, arch: Arch): string {
  return path.join(dirPath, `mac${getArchSuffix(arch)}`, `TestApp.app`, "Contents", "MacOS", "TestApp")
}
