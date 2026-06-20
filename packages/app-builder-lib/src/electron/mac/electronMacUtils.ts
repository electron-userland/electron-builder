import { InvalidConfigurationError } from "builder-util"

/**
 * At runtime Electron locates its helper apps relative to the main application name, resolving each
 * one as `${CFBundleName} Helper.app` (see `electron_main_delegate_mac.mm`). electron-builder writes
 * both `CFBundleName` and the on-disk helper bundles from the (sanitized) product name, so the two
 * are kept identical by construction.
 *
 * A name that contains a path separator or a null byte can never be represented as a bundle
 * directory, so it can only ever diverge from `CFBundleName` after sanitization. Reject it up front
 * with a clear error instead of silently producing a bundle whose helpers cannot be discovered.
 */
export function assertSafeHelperName(name: string, field: string): void {
  // eslint-disable-next-line no-control-regex
  if (/[/\\\x00]/.test(name)) {
    throw new InvalidConfigurationError(`${field} "${name}" must not contain path separators ("/", "\\") or null bytes`)
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
