import { InvalidConfigurationError } from "builder-util"
import { isValidPublisherNameDn, matchPublisherName, parseDn, PUBLISHER_NAME_REQUIRED_DN_ATTRIBUTES } from "builder-util-runtime"

export const PUBLISHER_NAME_DN_DOCS_URL = "https://www.electron.build/docs/migration/v27-breaking-changes#windows-publishername-must-be-a-distinguished-name"

/** What electron-updater 7 requires of a publisher name, for the error messages of the build. */
export const PUBLISHER_NAME_DN_REQUIREMENT =
  "Since electron-builder v27, each publisherName entry must be the subject distinguished name (DN) of the code signing certificate, " +
  'including at least its CN and O, e.g. "CN=My Company, O=My Company, C=US" — electron-updater 7 never matches a bare name or a DN with the CN only'

// The certificate subject attributes the derived publisher name is made of, in this order (C only when the subject has one).
const DERIVED_PUBLISHER_NAME_ATTRIBUTES = [...PUBLISHER_NAME_REQUIRED_DN_ATTRIBUTES, "C"]

// The characters parseDn treats as syntax outside a quoted value; such a value is written quoted.
const NEEDS_DN_QUOTING = /[,;+="\\<>#\n]/

function formatDnValue(value: string): string {
  return value !== value.trim() || NEEDS_DN_QUOTING.test(value) ? `"${value}"` : value
}

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
 * certificate subject DN with CN and O, which electron-updater 7 could never match. `null` / `undefined` (opt-out /
 * derive from the certificate) are not validated.
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
    `${configKey} ${formatPublisherNames(invalid)} is not a certificate subject distinguished name. ${PUBLISHER_NAME_DN_REQUIREMENT}. ` +
      `Set ${configKey} to the subject of the certificate that signs your app (on Windows, (Get-AuthenticodeSignature <signed .exe>).SignerCertificate.Subject prints it), ` +
      `or to null to opt out of update signature verification. See ${PUBLISHER_NAME_DN_DOCS_URL}`
  )
}

/**
 * Derives the publisher name written to `app-update.yml` from the subject of the signing certificate, in the format
 * Windows reports it (`X509Certificate2.Subject`, which electron-updater matches against): its CN and O, plus its C
 * when it has one. Throws an {@link InvalidConfigurationError} when the subject lacks a CN or an O.
 */
export function derivePublisherName(windowsSubjectDn: string): string {
  const subject = parseDn(windowsSubjectDn)
  const missing = PUBLISHER_NAME_REQUIRED_DN_ATTRIBUTES.filter(key => (subject.get(key) ?? "").length === 0)
  if (missing.length > 0) {
    throw new InvalidConfigurationError(
      `Cannot derive publisherName from the code signing certificate: its subject (${windowsSubjectDn}) has no ${missing.join(" and no ")}. ${PUBLISHER_NAME_DN_REQUIREMENT}. ` +
        `Set win.sign.publisherName explicitly to the subject (including CN and O) of the certificate that signs your updates, ` +
        `or set it to null (or win.verifyUpdateCodeSignature: false) to opt out of update signature verification. See ${PUBLISHER_NAME_DN_DOCS_URL}`
    )
  }
  const publisherName = DERIVED_PUBLISHER_NAME_ATTRIBUTES.flatMap(key => {
    const value = subject.get(key)
    return value == null || value.length === 0 ? [] : [`${key}=${formatDnValue(value)}`]
  }).join(", ")
  // a value that cannot be written back in DN syntax (e.g. one containing a double quote) would never match: fail rather than
  // write a publisher name electron-updater rejects every update with
  if (!matchPublisherName({ SignerCertificate: { Subject: windowsSubjectDn } }, [publisherName])) {
    throw new InvalidConfigurationError(
      `Cannot derive publisherName from the code signing certificate subject (${windowsSubjectDn}). ` +
        `Set win.sign.publisherName explicitly to the certificate subject (including CN and O), or set it to null to opt out of update signature verification. See ${PUBLISHER_NAME_DN_DOCS_URL}`
    )
  }
  return publisherName
}
