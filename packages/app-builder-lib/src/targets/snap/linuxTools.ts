import { isEmptyOrSpaces } from "builder-util"
import { getBinFromUrl } from "../../binDownload"
import * as os from "os"
import * as path from "path"
import { Lazy } from "lazy-val"

const appImageToolDir = new Lazy<string>(() => getBinFromUrl("appimage", "12.0.1", "3el6RUh6XoYJCI/ZOApyb0LLU/gSxDntVZ46R6+JNEANzfSo7/TfrzCRp5KlDo35c24r3ZOP7nnw4RqHwkMRLw=="))

function getAppImageToolBin(toolDir: string): string {
  return process.platform === "darwin" ? path.join(toolDir, "darwin") : path.join(toolDir, `linux-${goArchToArchSuffix()}`)
}

function goArchToArchSuffix(): string {
  const arch = os.arch()
  switch (arch) {
    case "arm":
      return "arm32"
    default:
      return arch
  }
}

async function getLinuxTool(name: string): Promise<string> {
  const toolDir = await appImageToolDir.value
  return path.join(getAppImageToolBin(toolDir), name)
}

export async function getMksquashfs(): Promise<string> {
  if (process.env.USE_SYSTEM_MKSQUASHFS) {
    return "mksquashfs"
  }
  if (!isEmptyOrSpaces(process.env.MKSQUASHFS_PATH)) {
    return process.env.MKSQUASHFS_PATH
  }
  return getLinuxTool("mksquashfs")
}
