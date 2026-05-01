import { asArray, log } from "builder-util"
import { MemoLazy } from "builder-util-runtime"
import { Lazy } from "lazy-val"
import { WindowsAzureSigningConfiguration, WindowsConfiguration } from "../options/winOptions"
import { WinPackager } from "../winPackager"
import { SignManager } from "./signManager"
import { WindowsSignOptions } from "./windowsCodeSign"
import { CertificateFromStoreInfo, FileCodeSigningInfo } from "./windowsSignToolManager"

export class WindowsSignAzureManager implements SignManager {
  private readonly platformSpecificBuildOptions: WindowsConfiguration

  readonly computedPublisherName = new Lazy<Array<string> | null>(() => {
    const publisherName = this.platformSpecificBuildOptions.azureSignOptions?.publisherName
    if (publisherName === null) {
      return Promise.resolve(null)
    } else if (publisherName != null) {
      return Promise.resolve(asArray(publisherName))
    }

    // TODO: Is there another way to automatically pull Publisher Name from AzureTrusted service?
    // For now return null.
    return Promise.resolve(null)
  })

  constructor(private readonly packager: WinPackager) {
    this.platformSpecificBuildOptions = packager.platformSpecificBuildOptions
  }

  async initialize() {
    const vm = await this.packager.vm.value
    const ps = await vm.powershellCommand.value

    log.info(null, "installing required module (TrustedSigning) with scope CurrentUser")
    try {
      await vm.exec(ps, ["-NoProfile", "-NonInteractive", "-Command", "Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser"])
    } catch (error: any) {
      // Might not be needed, seems GH runners already have NuGet set up.
      // Logging to debug just in case users run into this. If NuGet isn't present, Install-Module -Name TrustedSigning will fail, so we'll get the logs at that point
      log.debug({ message: error.message || error.stack }, "unable to install PackageProvider Nuget. Might be a false alarm though as some systems already have it installed")
    }
    await vm.exec(ps, ["-NoProfile", "-NonInteractive", "-Command", "Install-Module -Name TrustedSigning -MinimumVersion 0.5.0 -Force -Repository PSGallery -Scope CurrentUser"])

    // If signing has been misconfigured it, the error from the TrustedSigning module should be descriptive enough to help them fix their configuration.
    // Options: https://learn.microsoft.com/en-us/dotnet/api/azure.identity.environmentcredential?view=azure-dotnet#definition
  }

  computePublisherName(): Promise<string> {
    return Promise.resolve(this.packager.platformSpecificBuildOptions.azureSignOptions!.publisherName)
  }
  readonly cscInfo = new MemoLazy<WindowsConfiguration, FileCodeSigningInfo | CertificateFromStoreInfo | null>(
    () => this.packager.platformSpecificBuildOptions,
    _selected => Promise.resolve(null)
  )
  // prerequisite: requires `initializeProviderModules` to already have been executed
  async signFile(options: WindowsSignOptions): Promise<boolean> {
    const vm = await this.packager.vm.value
    const ps = await vm.powershellCommand.value

    const {
      publisherName: _publisher, // extract from `extraSigningArgs`
      endpoint,
      certificateProfileName,
      codeSigningAccountName,
      fileDigest,
      timestampRfc3161,
      timestampDigest,
      ...extraSigningArgs
    }: WindowsAzureSigningConfiguration = options.options.azureSignOptions!
    const params = {
      ...extraSigningArgs,
      Endpoint: endpoint,
      CertificateProfileName: certificateProfileName,
      CodeSigningAccountName: codeSigningAccountName,
      TimestampRfc3161: timestampRfc3161 || "http://timestamp.acs.microsoft.com",
      TimestampDigest: timestampDigest || "SHA256",
      FileDigest: fileDigest || "SHA256",
      Files: vm.toVmFile(options.path),
    }
    const paramsString = Object.entries(params)
      .filter(([_, value]) => value != null)
      .reduce((res, [field, value]) => {
        const escapedValue = String(value).replace(/'/g, "''")
        return [...res, `-${field}`, `'${escapedValue}'`]
      }, [] as string[])
      .join(" ")
    await vm.exec(ps, ["-NoProfile", "-NonInteractive", "-Command", `Invoke-TrustedSigning ${paramsString}`])

    return true
  }
}
