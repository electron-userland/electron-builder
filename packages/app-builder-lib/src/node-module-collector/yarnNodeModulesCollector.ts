import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PM } from "./packageManager"

export class YarnNodeModulesCollector extends NpmNodeModulesCollector {
  constructor(rootDir: string) {
    super(rootDir)
  }

  public readonly installOptions = { manager: PM.YARN, lockfile: "yarn.lock" }
}
