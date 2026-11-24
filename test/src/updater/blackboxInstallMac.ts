import { getArchSuffix } from "builder-util"
import { Arch } from "electron-builder"
import path from "path"

/** The TestApp.app bundle of a mac build's output directory (or of a directory laid out like it). */
export function macAppBundle(dirPath: string, arch: Arch): string {
  return path.join(dirPath, `mac${getArchSuffix(arch)}`, `TestApp.app`)
}

export function installMac(dirPath: string, arch: Arch): string {
  return path.join(macAppBundle(dirPath, arch), "Contents", "MacOS", "TestApp")
}
