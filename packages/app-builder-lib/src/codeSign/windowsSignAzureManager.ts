import { WindowsAzureSigningConfiguration } from "../options/winOptions"
import { WinPackager } from "../winPackager"
import { getPSCmd, WindowsSignOptions } from "./windowsCodeSign"

export class WindowsSignAzureManager {
  constructor(private readonly packager: WinPackager) {}

  async initializeProviderModules() {
    const vm = await this.packager.vm.value

    const ps = await getPSCmd(vm)
    await vm.exec(ps, ["Install-PackageProvider", "-Name", "NuGet", "-MinimumVersion", "2.8.5.201", "-Force", "-Scope", "CurrentUser"])
    await vm.exec(ps, ["Install-Module", "-Name", "TrustedSigning", "-RequiredVersion", "0.4.1", "-Force", "-Repository", "PSGallery", "-Scope CurrentUser"])
  }

  // prerequisite: requires `initializeProviderModules` to already have been executed
  async signUsingAzureTrustedSigning(options: WindowsSignOptions): Promise<boolean> {
    const vm = await this.packager.vm.value
    const ps = await getPSCmd(vm)

    const config: WindowsAzureSigningConfiguration = options.options.azureOptions!
    const params = {
      ...config,
      Files: options.path,
    }
    const paramsString = Object.entries(params).reduce((res, [field, value]) => {
      return [...res, `-${field}`, value]
    }, [] as string[])
    await vm.exec(ps, ["Invoke-TrustedSigning", ...paramsString])

    return true
  }
}
