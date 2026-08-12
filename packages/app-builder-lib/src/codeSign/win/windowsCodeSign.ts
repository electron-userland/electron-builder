import { log, retry } from "builder-util"
import { resolveWindowsSigningConfiguration, WindowsConfiguration } from "../../options/winOptions.js"
import { WinPackager } from "../../winPackager.js"

export interface WindowsSignOptions {
  readonly path: string
  readonly options: WindowsConfiguration
}

export async function signWindows(options: WindowsSignOptions, packager: WinPackager): Promise<boolean> {
  const signing = resolveWindowsSigningConfiguration(options.options)
  const packageManager = await packager.signingManager.value
  const didSign = await signWithRetry(async () => packageManager.signFile(options))

  if (!didSign) {
    log.debug({ path: log.filePath(options.path) }, "signing skipped (no signing configuration found)")
  } else if (signing?.type === "azure") {
    log.info({ path: log.filePath(options.path) }, "signed with Azure Trusted Signing")
  } else if (signing?.type === "hsm") {
    log.info({ path: log.filePath(options.path) }, "signed with signtool.exe (HSM)")
  } else if (signing?.type === "pkcs11") {
    log.info({ path: log.filePath(options.path) }, "signed with osslsigncode (PKCS#11)")
  } else {
    log.info({ path: log.filePath(options.path) }, "signed with signtool.exe")
  }

  return didSign
}

function signWithRetry(signer: () => Promise<boolean>): Promise<boolean> {
  return retry(signer, {
    retries: 3,
    interval: 1000,
    backoff: 1000,
    shouldRetry: (e: any) => {
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
    },
  })
}