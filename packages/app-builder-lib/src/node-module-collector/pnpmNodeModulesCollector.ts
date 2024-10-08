import { execSync } from "child_process"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { DependencyTree } from "./types"

export class PnpmNodeModulesCollector extends NodeModulesCollector {
  constructor(rootDir: string) {
    super(rootDir)
  }

  getPMCommand(): string {
    const cmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
    return `${cmd} list --prod --json --long --depth Infinity`
  }

  getDependenciesTree() {
    const pnpmListOutput = execSync(this.getPMCommand(), {
      cwd: this.rootDir,
      encoding: "utf-8",
    })

    const dependencyTree: DependencyTree = JSON.parse(pnpmListOutput)[0]
    return dependencyTree
  }
}
