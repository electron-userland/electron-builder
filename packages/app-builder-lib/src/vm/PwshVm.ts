import { log } from "builder-util"
import { Lazy } from "lazy-val"
import { findHostPwsh, hostPwshNotFoundError } from "../util/systemTools.js"
import { VmManager } from "./vm.js"

export class PwshVmManager extends VmManager {
  constructor() {
    super()
  }

  // pwsh only from the install location of Microsoft's package, never looked up on PATH
  readonly powershellCommand = new Lazy<string>(() => {
    const pwsh = findHostPwsh()
    if (pwsh == null) {
      return Promise.reject(hostPwshNotFoundError())
    }
    log.info({ path: pwsh }, "using PowerShell 7")
    return Promise.resolve(pwsh)
  })
}
