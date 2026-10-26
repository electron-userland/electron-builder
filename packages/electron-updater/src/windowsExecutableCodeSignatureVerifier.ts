import { isValidPublisherNameDn, matchPublisherName, newError, parseAuthenticodeSignatureOutput, prepareAuthenticodeSignatureExec } from "builder-util-runtime"
import { execFile, ExecFileException } from "child_process"
import type { VerifyUpdateFileResult } from "./types.js"
import { Logger } from "./types.js"
import * as path from "path"

const PUBLISHER_NAME_DN_DOCS = "https://www.electron.build/docs/migration/v27-build-changes#windows-publishername-must-be-a-distinguished-name"

/**
 * Explains why some publisherName entries can never match the signer of an update, or returns null when every entry is
 * in distinguished name (DN) format. Such entries come from an app-update.yml written by electron-builder before
 * v27 (which wrote the certificate's Common Name), a dev-app-update.yml or another updateConfigPath file, or a direct call
 * of verifyUpdateFileAuthenticodeSignature.
 * Never throws, whatever the entries are.
 * @internal
 */
export function publisherNameDnNote(publisherNames: ReadonlyArray<unknown>): string | null {
  // typed as an array, but a JavaScript caller of verifyUpdateFileAuthenticodeSignature may pass anything
  const entries: ReadonlyArray<unknown> = Array.isArray(publisherNames) ? publisherNames : [publisherNames]
  const invalid = entries.filter(it => !isValidPublisherNameDn(it))
  if (invalid.length === 0) {
    return null
  }
  const names = invalid.map(it => (typeof it === "string" ? `"${it}"` : `(${typeof it})`)).join(", ")
  return (
    `electron-updater 7 (electron-builder v27) matches a publisherName only when it is in distinguished name (DN) format, ` +
    `e.g. "CN=My Company, O=My Company, C=US": publisherName ${names} can never match the signer of an update. ` +
    `Build the app with electron-builder v27, which writes such a DN to app-update.yml, or set the publisherName of dev-app-update.yml (or the updateConfigPath file) to the certificate subject. ${PUBLISHER_NAME_DN_DOCS}`
  )
}

const MISSING_PUBLISHER_NAME_DOCS = "https://www.electron.build/docs/migration/v27-build-changes#missing-publishername-fails-update-verification"

/**
 * The publisher names of an update config (app-update.yml, dev-app-update.yml or the updateConfigPath file), or null when it has
 * none: no config, no `publisherName`, `publisherName: null`, or no string entry. A single string is one entry. Never throws.
 * @internal
 */
export function readConfiguredPublisherNames(config: unknown): Array<string> | null {
  if (config == null || typeof config !== "object" || !("publisherName" in config)) {
    return null
  }
  const value: unknown = config.publisherName
  const values: ReadonlyArray<unknown> = Array.isArray(value) ? value : [value]
  // an entry that is no string can never match a signer, so it is left out (with no string entry at all, there is no publisherName)
  const entries = values.filter((it): it is string => typeof it === "string")
  return entries.length === 0 ? null : entries
}

/**
 * Whether the update config opts out of the Authenticode verification of updates: `verifyUpdateCodeSignature: false`, which
 * electron-builder writes into app-update.yml for a build with `win.verifyUpdateCodeSignature: false`. Never throws.
 * @internal
 */
export function isUpdateCodeSignatureVerificationDisabled(config: unknown): boolean {
  return config != null && typeof config === "object" && "verifyUpdateCodeSignature" in config && config.verifyUpdateCodeSignature === false
}

/**
 * Why an update is rejected when the update config has no publisherName to verify its Authenticode signature against.
 * Never throws.
 * @internal
 */
export function missingPublisherNameMessage(): string {
  return (
    "The update is rejected: app-update.yml has no publisherName to verify its Authenticode signature against. " +
    "Configure one at build time so that electron-builder writes it to app-update.yml: sign the build (electron-builder writes CN=<common name> of the certificate), " +
    "or set win.sign.publisherName to the subject of the certificate that signs your updates. " +
    "To opt out of update signature verification, set win.verifyUpdateCodeSignature: false at build time (in a dev-app-update.yml or updateConfigPath file: verifyUpdateCodeSignature: false). " +
    MISSING_PUBLISHER_NAME_DOCS
  )
}

