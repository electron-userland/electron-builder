import { Executables, log } from "builder-util"
import { Lazy } from "lazy-val"
import { VmManager } from "./vm.js"

export class PwshVmManager extends VmManager {
  // pwsh by absolute path (toolsets.executables.pwsh or its default install location), never looked up on PATH
  // (a configuration error rejects the promise, like any other failure to find PowerShell)
  readonly powershellCommand = new Lazy<string>(() =>
    Promise.resolve().then(() => {
      const pwsh = Executables.resolve("pwsh")
      log.info({ path: pwsh }, "using PowerShell 7")
      return pwsh
    })
  )
}
