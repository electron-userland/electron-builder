import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { NpmDependency } from "./types"
import { readJson } from "fs-extra"
import { exists, log } from "builder-util"

type PackageJson = {
  name: string
  version: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  workspaces?: string[] | { packages: string[] }
}

export class NpmNodeModulesCollector extends NodeModulesCollector<NpmDependency, string> {
  public readonly installOptions = {
    manager: PM.NPM,
    lockfile: "package-lock.json",
  }

  protected getArgs(): string[] {
    return ["list", "-a", "--include", "prod", "--include", "optional", "--omit", "dev", "--json", "--long", "--silent"]
  }

  protected async collectAllDependencies(tree: NpmDependency) {
    for (const [key, value] of Object.entries(tree.dependencies || {})) {
      const { _dependencies = {}, dependencies = {} } = value
      const isDuplicateDep = Object.keys(_dependencies).length > 0 && Object.keys(dependencies).length === 0
      if (isDuplicateDep) {
        continue
      }
      this.allDependencies.set(`${key}@${value.version}`, value)
      await this.collectAllDependencies(value)
    }
  }

  protected async extractProductionDependencyGraph(tree: NpmDependency, dependencyId: string): Promise<void> {
    if (this.productionGraph[dependencyId]) {
      return
    }

    const { _dependencies: prodDependencies = {}, dependencies = {} } = tree
    const isDuplicateDep = Object.keys(prodDependencies).length > 0 && Object.keys(dependencies).length === 0
    const resolvedDeps = isDuplicateDep ? (this.allDependencies.get(dependencyId)?.dependencies ?? {}) : dependencies
    // Initialize with empty dependencies array first to mark this dependency as "in progress"
    // After initialization, if there are libraries with the same name+version later, they will not be searched recursively again
    // This will prevents infinite loops when circular dependencies are encountered.
    this.productionGraph[dependencyId] = { dependencies: [] }
    const productionDeps = Object.entries(resolvedDeps)
      .filter(([packageName]) => prodDependencies[packageName])
      .map(async ([packageName, dependency]) => {
        const childDependencyId = `${packageName}@${dependency.version}`
        await this.extractProductionDependencyGraph(dependency, childDependencyId)
        return childDependencyId
      })
    this.productionGraph[dependencyId] = { dependencies: await Promise.all(productionDeps) }
  }

  /**
   * Builds a dependency tree using only package.json dependencies and optionalDependencies.
   * This skips devDependencies and does not walk the node_modules filesystem.
   */
  protected  buildNodeModulesTreeManually(baseDir: string): Promise<NpmDependency> {
    const visited = new Set<string>()

    const buildFromPackage = async (pkgDir: string): Promise<NpmDependency> => {
      const dir = (await this.isHoisted.value) ? baseDir : pkgDir
      const pkgPath = this.resolvePath(path.join(dir, "package.json"))

      log.debug({ dir, pkgPath }, "building dependency node from package.json")

      if (!(await exists(pkgPath))) {
        throw new Error(`package.json not found at ${pkgPath} while building dependency tree manually within ${baseDir}`)
      }

      const pkg: PackageJson = await readJson(pkgPath)

      const base = { name: pkg.name, version: pkg.version, path: dir }
      const id = this.packageVersionString(base)

      if (visited.has(id)) {
        return base
      }
      visited.add(id)

      const prodDeps: Record<string, NpmDependency> = {}

      for (const [name, version] of Object.entries(pkg.dependencies || {})) {

        const packagePath = path.join(dir, "node_modules", name)
        log.debug({ packagePath }, `resolving production sub-dependency ${name}@${version}`)
        const p = this.resolvePath(packagePath)
        prodDeps[name] = await buildFromPackage(p)
      }

      return {
        ...base,
        dependencies: Object.keys(prodDeps).length ? prodDeps : undefined,
        optionalDependencies: pkg.optionalDependencies,
      }
    }
    return buildFromPackage(baseDir)
  }

  protected async parseDependenciesTree(jsonBlob: string): Promise<NpmDependency> {
    return Promise.resolve(JSON.parse(jsonBlob))
  }
}
