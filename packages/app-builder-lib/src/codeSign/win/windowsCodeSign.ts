import { log, retry } from "builder-util"
import { resolveWindowsSigningConfiguration, WindowsConfiguration } from "../../options/winOptions.js"
import { WinPackager } from "../../winPackager.js"

export interface WindowsSignOptions {
  readonly path: string
  readonly options: WindowsConfiguration
}

/**
 * Result of a single sign attempt (`SignManager.signFile`). Failures are always thrown, never returned:
 * - `signed` — the configured sign manager signed the file itself
 * - `signed:custom` — a custom `sign` hook did the signing
 * - `skipped:no-certificate` — nothing to sign with (no certificate configured and no custom `sign` hook)
 */
export type WindowsSignFileResult = "signed" | "signed:custom" | "skipped:no-certificate"

/**
 * {@link WindowsSignFileResult} extended with the skip reasons that are decided before the sign manager
 * is ever invoked (see `WinPackager.signIf`):
 * - `skipped:filtered` — the file does not match the `signExts` filter
 * - `skipped:disabled` — signing is explicitly disabled (`sign: false` or `sign: null`)
 */
export type WindowsSignResult = WindowsSignFileResult | "skipped:filtered" | "skipped:disabled"

export function isSignResultSigned(result: WindowsSignResult): result is "signed" | "signed:custom" {
  return result === "signed" || result === "signed:custom"
}

export async function signWindows(options: WindowsSignOptions, packager: WinPackager): Promise<WindowsSignFileResult> {
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
