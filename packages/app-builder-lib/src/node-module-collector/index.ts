import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PnpmNodeModulesCollector } from "./pnpmNodeModulesCollector"
import { YarnNodeModulesCollector } from "./yarnNodeModulesCollector"
import { detectPackageManager, PM, getPackageManagerCommand } from "./packageManager"
import { NodeModuleInfo } from "./types"
import { exec } from "builder-util"

async function isPnpmProjectHoisted(rootDir: string) {
  const command = await PnpmNodeModulesCollector.pmCommand.value
  const config = await exec(command, ["config", "list"], { cwd: rootDir, shell: true })
  const lines = Object.fromEntries(config.split("\n").map(line => line.split("=").map(s => s.trim())))
  return lines["node-linker"] === "hoisted"
}

export async function getCollectorByPackageManager(rootDir: string) {
  const manager: PM = detectPackageManager(rootDir)
  switch (manager) {
    case PM.PNPM:
      if (await isPnpmProjectHoisted(rootDir)) {
        return new NpmNodeModulesCollector(rootDir)
      }
      return new PnpmNodeModulesCollector(rootDir)
    case PM.NPM:
      return new NpmNodeModulesCollector(rootDir)
    case PM.YARN:
      return new YarnNodeModulesCollector(rootDir)
    default:
      return new NpmNodeModulesCollector(rootDir)
  }
}

export async function getNodeModules(rootDir: string): Promise<NodeModuleInfo[]> {
  const collector = await getCollectorByPackageManager(rootDir)
  return collector.getNodeModules()
}

export { detectPackageManager, PM, getPackageManagerCommand }
