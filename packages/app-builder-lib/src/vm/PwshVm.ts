import { log } from "builder-util"
import { Lazy } from "lazy-val"
<<<<<<< HEAD
<<<<<<< HEAD
import { isPwshAvailable, VmManager } from "./vm.js"
=======
import { isPwshAvailable, VmManager } from "./vm.js.js"
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)
=======
import { isPwshAvailable, VmManager } from "./vm.js"
>>>>>>> c92b22265 (tmp save for .js extension migration)

export class PwshVmManager extends VmManager {
  constructor() {
    super()
  }

  readonly powershellCommand = new Lazy<string>(async () => {
    log.info(null, "checking for `pwsh` for powershell")
    if (await isPwshAvailable.value) {
      return "pwsh"
    }
    const errorMessage = `unable to find \`pwsh\`, please install per instructions linked in logs`
    log.error(
      {
        mac: "https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell-on-macos",
        linux: "https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell-on-linux",
      },
      errorMessage
    )
    throw new Error(errorMessage)
  })
}
