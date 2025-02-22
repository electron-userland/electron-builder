import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PnpmNodeModulesCollector } from "./pnpmNodeModulesCollector"
import { YarnNodeModulesCollector } from "./yarnNodeModulesCollector"
import { detect, PM, getPackageManagerVersion } from "./packageManager"
import { NodeModuleInfo } from "./types"
import { exec } from "builder-util"

async function isPnpmProjectHoisted(rootDir: string) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
  const config = await exec(command, ["config", "list"], { cwd: rootDir, shell: true })
  const lines = config
    .split("\n")
    .map(line => line.split("="))
    .reduce<Record<string, string>>((accum, curr) => {
      const [key, value] = curr
      return {
        ...accum,
        [key]: value,
      }
    }, {})
  return lines["node-linker"] === "hoisted" || lines["shamefully-hoist"] === "true" || lines["public-hoist-pattern"] === "*"
}

async function getCollectorByPackageManager(rootDir: string) {
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