// An update is installed only when Get-AuthenticodeSignature positively verifies it. Everything else rejects it (fail-closed):
// PowerShell cannot be started, times out, fails or writes to stderr, or its output cannot be parsed or names another file.

const VERIFY_TIMEOUT_MS = 60 * 1000

const CUSTOM_VERIFIER_HINT =
  "If PowerShell cannot run on your users' machines, verify updates natively by assigning autoUpdater.verifyUpdateFileAuthenticodeSignature: " +
  "https://www.electron.build/docs/win#how-do-you-use-a-custom-verify-function-to-enable-nsis-signature-verification-alternatives-instead-of-powershell"

// System.Management.Automation.SignatureType.Catalog (None 0, Authenticode 1, Catalog 2). Get-AuthenticodeSignature reports the
// signer of a Windows security catalog that lists the file's hash in preference to the signature embedded in the file. A uniquely
// built update installer is in no catalog, so a catalog signature means the file is another (catalogued, e.g. in-box Windows)
// file. A missing SignatureType comes from a PowerShell that only checks embedded signatures. An app whose installers are catalog-signed
// on purpose opts in with NsisUpdater.allowCatalogSignature, or per update with allowCatalogSignature: true in a manifest whose signature
// was verified (win.allowCatalogSignature): the catalog signer must then match publisherName like an embedded one.
const CATALOG_SIGNATURE_TYPE = 2

const SIGNATURE_UNVERIFIABLE_DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#windows-update-signature-verification-fails-closed"

/**
 * Options of the default Authenticode verification of an update.
 * @internal
 */
export interface VerifySignatureOptions {
  /**
   * Accept a signature that Windows reports from a security catalog instead of one embedded in the update file, when the catalog
   * signer matches publisherName (`NsisUpdater.allowCatalogSignature`, or a verified manifest's `allowCatalogSignature`, see
   * {@link resolveCatalogSignatureOptions}). Rejected unless exactly `true`.
   */
  readonly allowCatalogSignature?: boolean
  /**
   * What allowed a catalog signature, named in the warning logged when one is accepted: `NsisUpdater.allowCatalogSignature`
   * (`"updater"`, the default) or the verified update manifest (`"manifest"`).
   */
  readonly allowCatalogSignatureSource?: CatalogSignatureSource
}

/**
 * What allowed a catalog signature.
 * @internal
 */
export type CatalogSignatureSource = "updater" | "manifest"

/**
 * The update whose installer is verified, as far as the catalog-signature policy needs it (an `UpdateInfoAndProvider` fits).
 * @internal
 */
export interface CatalogSignatureUpdateContext {
  /** The update info (the parsed `latest*.yml`) of the update. */
  readonly info: unknown
  /** Whether the signature of that update info was verified against a trusted key (`updateManifestPublicKey`). */
  readonly manifestSignatureVerified?: unknown
}

/**
 * Why a catalog signature is rejected (the reason a failure message starts with). Never throws.
 * @internal
 */
export function catalogSignatureRejectedReason(): string {
  return (
    "Windows reports the signer of a Windows security catalog for the update file instead of a signature embedded in it, which electron-updater 7 (electron-builder v27) " +
    "does not accept by default. If your update installers are catalog-signed on purpose, set autoUpdater.allowCatalogSignature = true (or build with " +
    "win.allowCatalogSignature and signed update manifests) to accept a catalog signature " +
    `whose signer matches publisherName (${SIGNATURE_UNVERIFIABLE_DOCS}). `
  )
}

/**
 * The warning logged when a catalog signature is accepted because allowCatalogSignature is true. Never throws.
 * @internal
 */
export function catalogSignatureAcceptedWarning(subject: string, updateFile: string, source: CatalogSignatureSource = "updater"): string {
  const because =
    source === "manifest"
      ? "because the verified update manifest sets allowCatalogSignature: true (win.allowCatalogSignature)"
      : "because autoUpdater.allowCatalogSignature is true"
  return (
    `The update ${String(updateFile)} is accepted via a signature Windows reports from a security catalog (signer ${String(subject)}), not one embedded in the installer, ` +
    `${because}.`
  )
}

/**
 * The warning logged when an update manifest sets `allowCatalogSignature: true` but its signature was not verified, so the setting is
 * ignored. Never throws.
 * @internal
 */
