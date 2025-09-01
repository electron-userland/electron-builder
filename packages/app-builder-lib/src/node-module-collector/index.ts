import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PnpmNodeModulesCollector } from "./pnpmNodeModulesCollector"
import { YarnNodeModulesCollector } from "./yarnNodeModulesCollector"
import { detectPackageManagerByLockfile, detectPackageManagerByEnv, PM, getPackageManagerCommand } from "./packageManager"
import { NodeModuleInfo } from "./types"
import { TmpDir } from "temp-file"

export async function getCollectorByPackageManager(pm: PM, rootDir: string, tempDirManager: TmpDir) {
  switch (pm) {
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

export async function getNodeModules(pm: PM, rootDir: string, tempDirManager: TmpDir): Promise<NodeModuleInfo[]> {
  const collector = await getCollectorByPackageManager(pm, rootDir, tempDirManager)
  return collector.getNodeModules()
}

export function detectPackageManager(dirs: string[]): PM {
  let pm: PM | null = null

  for (const dir of dirs) {
    pm = detectPackageManagerByLockfile(dir)
    if (pm) {
      return pm
    }
  }

  return detectPackageManagerByEnv("pnpm") || detectPackageManagerByEnv("yarn") || detectPackageManagerByEnv("npm") || PM.NPM
}

export { PM, getPackageManagerCommand }
