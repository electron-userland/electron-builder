import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import * as which from "which"

export class YarnNodeModulesCollector extends NpmNodeModulesCollector {
  constructor(rootDir: string) {
    super(rootDir)
  }

  // note: do not override `pmCommand`. We explicitly use npm for the json payload
  public readonly installOptions = (async () => {
    const cmd = process.platform === "win32" ? await which("yarn") : "yarn";
    return {
      cmd,
      args: ["install", "--frozen-lockfile"],
      lockfile: "yarn.lock",
    };
  })()
}
