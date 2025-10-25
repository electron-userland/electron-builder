import path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { NpmDependency } from "./types"
import { readJson } from "fs-extra"
import { log } from "builder-util"

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

  protected getDependenciesTree(pm: PM): Promise<NpmDependency> {
    try {
      return super.getDependenciesTree(pm)
    } catch (error: any) {
      log.error({ error: error.message }, "error getting dependencies tree, falling back to manual construction")
      return this.buildNodeModulesTreeManually(this.rootDir)
    }
  }

  protected async collectAllDependencies(tree: NpmDependency) {
    for (const [, value] of Object.entries(tree.dependencies || {})) {
      const { _dependencies = {}, dependencies = {} } = value
      const isDuplicateDep = Object.keys(_dependencies).length > 0 && Object.keys(dependencies).length === 0
      if (isDuplicateDep) {
        continue
      }
      const m = {
        ...value,
        path: await this.resolveModuleDir({ pkg: value.name, base: tree.path, virtualPath: value.resolved }),
      }
      this.allDependencies.set(this.moduleKeyGenerator(m), m)
      await this.collectAllDependencies(m)
    }

    // Collect optional dependencies if they exist
    for (const [key, value] of Object.entries(tree.optionalDependencies || {})) {
      let p: string
      try {
        p = await this.resolveModuleDir({ pkg: key, base: tree.path, virtualPath: value, isOptionalDependency: true })
      } catch {
        // ignore. optional dependency may not be installed (we throw in resolveModuleDir in this case)
        continue
      }
      const m = {
        name: key,
        version: value,
        path: p,
        resolved: p,
      }
      const moduleKey = this.moduleKeyGenerator(m)
      if (this.allDependencies.has(moduleKey)) {
        continue
      }
      this.allDependencies.set(moduleKey, m)
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
      .map(async ([, dependency]) => {
        const childDependencyId = this.moduleKeyGenerator(dependency)
        const dep = {
          ...dependency,
          path: await this.resolveModuleDir({ pkg: dependency.name, base: dependency.path, virtualPath: dependency.resolved }),
        }
        await this.extractProductionDependencyGraph(dep, childDependencyId)
        return childDependencyId
      })
    this.productionGraph[dependencyId] = { dependencies: await Promise.all(productionDeps) }
  }

  protected async parseDependenciesTree(jsonBlob: string): Promise<NpmDependency> {
    return Promise.resolve(JSON.parse(jsonBlob))
  }

  /**
   * Builds a dependency tree using only package.json dependencies and optionalDependencies.
   * This skips devDependencies and does not walk the node_modules filesystem.
   */
  protected async buildNodeModulesTreeManually(baseDir: string): Promise<NpmDependency> {
    const visited = new Set<string>()

    const buildFromPackage = async (pkgDir: string): Promise<NpmDependency> => {
      const pkgPath = path.join(pkgDir, "package.json")
      const pkg: PackageJson = await readJson(pkgPath)

      const base = { name: pkg.name, version: pkg.version, path: pkgDir }
      const id = this.moduleKeyGenerator(base)

      if (visited.has(id)) {
        return base
      }
      visited.add(id)

      const prodDeps: Record<string, NpmDependency> = {}

      for (const [name, version] of Object.entries(pkg.dependencies || {})) {
        const p = await this.resolveModuleDir({ pkg: name, base: pkgDir })
        prodDeps[name] = {
          name,
          version,
          path: p,
        }
        await buildFromPackage(p)
      }

      return {
        ...base,
        dependencies: Object.keys(prodDeps).length ? prodDeps : undefined,
        optionalDependencies: pkg.optionalDependencies,
      }
    }

    return await buildFromPackage(baseDir)
  }
}
