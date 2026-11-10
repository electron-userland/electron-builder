import { InvalidConfigurationError } from "builder-util"
import { BUILD_CHANGES_URL } from "../util/config/legacyOptions.js"

/** Explains what `forceCodeSigning` enforces; every error it raises links here. */
export const FORCE_CODE_SIGNING_DOCS = `${BUILD_CHANGES_URL}#forcecodesigning-covers-notarization-and-update-manifests`

/** Error code of a signature that was produced (or shipped) but does not verify. */
export const VERIFICATION_FAILED_ERROR_CODE = "ERR_ELECTRON_BUILDER_VERIFICATION_FAILED"

/** An error raised because `forceCodeSigning` is enabled; the docs link is appended to `message`. */
export function forceCodeSigningError(message: string, code?: string): InvalidConfigurationError {
  return new InvalidConfigurationError(`${message} See ${FORCE_CODE_SIGNING_DOCS}`, code)
}

/** The parts of a platform packager {@link forceCodeSigningOverrideHint} reads. */
export interface ForceCodeSigningSource {
  readonly platformOptions: { readonly forceCodeSigning?: boolean | null }
  readonly platform: { readonly buildConfigurationKey: string }
}

/**
 * The `-c` override that turns `forceCodeSigning` off for this build. A platform-level value wins over the root one,
 * so when the platform block sets it, only `-c.<platform>.forceCodeSigning=false` overrides it.
 */
export function forceCodeSigningOverrideHint(packager: ForceCodeSigningSource): string {
  return packager.platformOptions.forceCodeSigning == null ? "-c.forceCodeSigning=false" : `-c.${packager.platform.buildConfigurationKey}.forceCodeSigning=false`
}
