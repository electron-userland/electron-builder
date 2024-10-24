import { NodeModulesCollector } from "./nodeModulesCollector"

export class NpmNodeModulesCollector extends NodeModulesCollector {
  constructor(rootDir: string) {
    super(rootDir)
  }

  getCommand(): string {
    return process.platform === "win32" ? "npm.cmd" : "npm"
  }

  getArgs(): string[] {
    return ["list", "--omit", "dev", "-a", "--json", "--long"]
  }
}
