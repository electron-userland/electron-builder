import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PnpmNodeModulesCollector } from "./pnpmNodeModulesCollector"
import { YarnNodeModulesCollector } from "./yarnNodeModulesCollector"
import { detect, PM, getPackageManagerVersion } from "./packageManager"
import { NodeModuleInfo } from "./types"
import { log, exec } from "builder-util"

async function getPnpmConfig(key: string, rootDir: string): Promise<string> {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
  return await exec(command, ["config", "get", key], { cwd: rootDir, shell: true })
}

async function getCollectorByPackageManager(rootDir: string) {
  const manager: PM = await detect({ cwd: rootDir })
  switch (manager) {
    case "npm":
      return new NpmNodeModulesCollector(rootDir)
    case "pnpm":
      {
        const nodeLinker = await getPnpmConfig("node-linker", rootDir)
        if (nodeLinker.trim() === "hoisted") {
          log.warn("pnpm hoisted mode use more disk space and is slower to install. It is recommended to use pnpm without hoisted")
          return new NpmNodeModulesCollector(rootDir)
        }
      }
      return new PnpmNodeModulesCollector(rootDir)
    case "yarn":
      return new YarnNodeModulesCollector(rootDir)
    default:
      return new NpmNodeModulesCollector(rootDir)
  }
}

export async function getNodeModules(rootDir: string): Promise<NodeModuleInfo[]> {
  const collector = await getCollectorByPackageManager(rootDir)
  return collector.getNodeModules()
}

export { detect, getPackageManagerVersion, PM }
