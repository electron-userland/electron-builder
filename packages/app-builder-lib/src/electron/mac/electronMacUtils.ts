import { InvalidConfigurationError } from "builder-util"
import { sanitizeFileName } from "builder-util/internal"

/**
 * At runtime Electron locates its helper apps relative to the main application name, resolving each
 * one as `${CFBundleName} Helper.app` (see `electron_main_delegate_mac.mm`). electron-builder uses
 * the product name verbatim for both `CFBundleName` and the on-disk helper/app bundle names, so the
 * name must be usable as a filename without modification.
 *
 * If the name would be altered by filename sanitization, the on-disk bundle (sanitized) and
 * `CFBundleName` (verbatim) would diverge and break helper discovery. Reject such names up front with
 * a clear error so the user can choose a valid name, rather than silently changing it for them.
 */
export function assertSafeHelperName(name: string, field: string): void {
  const sanitized = sanitizeFileName(name)
  if (sanitized !== name) {
    throw new InvalidConfigurationError(
      `${field} "${name}" is not a valid macOS app bundle name (it would be sanitized to "${sanitized}"). Set a ${field} that requires no filename sanitization.`
    )
  }
}

export interface AvailableHelpers {
  EH?: boolean
  NP?: boolean
  Renderer?: boolean
  Plugin?: boolean
  GPU?: boolean
}

/**
 * Returns the helper bundle suffixes present in the current Electron distribution. The generic
 * `" Helper"` bundle is always present; the remaining variants vary by Electron version.
 */
export function getAvailableHelperSuffixes(present: AvailableHelpers): string[] {
  const result = [" Helper"]
  if (present.EH) {
    result.push(" Helper EH")
  }
  if (present.NP) {
    result.push(" Helper NP")
  }
  if (present.Renderer) {
    result.push(" Helper (Renderer)")
  }
  if (present.Plugin) {
    result.push(" Helper (Plugin)")
  }
  if (present.GPU) {
    result.push(" Helper (GPU)")
  }
  return result
}

/**
 * Adds the App Transport Security entries that electron-updater's local update proxy needs: local networking, and
 * plain-HTTP exceptions for `localhost` and `127.0.0.1`.
 *
 * `NSAllowsArbitraryLoads` is set to `true` only when the app has not set it already, for example through
 * `mac.extendInfo`, so an explicit `false` is kept.
 */
export function configureLocalhostAts(appPlist: any): void {
  // https://bencoding.com/2015/07/20/app-transport-security-and-localhost/
  let ats = appPlist.NSAppTransportSecurity
  if (ats == null) {
    ats = {}
    appPlist.NSAppTransportSecurity = ats
  }

  ats.NSAllowsLocalNetworking = true
  // https://github.com/electron-userland/electron-builder/issues/3377#issuecomment-446035814
  if (ats.NSAllowsArbitraryLoads == null) {
    ats.NSAllowsArbitraryLoads = true
  }

  let exceptionDomains = ats.NSExceptionDomains
  if (exceptionDomains == null) {
    exceptionDomains = {}
    ats.NSExceptionDomains = exceptionDomains
  }

  if (exceptionDomains.localhost == null) {
    const allowHttp = {
      NSTemporaryExceptionAllowsInsecureHTTPSLoads: false,
      NSIncludesSubdomains: false,
      NSTemporaryExceptionAllowsInsecureHTTPLoads: true,
      NSTemporaryExceptionMinimumTLSVersion: "1.0",
      NSTemporaryExceptionRequiresForwardSecrecy: false,
    }
    exceptionDomains.localhost = allowHttp
    exceptionDomains["127.0.0.1"] = allowHttp
  }
}
