import { log, retry } from "builder-util"
import { resolveWindowsSigningConfiguration, WindowsConfiguration } from "../../options/winOptions.js"
import { WinPackager } from "../../winPackager.js"
import { SignFileResult } from "../signResult.js"

export interface WindowsSignOptions {
  readonly path: string
  readonly options: WindowsConfiguration
}

export async function signWindows(options: WindowsSignOptions, packager: WinPackager): Promise<SignFileResult> {
  const signing = resolveWindowsSigningConfiguration(options.options)
  const packageManager = await packager.signingManager.value

  const path = log.filePath(options.path)
  // no "signing..." pre-log here: the sign managers already log "signing" with certificate details right before executing
  const result = await signWithRetry(async () => packageManager.signFile(options))

  if (result === "skipped:no-certificate") {
    log.info({ path, reason: "no code signing certificate configured" }, "signing skipped")
  } else if (result === "signed:custom") {
    log.info({ path }, "signed with custom `sign` hook")
  } else if (signing?.type === "azure") {
    log.info({ path }, "signed with Azure Trusted Signing")
  } else if (signing?.type === "hsm") {
    log.info({ path }, "signed with signtool.exe (HSM)")
  } else if (signing?.type === "pkcs11") {
    log.info({ path }, "signed with osslsigncode (PKCS#11)")
  } else {
    log.info({ path }, "signed with signtool.exe")
  }

  return result
}

function signWithRetry<T>(signer: () => Promise<T>): Promise<T> {
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
