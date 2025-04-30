import { findExecutable } from "builder-util"
import { Lazy } from "lazy-val"
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"

export class YarnNodeModulesCollector extends NpmNodeModulesCollector {
  constructor(rootDir: string) {
    super(rootDir)
  }

  static readonly yarnCommand = new Lazy<string>(() =>
    findExecutable({
      name: "yarn",
      executables: ["yarn"],
      win32: ["yarn.cmd"],
      arguments: ["--version"],
    })
  )

  public readonly installOptions = YarnNodeModulesCollector.yarnCommand.value.then(cmd => ({
    cmd: cmd,
    args: ["install", "--frozen-lockfile"],
    lockfile: "yarn.lock",
  }))
}
