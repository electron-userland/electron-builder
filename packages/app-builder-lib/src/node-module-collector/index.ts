import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PnpmNodeModulesCollector } from "./pnpmNodeModulesCollector"
import { YarnNodeModulesCollector } from "./yarnNodeModulesCollector"
import { detect, PM, getPackageManagerVersion } from "./packageManager"
import { NodeModuleInfo } from "./types"
import { exec } from "builder-util"

async function isPnpmProjectHoisted(rootDir: string) {
  const command = await PnpmNodeModulesCollector.pmCommand.value
  const config = await exec(command, ["config", "list"], { cwd: rootDir, shell: true })
  const lines = Object.fromEntries(config.split("\n").map(line => line.split("=").map(s => s.trim())))
  return lines["node-linker"] === "hoisted"
}

export async function getCollectorByPackageManager(rootDir: string) {
  const manager: PM = await detect({ cwd: rootDir })
  switch (manager) {
    case "pnpm":
      if (await isPnpmProjectHoisted(rootDir)) {
        return new NpmNodeModulesCollector(rootDir)
      }
      return new PnpmNodeModulesCollector(rootDir)
    case "npm":
      return new NpmNodeModulesCollector(rootDir)
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
