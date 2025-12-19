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

  // private async resolveActualPath(depTree: PnpmDependency): Promise<string> {
  //   // If using hoisted mode, try to find the package at the hoisted location first
  //   if (await this.isHoisted.value) {
  //     const packageName = depTree.name || depTree.from
  //     if (packageName) {
  //       const hoistedPath = path.join(this.rootDir, "node_modules", packageName)
  //       if (await this.cache.exists[hoistedPath]) {
  //         return hoistedPath
  //       }
  //     }
  //   }
  //   // Fall back to the reported path (which might be the .pnpm store path)
  //   return depTree.path
  // }

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

    const packageName = tree.name || tree.from
    const json = packageName === dependencyId ? null : await this.getProductionDependencies(tree)
    // const deps = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }
    // const prodDependencies = json?.dependencies ?? (tree.dependencies || {})
    // const optionalDependencies = json?.optionalDependencies ?? (tree.optionalDependencies || {})
    // this.productionGraph[dependencyId] = { dependencies: [] }
    // const depPromises = Object.entries({ ...prodDependencies, ...optionalDependencies }).map(async ([packageName, dependency]) => {
    //   // First check if it's in production dependencies
    //   if (!prodDependencies[packageName]) {
    //     return undefined
    //   }

    //   // Then check if optional dependency path exists (using actual resolved path)
    //   const version = typeof dependency === "string" ? dependency : dependency.version
    //   if (optionalDependencies?.[packageName]) {
    //     const actualPath = await this.locatePackageVersion(tree.path, packageName, version).then(res => res?.packageDir)
    //     if (actualPath && !(await this.cache.exists[actualPath])) {
    //       log.debug({ path: actualPath, packageName, version }, `optional dependency is not installed (skipping`)
    //       return undefined
    //     }
    //   }
    //   const childDependencyId = this.packageVersionString({
    //     name: packageName,
    //     version,
    //   })
    //   if (dependency ) {
    //     return childDependencyId
    //   }
    //   await this.extractProductionDependencyGraph(dependency, childDependencyId)
    //   return childDependencyId
    // })
    // for (const dep of depPromises) {
    //   const result = await dep
    //   if (result !== undefined) {
    //     collectedDependencies.push(result)
    //   }
    // }
        this.productionGraph[dependencyId] = { dependencies: [] }

    const collectedDependencies: string[] = []
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
