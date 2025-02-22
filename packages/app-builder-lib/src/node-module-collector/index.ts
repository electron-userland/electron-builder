import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PnpmNodeModulesCollector } from "./pnpmNodeModulesCollector"
import { YarnNodeModulesCollector } from "./yarnNodeModulesCollector"
import { detect, PM, getPackageManagerVersion } from "./packageManager"
import { NodeModuleInfo } from "./types"
import { readFile } from "fs-extra"
import * as path from "path"
import { exists } from "builder-util"

async function getCollectorByPackageManager(rootDir: string) {
  const manager: PM = await detect({ cwd: rootDir })
  const npmrc = await parseNpmrc(rootDir)
  switch (manager) {
    case "pnpm":
      if (npmrc?.["node-linker"] === "hoisted") {
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

async function parseNpmrc(rootDir: string) {
  const npmrc = path.join(rootDir, ".npmrc")
  if (await exists(npmrc)) {
    const n = await readFile(npmrc, "utf-8")
    const lines = n
      .split("\n")
      .map(line => line.split("="))
      .reduce<Record<string, string>>((accum, curr) => {
        const [key, value] = curr
        return {
          ...accum,
          [key]: value,
        }
      }, {})
    return lines
  }
  return undefined
}

export async function getNodeModules(rootDir: string): Promise<NodeModuleInfo[]> {
  const collector = await getCollectorByPackageManager(rootDir)
  return collector.getNodeModules()
}

export { detect, getPackageManagerVersion, PM }
