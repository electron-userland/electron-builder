import { NpmNodeModulesCollector } from "./npmNodeModulesCollector.js"

export class YarnNodeModulesCollector extends NpmNodeModulesCollector {
  constructor(rootDir: string) {
    super(rootDir)
  }

  public readonly installOptions = Promise.resolve({
    cmd: process.platform === "win32" ? "yarn.cmd" : "yarn",
    args: ["install", "--frozen-lockfile"],
    lockfile: "yarn.lock",
  })
}
