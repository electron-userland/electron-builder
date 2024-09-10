import { InvalidConfigurationError, log } from "builder-util"
import { WindowsConfiguration } from "../options/winOptions"
import { VmManager } from "../vm/vm"
import { WinPackager } from "../winPackager"

export interface WindowsSignOptions {
  readonly path: string
  readonly options: WindowsConfiguration
}

export async function signWindows(options: WindowsSignOptions, packager: WinPackager): Promise<boolean> {
  if (options.options.azureOptions) {
    log.debug({ path: log.filePath(options.path) }, "signing with Azure Trusted Signing (beta)")
    ;[
      "AZURE_TENANT_ID",
      "AZURE_CLIENT_ID",
      "AZURE_CLIENT_SECRET",
      "AZURE_CLIENT_CERTIFICATE_PATH",
      "AZURE_CLIENT_SEND_CERTIFICATE_CHAIN",
      "AZURE_USERNAME",
      "AZURE_PASSWORD",
    ].forEach(envVar => {
      if (!process.env[envVar]) {
        throw new InvalidConfigurationError(`Unable to find valid azure env var. Please set ${envVar}`)
      }
    })
    return (await packager.azureSignManager.value).signUsingAzureTrustedSigning(options)
  }

  log.debug({ path: log.filePath(options.path) }, "signing with signtool.exe")
  const deprecatedFields = {
    sign: options.options.sign,
    signDlls: options.options.signDlls,
    signingHashAlgorithms: options.options.signingHashAlgorithms,
    certificateFile: options.options.certificateFile,
    certificatePassword: options.options.certificatePassword,
    certificateSha1: options.options.certificateSha1,
    certificateSubjectName: options.options.certificateSubjectName,
    additionalCertificateFile: options.options.additionalCertificateFile,
    rfc3161TimeStampServer: options.options.rfc3161TimeStampServer,
    timeStampServer: options.options.timeStampServer,
    publisherName: options.options.publisherName,
  }
  const fields = Object.entries(deprecatedFields)
    .filter(([, value]) => !!value)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(([field, _]) => field)
  if (fields.length) {
    log.info({ fields, reason: "please move to win.signtoolOptions.<field_name>"}, `deprecated field`)
  }
  return (await packager.signtoolManager.value).signUsingSigntool({
    ...options,
    name: packager.appInfo.productName,
    site: await packager.appInfo.computePackageUrl(),
  })
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
