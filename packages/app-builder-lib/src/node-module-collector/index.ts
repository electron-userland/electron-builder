import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PnpmNodeModulesCollector } from "./pnpmNodeModulesCollector"
import { YarnNodeModulesCollector } from "./yarnNodeModulesCollector"
import { detectPackageManager, PM, getPackageManagerCommand } from "./packageManager"
import { NodeModuleInfo } from "./types"

export async function getCollectorByPackageManager(rootDir: string) {
  const manager: PM = detectPackageManager(rootDir)
  switch (manager) {
    case PM.PNPM:
      if (await PnpmNodeModulesCollector.isPnpmProjectHoisted(rootDir)) {
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
