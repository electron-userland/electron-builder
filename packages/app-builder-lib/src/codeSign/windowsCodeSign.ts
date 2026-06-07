import { log, retry } from "builder-util"
import { WindowsConfiguration } from "../options/winOptions.js"
import { WinPackager } from "../winPackager.js"

export interface WindowsSignOptions {
  readonly path: string
  readonly options: WindowsConfiguration
}

export async function signWindows(options: WindowsSignOptions, packager: WinPackager): Promise<boolean> {
  if (options.options.azureSignOptions) {
    if (options.options.signtoolOptions) {
      log.warn(null, "ignoring signtool options, using Azure Trusted Signing; please only configure one")
    }
    log.info({ path: log.filePath(options.path) }, "signing with Azure Trusted Signing")
  } else {
    log.info({ path: log.filePath(options.path) }, "signing with signtool.exe")
  }
  const packageManager = await packager.signingManager.value
  return signWithRetry(async () => packageManager.signFile(options))
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
