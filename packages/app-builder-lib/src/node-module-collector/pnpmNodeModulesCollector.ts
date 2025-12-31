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
    return ["list", "--prod", "--json", "--depth", "Infinity"]
  }

  private async getProductionDependencies(depTree: PnpmDependency): Promise<{ path: string; dependencies: Record<string, string>; optionalDependencies: Record<string, string> }> {
    const packageName = depTree.name || depTree.from
    if (isEmptyOrSpaces(packageName)) {
      log.error(depTree, `Cannot determine production dependencies for package with empty name`)
      throw new Error(`Cannot compute production dependencies for package with empty name: ${packageName}`)
    }

    // Handle link: protocol for pnpm workspace packages - the path is already the package directory
    if (depTree.version?.startsWith("link:")) {
      const linkPath = depTree.path
      const pkgJsonPath = path.join(linkPath, "package.json")

      if (await this.cache.exists[pkgJsonPath]) {
        const resolvedLocalPath = await this.cache.realPath[linkPath]
        const p = path.normalize(resolvedLocalPath)
        try {
          const packageJson = await this.cache.packageJson[path.join(p, "package.json")]
          return { path: p, dependencies: { ...packageJson.dependencies }, optionalDependencies: { ...packageJson.optionalDependencies } }
        } catch (error: any) {
          log.warn(null, `Failed to read package.json for workspace package ${p}: ${error.message}`)
          return { path: p, dependencies: {}, optionalDependencies: {} }
        }
      }
      // If the link path doesn't exist, log at debug level and return empty deps
      log.debug({ packageName, version: depTree.version, linkPath }, `Workspace package path does not exist`)
      return { path: linkPath, dependencies: {}, optionalDependencies: {} }
    }

    // In hoisted mode, pnpm list returns paths in .pnpm/ format that don't exist.
    // Use rootDir as search base when hoisted, otherwise try depTree.path first.
    const hoisted = await this.isHoisted.value
    const searchBase = hoisted ? this.rootDir : depTree.path

    // Try to locate the package, starting from appropriate base
    let actualPath = await this.locatePackageVersion(searchBase, packageName, depTree.version).then(it => it?.packageDir)

    // If not found and we started from depTree.path, try from rootDir as fallback
    if (!actualPath && !hoisted && depTree.path !== this.rootDir) {
      actualPath = await this.locatePackageVersion(this.rootDir, packageName, depTree.version).then(it => it?.packageDir)
    }

    if (!actualPath) {
      log.debug({ packageName, version: depTree.version, searchBase }, `Failed to locate package`)
      return { path: searchBase, dependencies: {}, optionalDependencies: {} }
    }

    const resolvedLocalPath = await this.cache.realPath[actualPath]
    const p = path.normalize(resolvedLocalPath)
    const pkgJsonPath = path.join(p, "package.json")

    let packageJson: PackageJson
    try {
      packageJson = await this.cache.packageJson[pkgJsonPath]
    } catch (error: any) {
      log.warn(null, `Failed to read package.json for ${p}: ${error.message}`)
      return { path: p, dependencies: {}, optionalDependencies: {} }
    }
    return { path: p, dependencies: { ...packageJson.dependencies }, optionalDependencies: { ...packageJson.optionalDependencies } }
  }

  protected async extractProductionDependencyGraph(tree: PnpmDependency, dependencyId: string) {
    if (this.productionGraph[dependencyId]) {
      return
    }
    this.productionGraph[dependencyId] = { dependencies: [] }

    const packageName = tree.name || tree.from
    const hoisted = await this.isHoisted.value

    const treeDep = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }
    const json = packageName === dependencyId ? null : await this.getProductionDependencies(tree)
    const prodDependencies = json ? { ...json.dependencies, ...json.optionalDependencies } : treeDep

    const collectedDependencies: string[] = []
    for (const packageName in treeDep) {
      if (!prodDependencies[packageName]) {
        continue
      }

      // Then check if optional dependency path exists (using actual resolved path)
      // In hoisted mode, use rootDir as search base since tree.path points to non-existent .pnpm/ paths
      const version = json?.optionalDependencies?.[packageName] || tree.optionalDependencies?.[packageName]?.version
      const searchBase = hoisted ? this.rootDir : (json?.path ?? tree.path)
      const actualPath = await this.locatePackageVersion(searchBase, packageName, version).then(it => it?.packageDir)
      if (actualPath == null || !(await this.cache.exists[actualPath])) {
        log.debug({ packageName, version: version, searchPath: actualPath }, `optional dependency not installed, skipping`)
        continue
      }
      const dependency = treeDep[packageName]
      const childDependencyId = this.packageVersionString(dependency)
      await this.extractProductionDependencyGraph(dependency, childDependencyId)
      collectedDependencies.push(childDependencyId)
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
