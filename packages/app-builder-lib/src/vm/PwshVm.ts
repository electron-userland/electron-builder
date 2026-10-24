import { log } from "builder-util"
import { Lazy } from "lazy-val"
import { ExecutablesConfig } from "../configuration.js"
import { resolveExecutable } from "../util/systemTools.js"
import { VmManager } from "./vm.js"

export class PwshVmManager extends VmManager {
  constructor(executables?: ExecutablesConfig | null) {
    super(executables)
  }

  // pwsh by absolute path (toolsets.executables.pwsh or its default install location), never looked up on PATH
  // (a configuration error rejects the promise, like any other failure to find PowerShell)
  readonly powershellCommand = new Lazy<string>(() =>
    Promise.resolve().then(() => {
      const pwsh = resolveExecutable("pwsh", this.executables)
      log.info({ path: pwsh }, "using PowerShell 7")
      return pwsh
    })
  )
}
