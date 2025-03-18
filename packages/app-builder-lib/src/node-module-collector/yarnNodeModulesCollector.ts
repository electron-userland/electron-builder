import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"

export class YarnNodeModulesCollector extends NpmNodeModulesCollector {
  constructor(rootDir: string) {
    super(rootDir)
  }

  public readonly installOptions = Promise.resolve({
    cmd: process.platform === "win32" ? "yarn.cmd" : "yarn",
    args: ["install", "--frozen-lockfile", "--network-concurrency 1"],
    lockfile: "yarn.lock",
  })
}
