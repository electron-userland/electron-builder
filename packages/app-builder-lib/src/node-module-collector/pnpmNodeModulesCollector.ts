import { Lazy } from "lazy-val"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { Dependency, DependencyTree, PnpmDependency } from "./types"
import * as path from "path"
import { exec, log } from "builder-util"

export class PnpmNodeModulesCollector extends NodeModulesCollector<PnpmDependency, PnpmDependency> {
  constructor(rootDir: string) {
    super(rootDir)
  }

  static readonly pmCommand = new Lazy<string>(async () => {
    if (process.platform === "win32") {
      try {
        await exec("pnpm", ["--version"])
      } catch (_error: any) {
        log.debug(null, "pnpm not detected, falling back to pnpm.cmd")
        return "pnpm.cmd"
      }
    }
    return "pnpm"
  })

  protected readonly pmCommand: Lazy<string> = PnpmNodeModulesCollector.pmCommand
  public readonly installOptions = this.pmCommand.value.then(cmd => ({ cmd, args: ["install", "--frozen-lockfile"], lockfile: "pnpm-lock.yaml" }))

  protected getArgs(): string[] {
    return ["list", "--prod", "--json", "--depth", "Infinity"]
  }

  protected extractRelevantData(npmTree: PnpmDependency): PnpmDependency {
    const tree = super.extractRelevantData(npmTree)
    return {
      ...tree,
      optionalDependencies: this.extractInternal(npmTree.optionalDependencies),
    }
  }

  extractProductionDependencyTree(tree: PnpmDependency): DependencyTree {
    const p = path.normalize(this.resolvePath(tree.path))
    const packageJson: Dependency<string, string> = require(path.join(p, "package.json"))

    const deps = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }
    const dependencies = Object.entries(deps).reduce<DependencyTree["dependencies"]>((acc, curr) => {
      const [packageName, dependency] = curr

      let isOptional: boolean
      if (packageJson.dependencies?.[packageName]) {
        isOptional = false
      } else if (packageJson.optionalDependencies?.[packageName]) {
        isOptional = true
      } else {
        return acc
      }

      try {
        return {
          ...acc,
          [packageName]: this.extractProductionDependencyTree(dependency),
        }
      } catch (error) {
        if (isOptional) {
          return acc
        }
        throw error
      }
    }, {})

    const { name, version, path: packagePath, workspaces } = tree
    const depTree: DependencyTree = {
      name,
      version,
      path: packagePath,
      workspaces,
      dependencies,
      implicitDependenciesInjected: false,
    }
    return depTree
  }

  protected parseDependenciesTree(jsonBlob: string): PnpmDependency {
    const dependencyTree: PnpmDependency[] = JSON.parse(jsonBlob)
    // pnpm returns an array of dependency trees
    return dependencyTree[0]
  }
}
