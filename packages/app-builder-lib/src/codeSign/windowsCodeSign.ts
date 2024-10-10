import { log } from "builder-util"
import { WindowsConfiguration } from "../options/winOptions"
import { VmManager } from "../vm/vm"
import { WinPackager } from "../winPackager"

export interface WindowsSignOptions {
  readonly path: string
  readonly options: WindowsConfiguration
}

export async function signWindows(options: WindowsSignOptions, packager: WinPackager): Promise<boolean> {
  if (options.options.azureSignOptions) {
    log.info({ path: log.filePath(options.path) }, "signing with Azure Trusted Signing (beta)")
    return (await packager.azureSignManager.value).signUsingAzureTrustedSigning(options)
  }

  log.info({ path: log.filePath(options.path) }, "signing with signtool.exe")
  return (await packager.signtoolManager.value).signUsingSigntool(options)
}

export async function getPSCmd(vm: VmManager): Promise<string> {
  return await vm
    .exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Get-Command pwsh.exe`])
    .then(() => {
      log.debug(null, "identified pwsh.exe for executing code signing")
      return "pwsh.exe"
    })
    .catch(() => {
      log.debug(null, "unable to find pwsh.exe, falling back to powershell.exe")
      return "powershell.exe"
    })
}
