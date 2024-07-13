import { isCI as isCi } from "ci-info"
import * as path from "path"
import * as fs from "fs/promises"
import { ELECTRON_VERSION, getElectronCacheDir } from "./testConfig"
import { gte } from "semver"

const executeAppBuilder: (options: any) => Promise<any> = require(path.join(__dirname, "../../..", "packages/builder-util")).executeAppBuilder

export async function deleteOldElectronVersion(): Promise<any> {
  // on CircleCi no need to clean manually
  if (process.env.CIRCLECI || !isCi) {
    return
  }

  const cacheDir = getElectronCacheDir()
  let files: Array<string>
  try {
    files = await fs.readdir(cacheDir)
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return
    } else {
      throw e
    }
  }
  return await Promise.all(
    files.map(file => {
      if (file.endsWith(".zip") && !file.includes(ELECTRON_VERSION)) {
        console.log(`Remove old electron ${file}`)
        return fs.unlink(path.join(cacheDir, file))
      }
      return Promise.resolve(null)
    })
  )
}

export function downloadAllRequiredElectronVersions(): Promise<any> {
  const platforms = process.platform === "win32" ? ["win32"] : ["darwin", "linux", "win32"]
  if (process.platform === "darwin") {
    platforms.push("mas")
  }

  const versions: Array<any> = []
  for (const platform of platforms) {
    const archs: string[] =
      platform === "mas" || platform === "darwin"
        ? ["x64"]
        : platform === "win32"
          ? ["ia32", "x64"]
          : require(`${path.join(__dirname, "../../..")}/packages/builder-util/out/util`).getArchCliNames()
    for (const arch of archs) {
      if (gte(ELECTRON_VERSION, "19.0.0") && platform === "linux" && arch === "ia32") {
        // Chromium dropped support for ia32 linux binaries in 102.0.4999.0
        // https://www.electronjs.org/docs/latest/breaking-changes#removed-ia32-linux-binaries
        continue
      }
      versions.push({
        version: ELECTRON_VERSION,
        arch,
        platform,
      })
    }
  }
  return executeAppBuilder(["download-electron", "--configuration", JSON.stringify(versions)])
}

if (require.main === module) {
  downloadAllRequiredElectronVersions().catch(error => {
    console.error((error.stack || error).toString())
    process.exitCode = -1
  })
}
