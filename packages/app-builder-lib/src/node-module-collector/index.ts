import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PnpmNodeModulesCollector } from "./pnpmNodeModulesCollector"
import { YarnNodeModulesCollector } from "./yarnNodeModulesCollector"
import { detectPackageManager, PM, getPackageManagerCommand } from "./packageManager"
import { NodeModuleInfo } from "./types"
import { TmpDir } from "temp-file"

export async function getCollectorByPackageManager(rootDir: string, tempDirManager: TmpDir) {
  const manager: PM = detectPackageManager(rootDir)
  switch (manager) {
    case PM.PNPM:
      if (await PnpmNodeModulesCollector.isPnpmProjectHoisted(rootDir)) {
        return new NpmNodeModulesCollector(rootDir, tempDirManager)
      }
      return new PnpmNodeModulesCollector(rootDir, tempDirManager)
    case PM.NPM:
      return new NpmNodeModulesCollector(rootDir, tempDirManager)
    case PM.YARN:
      return new YarnNodeModulesCollector(rootDir, tempDirManager)
    default:
      return new NpmNodeModulesCollector(rootDir, tempDirManager)
  }
}

export async function getNodeModules(rootDir: string, tempDirManager: TmpDir): Promise<NodeModuleInfo[]> {
  const collector = await getCollectorByPackageManager(rootDir, tempDirManager)
  return collector.getNodeModules()
}

export { detectPackageManager, PM, getPackageManagerCommand }
