import { InvalidConfigurationError } from "builder-util"
import { isValidPublisherNameDn } from "builder-util-runtime"
import { isWindowsSigningDisabled, resolveWindowsSigningConfiguration, WindowsConfiguration } from "../../options/winOptions.js"
import { quoteWindowsDnValue } from "./authenticodeSignature.js"

export const PUBLISHER_NAME_DN_DOCS_URL = "https://www.electron.build/docs/migration/v27-build-changes#windows-publishername-must-be-a-distinguished-name"

export const MISSING_PUBLISHER_NAME_DOCS_URL = "https://www.electron.build/docs/migration/v27-build-changes#missing-publishername-fails-update-verification"

/** What electron-updater 7 requires of a publisher name, for the error messages of the build. */
export const PUBLISHER_NAME_DN_REQUIREMENT =
  'Since electron-builder v27, each publisherName entry must be in distinguished name (DN) format, e.g. "CN=My Company, O=My Company, C=US" ' +
  "(the subject of the code signing certificate, or the attributes of it to compare) — electron-updater 7 never matches a bare name"

/** The entries of a publisherName that are not a valid publisher name DN ({@link isValidPublisherNameDn}). */
export function invalidPublisherNames(publisherName: string | ReadonlyArray<string>): Array<unknown> {
  // typed as configured, but a hand-written JSON value may be anything: an entry that is no string is reported as invalid
  const entries: ReadonlyArray<unknown> = Array.isArray(publisherName) ? publisherName : [publisherName]
  return entries.filter(it => !isValidPublisherNameDn(it))
}

function formatPublisherNames(names: ReadonlyArray<unknown>): string {
  return names.map(it => (typeof it === "string" ? `"${it}"` : `(${typeof it})`)).join(", ")
}

/**
 * Throws an {@link InvalidConfigurationError} when an explicitly configured publisherName has an entry that is not a
 * distinguished name ({@link isValidPublisherNameDn}), which electron-updater 7 could never match. `null` / `undefined` (none /
 * derive from the certificate) are not validated: a build that writes `app-update.yml` without a publisherName fails elsewhere
 * ({@link missingUpdatePublisherNameError}).
 */
export function validatePublisherNameFormat(publisherName: string | ReadonlyArray<string> | null | undefined, configKey = "win.sign.publisherName"): void {
  if (publisherName == null) {
    return
  }
  const invalid = invalidPublisherNames(publisherName)
  if (invalid.length === 0) {
    return
  }
  throw new InvalidConfigurationError(
    `${configKey} ${formatPublisherNames(invalid)} is not a distinguished name. ${PUBLISHER_NAME_DN_REQUIREMENT}. ` +
      `Set ${configKey} to the subject of the certificate that signs your app (on Windows, (Get-AuthenticodeSignature <signed .exe>).SignerCertificate.Subject prints it), ` +
      `or set win.verifyUpdateCodeSignature: false to opt out of update signature verification. See ${PUBLISHER_NAME_DN_DOCS_URL}`
  )
}

/**
 * The publisher name written to `app-update.yml` when none is configured: `CN=<common name>` of the signing certificate,
 * with the value quoted the way Windows quotes it in the subject it reports (`X509Certificate2.Subject`, which electron-updater
 * matches against), so a common name containing e.g. `,`, `+` or `"` matches the signer's CN. Only the CN is pinned, so a
 * renewed certificate whose other subject attributes change still matches; a stricter pin is an explicit publisherName.
 * Throws an {@link InvalidConfigurationError} when the certificate has no common name (empty).
 */
export function derivePublisherName(commonName: string): string {
  const publisherName = `CN=${quoteWindowsDnValue(commonName)}`
  if (commonName.length === 0 || !isValidPublisherNameDn(publisherName)) {
    throw new InvalidConfigurationError(
      `Cannot derive publisherName from the code signing certificate: its Common Name (${JSON.stringify(commonName)}) cannot form a distinguished name. ` +
        `Set win.sign.publisherName explicitly to the subject of the certificate that signs your updates (or the attributes of it to compare), ` +
        `or set win.verifyUpdateCodeSignature: false to opt out of update signature verification. See ${PUBLISHER_NAME_DN_DOCS_URL}`
    )
  }
  return publisherName
}

/**
 * The error for a Windows build that would write `app-update.yml` without a publisherName while update signature verification is
 * enabled (`win.verifyUpdateCodeSignature` is not `false`): electron-updater 7 rejects every update of such an app. The reason names
 * what left the publisherName unresolved: signing disabled, an explicit `publisherName: null` (no opt-out any more since v27), or no
 * certificate to derive it from.
 */
export function missingUpdatePublisherNameError(options: WindowsConfiguration): InvalidConfigurationError {
  const signing = resolveWindowsSigningConfiguration(options)
  let reason: string
  if (isWindowsSigningDisabled(options)) {
    reason = `win.sign is ${options.sign === false ? "false" : "null"} (signing disabled), so no publisherName is derived from a code signing certificate`
  } else if (signing?.publisherName === null) {
    reason = "win.sign.publisherName is null, which no longer opts out of update signature verification since electron-builder v27"
  } else {
    reason =
      "no code signing certificate is configured (win.sign.certificateFile, WIN_CSC_LINK / CSC_LINK, win.sign.certificateSubjectName or win.sign.certificateSha1) to derive publisherName from"
  }
  return new InvalidConfigurationError(
    `Cannot write app-update.yml without publisherName: ${reason}. ` +
      "Since electron-builder v27, electron-updater 7 rejects every update of an app whose app-update.yml has no publisherName (it used to skip the signature verification). " +
      "Sign the build with a code signing certificate (electron-builder then writes CN=<common name> of it), " +
      'set win.sign.publisherName to the distinguished name of the certificate that signs your installer (e.g. win.sign: { type: "signtool", publisherName: ["CN=My Company, O=My Company, C=US"] } when you sign outside electron-builder), ' +
      `or set win.verifyUpdateCodeSignature: false to opt out of update signature verification explicitly. See ${MISSING_PUBLISHER_NAME_DOCS_URL}`
  )
}
