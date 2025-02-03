import { asArray, InvalidConfigurationError, log } from "builder-util"
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

    // Preemptively check env vars once during initialization
    // Options: https://learn.microsoft.com/en-us/dotnet/api/azure.identity.environmentcredential?view=azure-dotnet#definition
    log.info(null, "verifying env vars for authenticating to Microsoft Entra ID")
    this.verifyRequiredEnvVars()
    if (!(this.verifyPrincipleSecretEnv() || this.verifyPrincipleCertificateEnv() || this.verifyUsernamePasswordEnv())) {
      throw new InvalidConfigurationError(
        `Unable to find valid azure env configuration for signing. Missing field(s) can be debugged via "DEBUG=electron-builder". Please refer to: https://learn.microsoft.com/en-us/dotnet/api/azure.identity.environmentcredential?view=azure-dotnet#definition`
      )
    }
  }

  verifyRequiredEnvVars() {
    ;["AZURE_TENANT_ID", "AZURE_CLIENT_ID"].forEach(field => {
      if (!process.env[field]) {
        throw new InvalidConfigurationError(
          `Unable to find valid azure env field ${field} for signing. Please refer to: https://learn.microsoft.com/en-us/dotnet/api/azure.identity.environmentcredential?view=azure-dotnet#definition`
        )
      }
    })
  }

  verifyPrincipleSecretEnv() {
    if (!process.env.AZURE_CLIENT_SECRET) {
      log.debug({ envVar: "AZURE_CLIENT_SECRET" }, "no secret found for authenticating to Microsoft Entra ID")
      return false
    }
    return true
  }

  verifyPrincipleCertificateEnv() {
    if (!process.env.AZURE_CLIENT_CERTIFICATE_PATH) {
      log.debug({ envVar: "AZURE_CLIENT_CERTIFICATE_PATH" }, "no path found for signing certificate for authenticating to Microsoft Entra ID")
      return false
    }
    if (!process.env.AZURE_CLIENT_CERTIFICATE_PASSWORD) {
      log.debug({ envVar: "AZURE_CLIENT_CERTIFICATE_PASSWORD" }, "(optional) certificate password not found, assuming no password")
    }
    if (!process.env.AZURE_CLIENT_SEND_CERTIFICATE_CHAIN) {
      log.debug({ envVar: "AZURE_CLIENT_SEND_CERTIFICATE_CHAIN" }, "(optional) certificate chain not found")
    }
    return true
  }

  verifyUsernamePasswordEnv() {
    if (!process.env.AZURE_USERNAME) {
      log.debug({ envVar: "AZURE_USERNAME" }, "no username found for authenticating to Microsoft Entra ID")
      if (!process.env.AZURE_PASSWORD) {
        log.debug({ envVar: "AZURE_PASSWORD" }, "no password found for authenticating to Microsoft Entra ID")
      }
      return false
    }
    return true
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
      Files: `"${options.path}"`,
    }
    const paramsString = Object.entries(params)
      .filter(([_, value]) => value != null)
      .reduce((res, [field, value]) => {
        return [...res, `-${field}`, value]
      }, [] as string[])
      .join(" ")
    await vm.exec(ps, ["-NoProfile", "-NonInteractive", "-Command", `Invoke-TrustedSigning ${paramsString}`])

    return true
  }
}
