import { getAppCacheDir } from "electron-updater/src/AppAdapter"
import { readdir } from "fs-extra"
import path from "path"

/**
 * Pure helpers for the updater knobs of the test app fixture (test/fixtures/test-app/app/index.js) in the blackbox e2e cases. Kept free
 * of the harness' side effects (VM detection, builds) so that they can be unit-tested without a packaged app (blackboxHarnessTest.ts).
 */

/**
 * A host name that electron-updater does not take for loopback (isLoopbackHostname: a plain http feed there needs allowInsecureFeed, and
 * a redirect from it to a loopback host is rejected), while Chromium resolves every `*.localhost` name to loopback without DNS: a feed
 * URL with it reaches the local test server.
 */
export const NOT_LOOPBACK_LOCALHOST_NAME = "eb-e2e.localhost"

/** The updater settings of one launch of the fixture app: each one left out keeps the fixture's own. */
export interface FixtureUpdaterKnobs {
  /** "unset": autoUpdater.crossOriginHeaders stays null (the fixture sets `() => []` otherwise) */
  readonly crossOriginHeaders?: "unset"
  readonly requestHeaders?: Readonly<Record<string, string>>
  /** autoUpdater.addAuthHeader(authHeader), after requestHeaders */
  readonly authHeader?: string
  /** false is passed on, so that it overrides the allowInsecureFeed that launchAndWaitForQuit passes for a feed that is not loopback */
  readonly allowInsecureFeed?: boolean
  /** autoUpdater.publisherName (NSIS) */
  readonly publisherName?: string
  /** "accept": a verifyUpdateFileAuthenticodeSignature that accepts every update and logs the publisher names it got (see authenticodeStubCalls) */
  readonly authenticodeStub?: "accept"
  readonly autoInstallEvent?: "onQuit" | "onNextLaunch" | "manual"
  /** no update check: the launch only runs the install at launch of a pending update, and quits after quitAfterMs when it does not install one */
  readonly pendingOnly?: { readonly quitAfterMs: number }
  /** the downloaded update is queued with quitAndInstall({ waitUntilNextLaunch: true }) instead of installed */
  readonly nextLaunch?: boolean
  /** the updater's debug lines are printed as `[updater debug] …` */
  readonly debugLog?: boolean
}

/** The env of a launch of the fixture app with `knobs`, for the `env` of a launch (launchAndWaitForQuit, updateHop, expectRejectedUpdate). */
export function fixtureEnv(knobs: FixtureUpdaterKnobs): Record<string, string> {
  const values: Record<string, string | undefined> = {
    CROSS_ORIGIN_HEADERS: knobs.crossOriginHeaders,
    REQUEST_HEADERS: knobs.requestHeaders == null ? undefined : JSON.stringify(knobs.requestHeaders),
    AUTH_HEADER: knobs.authHeader,
    ALLOW_INSECURE_FEED: knobs.allowInsecureFeed?.toString(),
    PUBLISHER_NAME: knobs.publisherName,
    AUTHENTICODE_STUB: knobs.authenticodeStub,
    AUTO_INSTALL_EVENT: knobs.autoInstallEvent,
    PENDING_ONLY_QUIT_AFTER_MS: knobs.pendingOnly?.quitAfterMs.toString(),
    NEXT_LAUNCH: knobs.nextLaunch === true ? "true" : undefined,
    DEBUG_LOG: knobs.debugLog === true ? "true" : undefined,
  }
  const env: Record<string, string> = {}
  for (const [name, value] of Object.entries(values)) {
    if (value != null) {
      env[`AUTO_UPDATER_TEST_${name}`] = value
    }
  }
  return env
}

const AUTHENTICODE_STUB_MARKER = "AUTHENTICODE_STUB_CALLED:"

/** Every call of the `authenticodeStub: "accept"` verifier during one launch, in order. */
export function authenticodeStubCalls(stdout: string): Array<{ publisherNames: Array<string> }> {
  return stdout.split(/\r?\n/).flatMap(line => {
    const index = line.indexOf(AUTHENTICODE_STUB_MARKER)
    return index < 0 ? [] : [JSON.parse(line.slice(index + AUTHENTICODE_STUB_MARKER.length))]
  })
}

/** How many times `text` occurs in `stdout`, e.g. a warning that the updater must log once. */
export function countOf(stdout: string, text: string): number {
  return stdout.split(text).length - 1
}

/** The directory that the updater of an app with `updaterCacheDirName` downloads updates to on this machine (not in a VM). */
export function pendingUpdateDir(updaterCacheDirName: string): string {
  return path.join(getAppCacheDir(), updaterCacheDirName, "pending")
}

/**
 * The partly written downloads left in `pendingDir`: electron-updater downloads to `temp-<name>` (`<n>-temp-<name>` when it cannot remove an
 * earlier one) and has to remove it when the download fails. None without the directory.
 */
export async function leftoverPartialDownloads(pendingDir: string): Promise<Array<string>> {
  let names: Array<string>
  try {
    names = await readdir(pendingDir)
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return []
    }
    throw error
  }
  return names.filter(name => /^(\d+-)?temp-/.test(name))
}
