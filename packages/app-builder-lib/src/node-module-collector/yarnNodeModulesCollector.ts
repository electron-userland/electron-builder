import { Lazy } from "lazy-val"
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"

export class YarnNodeModulesCollector extends NpmNodeModulesCollector {
  constructor(rootDir: string) {
    super(rootDir)
  }

  public readonly testsPmCommand: Lazy<string> = new Lazy<string>(() => Promise.resolve(process.platform === "win32" ? "yarn.cmd" : "yarn"))
  public readonly lockfileName: string = "yarn.lock"
}
