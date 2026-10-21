import { InvalidConfigurationError, log } from "builder-util"
import { matchPublisherName } from "builder-util-runtime"
import { readFile } from "fs/promises"
import { load } from "js-yaml"
import * as path from "path"
import type { WinPackager } from "../../winPackager.js"
import { isSignResultSigned, SigningResult } from "../signResult.js"
import { AuthenticodeSignatureStatus, AuthenticodeSignerReader, readAuthenticodeSigner } from "./authenticodeSignature.js"

export interface UpdatePublisherVerificationOptions {
  /** Reads the embedded signer of the signed file. Defaults to {@link readAuthenticodeSigner}. */
  readonly readSigner?: AuthenticodeSignerReader
  /**
   * Whether a signature that cannot be read fails the build. Defaults to true on Windows, where the signer is read with
   * the same API electron-updater verifies updates with; elsewhere such a file is only warned about.
   */
  readonly failOnUnreadableSignature?: boolean
}

const FIX_HINT =
  "Set win.sign.publisherName to the subject of the certificate that signs your installer, " +
  "or set win.verifyUpdateCodeSignature: false only if your updates are not Authenticode-signed."

/**
 * The publisher names electron-updater verifies downloaded updates against: the `publisherName` of the packed apps'
 * `app-update.yml` (one per arch). Empty when no packed app has an `app-update.yml` or it carries no publisherName,
 * since electron-updater does not verify the update signature then.
 */
async function readUpdaterPublisherNames(packager: Pick<WinPackager, "getResourcesDir">, appOutDirs: Iterable<string>): Promise<Array<Array<string>>> {
  const result: Array<Array<string>> = []
  const seen = new Set<string>()
  for (const appOutDir of appOutDirs) {
    const file = path.join(packager.getResourcesDir(appOutDir), "app-update.yml")
    let content: string
    try {
      content = await readFile(file, "utf8")
    } catch (e: any) {
      if (e.code === "ENOENT") {
        continue
      }
      throw e
    }
    const config: unknown = load(content)
    const value = config != null && typeof config === "object" && "publisherName" in config ? config.publisherName : null
    const names = (Array.isArray(value) ? value : [value]).filter((it): it is string => typeof it === "string")
    const key = JSON.stringify(names)
    if (names.length > 0 && !seen.has(key)) {
      seen.add(key)
      result.push(names)
    }
  }
  return result
}

/**
 * Checks that an installer electron-updater verifies at update time (the `nsis` installer, or the `nsis-web` stub) is
 * signed by a certificate matching the `publisherName` written into `app-update.yml`, applying the same matching
 * rules as electron-updater. A mismatch fails the build — otherwise every update built with this configuration
 * would be rejected on the users' machines.
 *
 * Runs only for a file that was actually signed (`signResult`), while update signature verification is enabled
 * (`win.verifyUpdateCodeSignature`) and a publisherName is written into `app-update.yml`. It inspects the signed
 * output itself, so it also covers signing routes where the certificate is unknown before signing (a custom
 * `win.sign.sign` hook, Azure Trusted Signing, PKCS#11).
 */
export async function verifyUpdateInstallerPublisher(
  packager: Pick<WinPackager, "isForceCodeSigningVerification" | "getResourcesDir">,
  file: string,
  signResult: SigningResult,
  appOutDirs: Iterable<string>,
  options: UpdatePublisherVerificationOptions = {}
): Promise<void> {
  if (!isSignResultSigned(signResult) || !packager.isForceCodeSigningVerification) {
    return
  }
  const publisherNameSets = await readUpdaterPublisherNames(packager, appOutDirs)
  if (publisherNameSets.length === 0) {
    log.debug({ file: log.filePath(file), reason: "no publisherName in app-update.yml" }, "skipped update publisher verification of the signed installer")
    return
  }

  const readSigner = options.readSigner ?? readAuthenticodeSigner
  const failOnUnreadableSignature = options.failOnUnreadableSignature ?? process.platform === "win32"
  const signer = await readSigner(file)
  const configured = (names: Array<string>) => names.join(" | ")

  if (signer.type === "unsigned") {
    throw new InvalidConfigurationError(
      `Signing reported ${log.filePath(file)} as signed, but it carries no Authenticode signature (${signer.reason}), so electron-updater would reject every update installed from it. ` +
        `Make sure the signing step signs this file in place (a custom win.sign.sign hook must sign the file at configuration.path).\n` +
        `  Configured publisherName: ${publisherNameSets.map(configured).join(" ; ")}\n` +
        FIX_HINT
    )
  }
  if (signer.type === "unreadable") {
    if (failOnUnreadableSignature) {
      throw new InvalidConfigurationError(
        `Cannot read the Authenticode signature of ${log.filePath(file)} to check it against the publisherName that electron-updater verifies updates against: ${signer.reason}\n` +
          FIX_HINT
      )
    }
    log.warn(
      { file: log.filePath(file), reason: signer.reason },
      "cannot read the Authenticode signature of the signed installer, so its publisher is not checked against publisherName at build time"
    )
    return
  }
  // Unlike electron-updater, which requires a Valid status, any status but HashMismatch is accepted: the build host may
  // not trust the signing chain that the users' machines trust (and the reader used on other hosts reports no status).
  if (signer.status === AuthenticodeSignatureStatus.HashMismatch) {
    throw new InvalidConfigurationError(
      `The Authenticode signature of ${log.filePath(file)} is invalid (the file was modified after signing), so electron-updater would reject every update installed from it.`
    )
  }
  // matchPublisherName takes the parsed Get-AuthenticodeSignature output, as electron-updater passes it
  const signature = { SignerCertificate: { Subject: signer.subject } }
  // electron-updater's warning for a match by Common Name (CN) only
  const logger = { warn: (message: string) => log.warn({ file: log.filePath(file), subject: signer.subject }, message) }
  for (const publisherNames of publisherNameSets) {
    if (!matchPublisherName(signature, publisherNames, logger)) {
      throw new InvalidConfigurationError(
        `${log.filePath(file)} is signed by a certificate that does not match the publisherName electron-updater verifies updates against, so every update installed from it would be rejected.\n` +
          `  Configured publisherName: ${configured(publisherNames)}\n` +
          `  Signer certificate subject: ${signer.subject}\n` +
          FIX_HINT
      )
    }
  }
  log.debug({ file: log.filePath(file), subject: signer.subject }, "signed installer matches the update publisherName")
}
