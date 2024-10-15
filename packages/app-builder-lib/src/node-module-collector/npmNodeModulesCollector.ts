import { execSync } from "child_process"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { DependencyTree } from "./types"

export class NpmNodeModulesCollector extends NodeModulesCollector {
  constructor(rootDir: string) {
    super(rootDir)
  }

  getPMCommand(): string {
    const cmd = process.platform === "win32" ? "npm.cmd" : "npm"
    return `${cmd} list --omit dev -a --json --long`
  }

  getDependenciesTree(): DependencyTree {
    const npmListOutput = execSync(this.getPMCommand(), {
      cwd: this.rootDir,
      encoding: "utf-8",
        maxBuffer: 1024 * 1024 * 100 
    })

    const dependencyTree: DependencyTree = JSON.parse(npmListOutput)
    return dependencyTree
  }
}
