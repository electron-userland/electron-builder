import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PM } from "./packageManager"

export class YarnNodeModulesCollector extends NpmNodeModulesCollector {
  // note: do not override instance-var `pmCommand`. We explicitly use npm for the json payload
  // yarn list cannot get the detailed dependencies path info, But we can use npm to get all dependencies path info
  public readonly installOptions = { manager: PM.NPM, lockfile: "yarn.lock" }
}
