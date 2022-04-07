import * as path from "path"
import { Target, AppInfo } from "../"
import { Arch, debug } from "builder-util"
import { PlatformPackager } from "../platformPackager"
import * as fs from "fs/promises"

export class StageDir {
  constructor(readonly dir: string) {}

  getTempFile(name: string) {
    return this.dir + path.sep + name
  }

  cleanup() {
    if (!debug.enabled || process.env.ELECTRON_BUILDER_REMOVE_STAGE_EVEN_IF_DEBUG === "true") {
      return fs.rm(this.dir, { recursive: true, force: true })
    }
    return Promise.resolve()
  }

  toString() {
    return this.dir
  }
}

export async function createStageDir(target: Target, packager: PlatformPackager<any>, arch: Arch): Promise<StageDir> {
  return new StageDir(await createStageDirPath(target, packager, arch))
}

export async function createStageDirPath(target: Target, packager: PlatformPackager<any>, arch: Arch): Promise<string> {
  const tempDir = packager.info.stageDirPathCustomizer(target, packager, arch)
  await fs.rm(tempDir, { recursive: true, force: true })
  await fs.mkdir(tempDir, { recursive: true })
  return tempDir
}

// https://github.com/electron-userland/electron-builder/issues/3100
// https://github.com/electron-userland/electron-builder/commit/2539cfba20dc639128e75c5b786651b652bb4b78
export function getWindowsInstallationDirName(appInfo: AppInfo, isTryToUseProductName: boolean): string {
  return isTryToUseProductName && /^[-_+0-9a-zA-Z .]+$/.test(appInfo.productFilename) ? appInfo.productFilename : appInfo.sanitizedName
}
