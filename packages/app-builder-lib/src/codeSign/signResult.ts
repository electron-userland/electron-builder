/**
 * The subset of {@link SigningResult} a sign manager's single sign attempt can produce
 * (e.g. Windows `SignManager.signFile`). Failures are always thrown, never returned:
 * - `signed` — the configured signing tooling signed the file/app itself
 * - `signed:custom` — a custom `sign` hook did the signing
 * - `skipped:no-certificate` — nothing to sign with (no certificate configured / no signing identity found, and no custom `sign` hook)
 */
export type SignFileResult = "signed" | "signed:custom" | "skipped:no-certificate"

/**
 * Result of a signing operation, unified across the platform packagers' signing logic
 * ({@link SignFileResult} extended with the skip reasons that are decided before any signing
 * tooling is invoked). Failures are always thrown, never returned:
 * - `skipped:filtered` — the file does not match the signing filters (e.g. the Windows `signExts` filter)
 * - `skipped:disabled` — signing is explicitly disabled (`win.sign: false`/`null`, or macOS `sign`/`sign.identity` set to `null`)
 * - `skipped:unsupported` — signing is not possible in this build environment (e.g. macOS signing on a non-mac host,
 *   or the pull-request CI guard) or is not implemented by this platform packager (the base `PlatformPackager.signApp`, e.g. Linux)
 */
export type SigningResult = SignFileResult | "skipped:filtered" | "skipped:disabled" | "skipped:unsupported"

export function isSignResultSigned(result: SigningResult): result is "signed" | "signed:custom" {
  return result === "signed" || result === "signed:custom"
}

/**
 * Folds per-file sign results into the single result `signApp` reports: any signed result wins
 * (the `afterSign` hook must fire when at least one file was actually signed); otherwise the first
 * skip reason is returned. An empty set means no file matched the signing filters at all.
 */
export function combineSignResults(results: Array<SigningResult>): SigningResult {
  return results.find(isSignResultSigned) ?? results[0] ?? "skipped:filtered"
}
