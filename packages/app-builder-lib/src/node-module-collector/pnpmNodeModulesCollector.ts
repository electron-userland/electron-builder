import { isEmptyOrSpaces, log } from "builder-util"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { PackageJson, PnpmDependency } from "./types"

export class PnpmNodeModulesCollector extends NodeModulesCollector<PnpmDependency, PnpmDependency> {
  public readonly installOptions = {
    manager: PM.PNPM,
    lockfile: "pnpm-lock.yaml",
  }

  protected getArgs(): string[] {
    return ["list", "--prod", "--json", "--depth", "Infinity", "--long"]
  }



  protected async extractProductionDependencyGraph(tree: PnpmDependency, dependencyId: string) {
    const packageName = tree.name || tree.from
    return super.extractProductionDependencyGraph({ ...tree, name: packageName }, dependencyId)
  }

  protected async collectAllDependencies(tree: PnpmDependency) {
    // Collect regular dependencies
    for (const [key, value] of Object.entries(tree.dependencies || {})) {
      const json = await this.getProductionDependencies({ ...value, name: key })
      this.allDependencies.set(`${key}@${value.version}`, { ...value, path: json.path })
      await this.collectAllDependencies(value)
    }

    // Collect optional dependencies if they exist
    for (const [key, value] of Object.entries(tree.optionalDependencies || {})) {
      const json = await this.getProductionDependencies(value)
      this.allDependencies.set(`${key}@${value.version}`, { ...value, path: json.path })
      await this.collectAllDependencies(value)
    }
  }

  protected packageVersionString(pkg: PnpmDependency): string {
    // we use 'from' field because 'name' may be different in case of aliases
    return `${pkg.from}@${pkg.version}`
  }

  protected async parseDependenciesTree(jsonBlob: string): Promise<PnpmDependency> {
    const dependencyTree: PnpmDependency[] = JSON.parse(jsonBlob)
    // pnpm returns an array of dependency trees
    return Promise.resolve(dependencyTree[0])
  }
}