export function unverifiedManifestCatalogSignatureWarning(version: unknown): string {
  const update = typeof version === "string" ? `version ${JSON.stringify(version)}` : "the update"
  return (
    `The update manifest of ${update} sets allowCatalogSignature: true, but its signature was not verified against a trusted updateManifestPublicKey, so the setting is ignored. ` +
    "A signature Windows reports from a security catalog is accepted only when autoUpdater.allowCatalogSignature is true, or when the update manifest that sets " +
    "allowCatalogSignature: true is signed and verified: https://www.electron.build/docs/features/signed-update-manifests"
  )
}

// a logger supplied by the app must not turn a warning into a failed (or, worse, a skipped) verification
function warnSafely(logger: Logger, message: string): void {
  try {
    logger.warn(message)
  } catch {
    // ignore
  }
}

/**
 * Decides whether the default verification accepts a catalog signature for one update: when `NsisUpdater.allowCatalogSignature` is
 * exactly `true`, or when the update info sets `allowCatalogSignature: true` and its manifest signature was verified against a trusted key.
 * An `allowCatalogSignature: true` in a manifest that was not verified is ignored, with a warning. Never throws.
 * @internal
 */
export function resolveCatalogSignatureOptions(updaterAllows: unknown, update: CatalogSignatureUpdateContext | null | undefined, logger: Logger): VerifySignatureOptions {
  if (updaterAllows === true) {
    return { allowCatalogSignature: true, allowCatalogSignatureSource: "updater" }
  }
  const info = update == null ? undefined : update.info
  if (!isRecord(info) || info.allowCatalogSignature !== true) {
    return { allowCatalogSignature: false }
  }
  if (update != null && update.manifestSignatureVerified === true) {
    return { allowCatalogSignature: true, allowCatalogSignatureSource: "manifest" }
  }
  warnSafely(logger, unverifiedManifestCatalogSignatureWarning(info.version))
  return { allowCatalogSignature: false }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

// The verification could not be done, as opposed to a signature that does not verify (a failure result, ERR_UPDATER_INVALID_SIGNATURE).
function cannotVerify(reason: string, options: { cause?: unknown; isPowerShellProblem?: boolean } = {}): Error {
  const hint = options.isPowerShellProblem === false ? "" : ` ${CUSTOM_VERIFIER_HINT}`
  const error = newError(
    `Cannot verify the Authenticode signature of the update, so it is not installed: ${reason}.${hint} ` +
      `electron-updater 7 (electron-builder v27) installs an update only when its signature is verified: ${SIGNATURE_UNVERIFIABLE_DOCS}`,
    "ERR_UPDATER_SIGNATURE_UNVERIFIABLE"
  )
  if (options.cause !== undefined) {
    error.cause = options.cause
  }
  return error
}

function describeExecError(error: ExecFileException, stderr: string): string {
  if (error.killed) {
    return `Get-AuthenticodeSignature did not finish within ${VERIFY_TIMEOUT_MS / 1000}s`
  }
  if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return "Get-AuthenticodeSignature printed more output than a signature has"
  }
  if (typeof error.code === "number") {
    const details = stderr.trim()
    return `Get-AuthenticodeSignature failed with exit code ${error.code}${details.length > 0 ? `: ${details}` : ""}`
  }
  return `cannot run PowerShell: ${error.message}`
}

// PowerShell rebuilds a drive-qualified path from the drive's root (C:\), so the case of the drive letter may differ
function normalizeForComparison(file: string): string {
  return path.normalize(file).replace(/^[a-z]:/, drive => drive.toUpperCase())
}

// Get-AuthenticodeSignature reports the path of the file it verified: it must be the update file (it is not resolved through links).
function checkLiteralPath(reportedPath: unknown, updateFile: string, logger: Logger): void {
  if (typeof reportedPath !== "string") {
    throw cannotVerify("Get-AuthenticodeSignature did not report the path of the verified file", { isPowerShellProblem: false })
  }
  const normalizedDataPath = normalizeForComparison(reportedPath)
  const normalizedUpdateFile = normalizeForComparison(updateFile)
  logger.info(`LiteralPath: ${normalizedDataPath}. Update Path: ${normalizedUpdateFile}`)
  if (normalizedDataPath !== normalizedUpdateFile) {
    throw cannotVerify(`LiteralPath of ${normalizedDataPath} is different than ${normalizedUpdateFile}`, { isPowerShellProblem: false })
  }
}

