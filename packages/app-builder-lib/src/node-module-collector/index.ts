import { BunNodeModulesCollector } from "./bunNodeModulesCollector"
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PnpmNodeModulesCollector } from "./pnpmNodeModulesCollector"
import { YarnNodeModulesCollector } from "./yarnNodeModulesCollector"
import { detectPackageManagerByLockfile, detectPackageManagerByEnv, PM, getPackageManagerCommand, detectYarnBerry } from "./packageManager"
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
    case PM.BUN:
      return new BunNodeModulesCollector(rootDir, tempDirManager)
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

  const resolveYarnVersion = (pm: PM) => {
    if (pm === PM.YARN) {
      return detectYarnBerry()
    }
    return pm
  }

  for (const dir of dirs) {
    pm = detectPackageManagerByLockfile(dir)
    if (pm) {
      return resolveYarnVersion(pm)
    }
  }

  pm = detectPackageManagerByEnv()
  if (pm) {
    return resolveYarnVersion(pm)
  }

  // Default to npm
  return PM.NPM
}

export { PM, getPackageManagerCommand, BunNodeModulesCollector }
