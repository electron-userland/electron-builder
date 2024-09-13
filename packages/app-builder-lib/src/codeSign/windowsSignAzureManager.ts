import { InvalidConfigurationError, log } from "builder-util"
import { WindowsAzureSigningConfiguration } from "../options/winOptions"
import { WinPackager } from "../winPackager"
import { getPSCmd, WindowsSignOptions } from "./windowsCodeSign"

export class WindowsSignAzureManager {
  constructor(private readonly packager: WinPackager) {}

  async initializeProviderModules() {
    const vm = await this.packager.vm.value
    const ps = await getPSCmd(vm)

    log.debug(null, "installing required package provider (NuGet) and module (TrustedSigning) with scope CurrentUser")
    await vm.exec(ps, ["Install-PackageProvider", "-Name", "NuGet", "-MinimumVersion", "2.8.5.201", "-Force", "-Scope", "CurrentUser"])
    await vm.exec(ps, ["Install-Module", "-Name", "TrustedSigning", "-RequiredVersion", "0.4.1", "-Force", "-Repository", "PSGallery", "-Scope", "CurrentUser"])

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

  // prerequisite: requires `initializeProviderModules` to already have been executed
  async signUsingAzureTrustedSigning(options: WindowsSignOptions): Promise<boolean> {
    const vm = await this.packager.vm.value
    const ps = await getPSCmd(vm)

    const { endpoint, certificateProfileName, ...extraSigningArgs }: WindowsAzureSigningConfiguration = options.options.azureSignOptions!
    const params = {
      ...extraSigningArgs,
      Endpoint: endpoint,
      CertificateProfileName: certificateProfileName,
      Files: options.path,
    }
    const paramsString = Object.entries(params).reduce((res, [field, value]) => {
      return [...res, `-${field}`, value]
    }, [] as string[])
    await vm.exec(ps, ["Invoke-TrustedSigning", ...paramsString])

    return true
  }
}
