import { Lazy } from "lazy-val"
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import * as which from "which"

export class YarnNodeModulesCollector extends NpmNodeModulesCollector {
  constructor(rootDir: string) {
    super(rootDir)
  }

  static readonly pmCommand = new Lazy<string>(async () => {
    if (process.platform === "win32") {
      return which("yarn")
    }
    return "yarn"
  })

  // note: do not override instance-var `pmCommand`. We explicitly use npm for the json payload
  public readonly installOptions = YarnNodeModulesCollector.pmCommand.value.then(cmd => ({
    cmd,
    args: ["install", "--frozen-lockfile"],
    lockfile: "yarn.lock",
  }))
}
