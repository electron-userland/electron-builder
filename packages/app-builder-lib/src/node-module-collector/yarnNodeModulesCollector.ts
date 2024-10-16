import { execSync } from "child_process"
import * as path from "path"
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
    try {
      const stdout = execSync(this.getPMCommand(), {
        cwd: this.rootDir,
        encoding: "utf-8",
        maxBuffer: 1024 * 1024 * 100,
      })
      return JSON.parse(stdout) as DependencyTree
    } catch (error) {
      log.debug({ error }, "npm list failed in yarn project, but will be ignored")
      if ((error as any).stdout) {
        const stdout = (error as any).stdout
        return JSON.parse(stdout) as DependencyTree
      }
    }

    return require(path.join(this.rootDir, "package.json"))
  }
}
