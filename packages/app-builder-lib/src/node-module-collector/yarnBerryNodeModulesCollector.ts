import { log } from "builder-util"
import { Lazy } from "lazy-val"
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PM } from "./packageManager"
import { NpmDependency } from "./types"

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

  protected async getDependenciesTree(_pm: PM): Promise<NpmDependency> {
    const isPnp = await this.yarnSetupInfo.value.then(info => !!info.isPnP)
    if (isPnp) {
      log.warn(null, "Yarn PnP extraction not supported directly due to virtual file paths (<package_name>.zip/<file_path>), utilizing NPM node module collector")
    }

    return super.getDependenciesTree(PM.NPM)
  }

  protected isProdDependency(packageName: string, tree: NpmDependency): boolean {
    return super.isProdDependency(packageName, tree) || tree.dependencies?.[packageName] != null || tree.optionalDependencies?.[packageName] != null
  }

  private async detectYarnSetup(rootDir: string): Promise<YarnSetupInfo> {
    let yarnVersion: YarnSetupInfo["yarnVersion"] = null
    let nodeLinker: YarnSetupInfo["nodeLinker"] = null
    let nmHoistingLimits: YarnSetupInfo["nmHoistingLimits"] = null

    const output = await this.asyncExec("yarn", ["config", "--json"], rootDir)

    if (!output.stdout) {
      log.debug(null, "Yarn config returned no output, assuming default Yarn v1 behavior (hoisted, non-PnP)")
      return {
        yarnVersion,
        nodeLinker,
        nmHoistingLimits,
        isPnP: false,
        isHoisted: true,
      }
    }

    // Yarn 1: multi-line stream with type:"inspect" (not used in this file anyways)
    // Yarn 2–3: multi-line stream with type:"inspect"
    // Yarn 4: single JSON object, no "type"
    const lines = output.stdout
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)

    let data: any = null

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line)

        // Yarn 4: direct object
        if (parsed.rc || parsed.manifest) {
          data = parsed
          break
        }

        // Yarn 1–3: inspect event
        if (parsed.type === "inspect") {
          data = parsed.data
          break
        }
      } catch {
        // ignore non-JSON lines
      }
    }

    if (data) {
      const rc = data.rc || data // Yarn 4: rc in root; Yarn 2–3: rc inside data
      yarnVersion = data.manifest?.version ?? null
      nodeLinker = rc.nodeLinker ?? null
      nmHoistingLimits = rc.nmHoistingLimits ?? null
    }

    const isPnP = nodeLinker === "pnp"
    const isHoisted = !isPnP && (nmHoistingLimits === "dependencies" || nmHoistingLimits === "workspaces")

    return {
      yarnVersion,
      nodeLinker,
      nmHoistingLimits,
      isPnP,
      isHoisted,
    }
  }
}
