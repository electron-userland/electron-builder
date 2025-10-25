import { log } from "builder-util"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { YarnDependency } from "./types"

type YarnListJsonLine =
  | {
      type: "tree"
      data: {
        type: "list"
        trees: YarnListTree[]
      }
    }
  | {
      type: "info" | "warning" | "error"
      data: string
    }

interface YarnListTree {
  name: string // e.g. "lodash@4.17.21"
  children: YarnListTree[]
  hint?: "dev" | "optional" | "extraneous" | "deduped" | "missing" | "peer" | "invalid" | "workspace" | "linked" | "bundled" | "incompatible" | "shadow"
}

export class YarnNodeModulesCollector extends NodeModulesCollector<YarnDependency, YarnDependency> {
  public readonly installOptions = {
    manager: PM.YARN,
    lockfile: "yarn.lock",
  }

  protected getArgs(): string[] {
    return ["list", "--production", "--json", "--depth=Infinity", "--no-progress"]
  }

  protected async parseDependenciesTree(jsonBlob: string): Promise<YarnDependency> {
    const lines = jsonBlob
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => {
        try {
          return JSON.parse(l)
        } catch {
          return undefined
        }
      })
      .filter(Boolean) as YarnListJsonLine[]

    const parsed: YarnListTree[] | undefined = lines
      .filter((l: YarnListJsonLine) => l.type === "tree")
      .map(l => l.data.trees)
      .shift()
    if (!parsed) {
      throw new Error(`Failed to extract Yarn tree: no "type":"tree" line found in \`yarn list\` output: ${lines}`)
    }

    return this.normalizeTree(parsed, this.rootDir)
  }

  protected async collectAllDependencies(tree: YarnDependency) {
    const collect = async (deps: YarnDependency["dependencies"] | YarnDependency["optionalDependencies"] = {}, isOptionalDependency: boolean) => {
      for (const [, value] of Object.entries(deps)) {
        let p: string
        try {
          p = await this.resolveModuleDir({ pkg: value.name, base: value.path, isOptionalDependency })
        } catch (e) {
          if (isOptionalDependency) {
            // ignore. optional dependency may not be installed (we throw in resolveModuleDir in this case)
            continue
          }
          log.error({ pkg: value.name }, "failed to resolve module directory")
          throw e
        }
        const m = {
          ...value,
          path: p,
        }
        const moduleKey = this.moduleKeyGenerator(m)
        if (this.allDependencies.has(moduleKey)) {
          continue
        }
        this.allDependencies.set(moduleKey, m)
        await this.collectAllDependencies(m)
      }
    }
    // Collect regular dependencies
    await collect(tree.dependencies, false)
    // Collect optional dependencies if they exist
    await collect(tree.optionalDependencies, true)
  }

  protected async extractProductionDependencyGraph(tree: YarnDependency, dependencyId: string): Promise<void> {
    if (this.productionGraph[dependencyId]) {
      return
    }
    const productionDeps = Object.entries(tree.dependencies || {}).map(async ([, dependency]) => {
      const childDependencyId = this.moduleKeyGenerator(dependency)
      const dep = {
        ...dependency,
        name: dependency.name,
        path: await this.resolveModuleDir({ pkg: dependency.name, base: dependency.path }),
      }
      await this.extractProductionDependencyGraph(dep, childDependencyId)
      return childDependencyId
    })
    this.productionGraph[dependencyId] = { dependencies: await Promise.all(productionDeps) }
  }

  private async normalizeTree(data: YarnListTree[], root: string): Promise<YarnDependency> {
    const parseTree = async (node: YarnListTree, parentDir: string): Promise<YarnDependency> => {
      const { name, version } = this.parseNameVersion(node.name)
      const dir = await this.resolveModuleDir({ pkg: name, base: parentDir })

      const dependencies: Record<string, YarnDependency> = {}
      const optionalDependencies: Record<string, YarnDependency> = {}
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          const dep = await parseTree(child, dir)
          if (child.hint === "optional" || child.hint === "missing") {
            optionalDependencies[dep.name] = dep
          } else {
            dependencies[dep.name] = dep
          }
        }
      }

      return {
        name,
        version,
        path: dir,
        dependencies: Object.keys(dependencies).length ? dependencies : undefined,
        optionalDependencies: Object.keys(optionalDependencies).length ? optionalDependencies : undefined,
      }
    }

    const dependencies = (
      await Promise.all(
        data.map(async i => {
          return parseTree(i, root)
        })
      )
    ).reduce(
      (acc, cur) => {
        const current = cur
        acc[current.name] = current
        return acc
      },
      {} as Record<string, YarnDependency>
    )

    return {
      name: ".", // root package name stub
      version: "unknown",
      path: root,
      dependencies,
    }
  }
}
