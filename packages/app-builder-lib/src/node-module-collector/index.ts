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
    case PM.BUN:
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

export function detectPackageManager(searchPaths: string[]): { pm: PM; resolvedDirectory: string } {
  let pm: PM | null = null

  const resolveIfYarn = (pm: PM) => (pm === PM.YARN ? detectYarnBerry() : pm)

  for (const dir of searchPaths) {
    pm = detectPackageManagerByLockfile(dir)
    if (pm) {
      return { pm: resolveIfYarn(pm), resolvedDirectory: dir }
    }
  }

  const cwd = process.cwd()
  pm = detectPackageManagerByEnv()
  if (pm) {
    return { pm: resolveIfYarn(pm), resolvedDirectory: cwd }
  }

  // Default to npm
  return { pm: PM.NPM, resolvedDirectory: searchPaths[0] || cwd }
}

export { PM, getPackageManagerCommand }