// Parses Get-AuthenticodeSignature JSON, checks the LiteralPath guard, and matches against publisherNames. Returns a
// success/failure result; throws (ERR_UPDATER_SIGNATURE_UNVERIFIABLE) when the output cannot be parsed, names another file,
// or reports a valid signature without a signer certificate subject.
function evaluateSignatureResult(
  stdout: string,
  publisherNames: string[],
  updateFile: string,
  logger: Logger,
  allowCatalogSignature: boolean,
  allowCatalogSignatureSource: CatalogSignatureSource
): VerifyUpdateFileResult {
  let data: unknown
  try {
    data = parseAuthenticodeSignatureOutput(stdout)
  } catch (e: unknown) {
    throw cannotVerify(`cannot parse the output of Get-AuthenticodeSignature (${errorMessage(e)})`, { cause: e })
  }
  if (!isRecord(data)) {
    throw cannotVerify("the output of Get-AuthenticodeSignature is not a signature object", { isPowerShellProblem: false })
  }
  let reason = ""
  if (data.Status === 0) {
    checkLiteralPath(data.Path, updateFile, logger)
    const signerCertificate = data.SignerCertificate
    const subject = isRecord(signerCertificate) ? signerCertificate.Subject : undefined
    if (typeof subject !== "string") {
      throw cannotVerify("Get-AuthenticodeSignature reports a valid signature without a signer certificate subject", { isPowerShellProblem: false })
    }
    const isCatalogSignature = data.SignatureType === CATALOG_SIGNATURE_TYPE
    if (isCatalogSignature && !allowCatalogSignature) {
      reason = catalogSignatureRejectedReason()
    } else if (matchPublisherName({ SignerCertificate: { Subject: subject } }, publisherNames)) {
      if (isCatalogSignature) {
        warnSafely(logger, catalogSignatureAcceptedWarning(subject, updateFile, allowCatalogSignatureSource))
      }
      return { response: "success" }
    } else if (isCatalogSignature) {
      reason = "Windows reports the signer of a Windows security catalog for the update file (allowCatalogSignature is true), but that signer does not match publisherName. "
    }
  }
  const note = publisherNameDnNote(publisherNames)
  const result =
    `${reason}publisherNames: ${publisherNames.join(" | ")}, raw info: ` +
    JSON.stringify(data, (name, value) => (name === "RawData" ? undefined : value), 2) +
    (note == null ? "" : `\n${note}`)
  logger.warn(`Sign verification failed, installer signed with incorrect certificate: ${result}`)
  return { response: "failure", message: result }
}

// $certificateInfo = (Get-AuthenticodeSignature 'xxx\yyy.exe'
// | where {$_.Status.Equals([System.Management.Automation.SignatureStatus]::Valid) -and $_.SignerCertificate.Subject.Contains("CN=siemens.com")})
// | Out-String ; if ($certificateInfo) { exit 0 } else { exit 1 }
export function verifySignature(publisherNames: Array<string>, updateFile: string, logger: Logger, options: VerifySignatureOptions = {}): Promise<VerifyUpdateFileResult> {
  logger.info(`Verifying signature ${updateFile}`)
  // a JavaScript caller may pass anything: only `true` opts in
  const allowCatalogSignature = options?.allowCatalogSignature === true
  const allowCatalogSignatureSource: CatalogSignatureSource = options?.allowCatalogSignatureSource === "manifest" ? "manifest" : "updater"
  return new Promise<VerifyUpdateFileResult>((resolve, reject) => {
    try {
      execFile(...prepareAuthenticodeSignatureExec(updateFile, VERIFY_TIMEOUT_MS), (error, stdout, stderr) => {
        if (error != null) {
          reject(cannotVerify(describeExecError(error, String(stderr ?? "")), { cause: error }))
          return
        }
        if (stderr) {
          reject(cannotVerify(`Get-AuthenticodeSignature wrote to stderr: ${String(stderr).trim()}`))
          return
        }
        try {
          resolve(evaluateSignatureResult(String(stdout), publisherNames, updateFile, logger, allowCatalogSignature, allowCatalogSignatureSource))
        } catch (e: unknown) {
          reject(e)
        }
      })
    } catch (e: unknown) {
      // PowerShell cannot be located (no SystemRoot) or started at all, e.g. blocked by AppLocker / WDAC
      reject(cannotVerify(`cannot run PowerShell: ${errorMessage(e)}`, { cause: e }))
    }
  })
}
