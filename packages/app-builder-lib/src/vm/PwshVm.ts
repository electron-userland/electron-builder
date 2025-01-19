import { Lazy } from "lazy-val"
import { isLinuxPwshAvailable, VmManager } from "./vm"
import { log } from "builder-util"

export class PwshVmManager extends VmManager {
  constructor() {
    super()
  }

  readonly powershellCommand = new Lazy<string>(async () => {
    log.info(null, "checking for `pwsh` for powershell")
    if (await isLinuxPwshAvailable.value) {
      return "pwsh"
    }
    const errorMessage = `unable to find \`pwsh\` within docker container, please install per https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell-on-linux`
    log.error(null, errorMessage)
    throw new Error(errorMessage)
  })
}
