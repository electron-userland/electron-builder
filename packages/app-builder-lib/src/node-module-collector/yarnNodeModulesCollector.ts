import { execSync } from "child_process"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { DependencyTree } from "./types"
import { log } from "builder-util"

export class YarnNodeModulesCollector extends NodeModulesCollector {
  constructor(rootDir: string) {
    super(rootDir)
  }

  getPMCommand(): string {
    const cmd = process.platform === "win32" ? "npm.cmd" : "npm"
    return `${cmd} list --omit dev -a --json --long`
  }

  getDependenciesTree(): DependencyTree {
    let result: DependencyTree = {}
    try {
      const stdout = execSync(this.getPMCommand(), {
        cwd: this.rootDir,
        encoding: "utf-8",
        maxBuffer: 1024 * 1024 * 100 
      })
      result =  JSON.parse(stdout) as DependencyTree
    } catch (error) {
        log.debug({error},"npm list failed in yarn project, but will be ignored")
      if (error instanceof Error && "stdout" in error) {
        const stdout = (error as any).stdout
        result =  JSON.parse(stdout) as DependencyTree
      }
    }
    return result
  }
}
