import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PM } from "./packageManager"

export class YarnNodeModulesCollector extends NpmNodeModulesCollector {
  // note: do not override instance-var `pmCommand`. We explicitly use npm for the json payload
  public readonly installOptions = { manager: PM.YARN, lockfile: "yarn.lock" }
}
