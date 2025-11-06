import { exists, log } from "builder-util"
import * as fs from "fs-extra"
import { access } from "fs/promises"
import { load } from "js-yaml"
import { Lazy } from "lazy-val"
import * as path from "path"
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PM } from "./packageManager"
import { NpmDependency, ResolveModuleOptions, YarnDependency } from "./types"

type YarnSetupInfo = {
  yarnVersion: string | null
  nodeLinker: "pnp" | "node-modules" | null
  nmHoistingLimits: "workspaces" | "dependencies" | "none" | null
  isPnP: boolean
  isHoisted: boolean
}

// Only Yarn v1 uses CLI. We should use pnp.cjs for PnP, but we can't access the files due to virtual file paths within zipped modules.
// We fallback to npm node module collection (since Yarn Berry could have npm-like structure OR pnpm-like structure, depending on `nmHoistingLimits` configuration).
// In the latter case, we still can't assume `pnpm` is installed, so we still try to use npm collection as a best-effort attempt.
// If those fail, such as if using corepack, we attempt to manually build the tree.
export class YarnBerryNodeModulesCollector extends NpmNodeModulesCollector {
  public readonly installOptions = {
    manager: PM.YARN_BERRY,
    lockfile: "yarn.lock",
  }

  private yarnSetupInfo: Lazy<YarnSetupInfo> = new Lazy<YarnSetupInfo>(async () => this.detectYarnSetup(this.rootDir))

  protected isHoisted: Lazy<boolean> = new Lazy<boolean>(async () => this.yarnSetupInfo.value.then(info => info.isHoisted))

  protected async getDependenciesTree(pm: PM): Promise<NpmDependency> {
    const isPnp = await this.yarnSetupInfo.value.then(info => !!info.isPnP)
    if (isPnp) {
      log.warn(null, "Yarn PnP extraction not supported directly due to virtual file paths (<package_name>.zip/<file_path>), falling back to NPM node module collector")
    }

    return super.getDependenciesTree(pm)
  }

  protected async extractProductionDependencyGraph(tree: NpmDependency, dependencyId: string): Promise<void> {
    if (this.productionGraph[dependencyId]) {
      return
    }
    const productionDeps = Object.entries(tree.dependencies || {}).map(async ([, dependency]) => {
      const dep = {
        ...dependency,
        path: this.resolvePath(dependency.path),
      }
      const childDependencyId = this.packageVersionString(dep)
      await this.extractProductionDependencyGraph(dep, childDependencyId)
      return childDependencyId
    })
    const dependencies = await Promise.all(productionDeps)
    this.productionGraph[dependencyId] = { dependencies }
  }

  private async detectYarnSetup(rootDir: string): Promise<YarnSetupInfo> {
    let yarnVersion: YarnSetupInfo["yarnVersion"] = null
    let nodeLinker: YarnSetupInfo["nodeLinker"] = null
    let nmHoistingLimits: YarnSetupInfo["nmHoistingLimits"] = null

    const output = await this.asyncExec("yarn", ["config", "list", "--json"], rootDir)

    if (output.stdout == null) {
      log.debug({ stderr: output.stderr }, "there was no config output, falling back to hoisted mode")
      return {
        yarnVersion,
        nodeLinker,
        nmHoistingLimits,
        isPnP: false,
        isHoisted: true,
      }
    }

    // Yarn prints multiple JSON lines; find the one with type: 'inspect'
    const parsed = output.stdout
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
      .filter(Boolean)
      .find(l => l.type === "inspect")

    if (parsed) {
      const data = parsed.data?.["rc"] || parsed.data || {}

      yarnVersion = parsed.data?.["manifest"]?.version ?? null
      nodeLinker = data["nodeLinker"] ?? null
      nmHoistingLimits = data["nmHoistingLimits"] ?? null
    }

    // Determine if using PnP
    const isPnP = nodeLinker === "pnp"
    const isHoisted = isPnP ? false : nmHoistingLimits === "dependencies" || nmHoistingLimits === "workspaces"

    return {
      yarnVersion,
      nodeLinker,
      nmHoistingLimits,
      isPnP,
      isHoisted,
    }
  }
}
