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

  private async getProductionDependencies(depTree: PnpmDependency): Promise<{ path: string; dependencies: Record<string, string>; optionalDependencies: Record<string, string> }> {
    const packageName = depTree.name || depTree.from
    if (isEmptyOrSpaces(packageName)) {
      log.error(depTree, `cannot determine production dependencies for package with empty name`)
      throw new Error(`Cannot compute production dependencies for package with empty name: ${packageName}`)
    }

    const pkg = await this.resolvePackage(packageName, depTree.path)
    const { packageDir } = (await this.locatePackageVersion(packageName, pkg || depTree.path, depTree.version)) ?? {}

    if (packageDir == null) {
      // ignore. logged further upstream if identified as an optional dependency
      return { path: depTree.path, dependencies: {}, optionalDependencies: {} }
    }

    let packageJson: PackageJson
    try {
      packageJson = await this.cache.packageJson[path.join(packageDir, "package.json")]
    } catch {
      // ignore. logged further upstream if identified as an optional dependency
      return { path: packageDir, dependencies: {}, optionalDependencies: {} }
    }

    return {
      path: packageDir,
      dependencies: { ...packageJson.dependencies },
      optionalDependencies: { ...packageJson.optionalDependencies },
    }
  }

  protected async extractProductionDependencyGraph(tree: PnpmDependency, dependencyId: string) {
    if (this.productionGraph[dependencyId]) {
      return
    }
    // Initialize with empty dependencies array first to mark this dependency as "in progress"
    // After initialization, if there are libraries with the same name+version later, they will not be searched recursively again
    // This will prevents infinite loops when circular dependencies are encountered.
    this.productionGraph[dependencyId] = { dependencies: [] }
    const collectedDependencies: string[] = []

    const packageName = tree.name || tree.from
    const json = packageName === dependencyId ? null : await this.getProductionDependencies(tree)
    if (json) {
      const allDeps = { ...json.dependencies, ...json.optionalDependencies }
      for (const packageName in allDeps) {
        if (!this.isProdDependency(packageName, tree)) {
          continue
        }
        const version = allDeps[packageName]
        const childDependencyId = this.packageVersionString({ name: packageName, version })
        if (json.optionalDependencies?.[packageName]) {
          const actualPath = await this.locatePackageVersion(packageName, tree.path, version).then(res => res?.packageDir)
          if (isEmptyOrSpaces(actualPath) || !(await this.cache.exists[actualPath])) {
            log.debug({ path: actualPath, packageName, version }, `optional dependency is not installed (skipping`)
            continue
          }
        }
        collectedDependencies.push(childDependencyId)
      }
    }  else {
      // Collect as regular dependency tree
      for (const packageName in tree.dependencies) {
        if (!this.isProdDependency(packageName, tree)) {
          continue
        }
        const dependency = tree.dependencies[packageName]
        const childDependencyId = this.packageVersionString(dependency)
        await this.extractProductionDependencyGraph(dependency, childDependencyId)
        collectedDependencies.push(childDependencyId)
      }
    }
    this.productionGraph[dependencyId] = { dependencies: collectedDependencies }
  }

  protected async collectAllDependencies(tree: PnpmDependency) {
    // Collect regular dependencies
    for (const [key, value] of Object.entries(tree.dependencies || {})) {
      const json = await this.getProductionDependencies(value)
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

  protected async parseDependenciesTree(jsonBlob: string): Promise<PnpmDependency> {
    const dependencyTree: PnpmDependency[] = JSON.parse(jsonBlob)
    // pnpm returns an array of dependency trees
    return Promise.resolve(dependencyTree[0])
  }
}
