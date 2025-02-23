import { getBinFromUrl } from "app-builder-lib/src/binDownload"
import os from "os"
import path from "path"

async function getAppImageToolDir(): Promise<string> {
  return await getBinFromUrl("appimage", "12.0.1", "3el6RUh6XoYJCI/ZOApyb0LLU/gSxDntVZ46R6+JNEANzfSo7/TfrzCRp5KlDo35c24r3ZOP7nnw4RqHwkMRLw==")
}

function getAppImageToolBin(toolDir: string): string {
  return process.platform === "darwin" ? path.join(toolDir, "darwin") : path.join(toolDir, `linux-${goArchToArchSuffix()}`)
}

function goArchToArchSuffix(): string {
  const arch = os.arch()
  switch (arch) {
    // case "x64":
    //   return "x64"
    // case "ia32":
    //   return "ia32"
    case "arm":
      return "arm32"
    default:
      return arch
  }
}

async function getLinuxTool(name: string): Promise<string> {
  const toolDir = await getAppImageToolDir()
  return path.join(getAppImageToolBin(toolDir), name)
}

export async function getMksquashfs(): Promise<string> {
  if (!process.env.USE_SYSTEM_MKSQUASHFS) {
    const result = process.env.MKSQUASHFS_PATH
    if (!result) {
      return await getLinuxTool("mksquashfs")
    }
    return result
  }
  return "mksquashfs"
}
