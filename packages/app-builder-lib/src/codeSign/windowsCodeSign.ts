import { log, retry } from "builder-util"
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
    const packageManager = await packager.azureSignManager.value
    return signWithRetry(async () => packageManager.signUsingAzureTrustedSigning(options))
  }

  log.info({ path: log.filePath(options.path) }, "signing with signtool.exe")
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
    .map(([field]) => field)
  if (fields.length) {
    log.warn({ fields, reason: "please move to win.signtoolOptions.<field_name>" }, `deprecated field`)
  }
  const packageManager = await packager.signtoolManager.value
  return signWithRetry(async () => packageManager.signUsingSigntool(options))
}

function signWithRetry(signer: () => Promise<boolean>): Promise<boolean> {
  return retry(signer, 3, 1000, 1000, 0, (e: any) => {
    const message = e.message
    if (
      // https://github.com/electron-userland/electron-builder/issues/1414
      message?.includes("Couldn't resolve host name") ||
      // https://github.com/electron-userland/electron-builder/issues/8615
      message?.includes("being used by another process.")
    ) {
      log.warn({ error: message }, "attempt to sign failed, another attempt will be made")
      return true
    }
    return false
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
