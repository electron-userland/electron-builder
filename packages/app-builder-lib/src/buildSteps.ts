import { Arch, InvalidConfigurationError, MAX_FILE_REQUESTS } from "builder-util"
import { CancellationToken, Nullish } from "builder-util-runtime"
import type { Configuration } from "./configuration.js"
import { Platform, Target } from "./core.js"
import { assertElectronArchSupported } from "./electron/electronArchSupport.js"
import { Framework, isElectronBased } from "./Framework.js"
import type { BuildHost } from "./targets/targetFactory.js"

// The steps of `Packager.doBuild` that need no packager, so each can be tested on its own.

/** Throws when `host` cannot build `platform` (macOS on Windows). */
export function assertPlatformBuildableOnHost(platform: Platform, host: Pick<BuildHost, "platform"> = process): void {
  if (platform === Platform.MAC && host.platform === Platform.WINDOWS.nodeName) {
    throw new InvalidConfigurationError("Build for macOS is supported only on macOS, please see https://electron.build/docs/features/multi-platform-build")
  }
}

export interface ArchSupportContext {
  readonly prepackaged: string | Nullish
  readonly framework: Pick<Framework, "name" | "version">
  readonly config: Configuration
}

/**
 * Fails fast when the requested arch has no official Electron build anymore (Electron 44 removed win32-ia32 and linux-armv7l);
 * skipped for prepackaged apps since nothing is downloaded then, and for other frameworks.
 */
export function assertArchSupported(platform: Platform, arch: Arch, context: ArchSupportContext): void {
  if (context.prepackaged == null && isElectronBased(context.framework)) {
    assertElectronArchSupported(platform, arch, context.framework.version, context.config)
  }
}

export interface PoolCount {
  /** How many archs of a platform are packed at once. */
  readonly poolCount: number
  /** `concurrency.jobs`, rounded down. */
  readonly requested: number
  /** `invalid`: below 1, so 1 is used; `aboveMaxFileRequests`: used, but may run out of file descriptors. */
  readonly warning: "invalid" | "aboveMaxFileRequests" | null
}

/** The pack concurrency for `concurrency.jobs` (1 when unset). */
export function resolvePoolCount(jobs: number | Nullish): PoolCount {
  const requested = Math.floor(jobs || 1)
  if (requested < 1) {
    return { poolCount: 1, requested, warning: "invalid" }
  }
  return { poolCount: requested, requested, warning: requested > MAX_FILE_REQUESTS ? "aboveMaxFileRequests" : null }
}

/**
 * The targets of a packed platform whose build is to be finished, in order: `async` ones can finish while other platforms are packed,
 * `sync` ones one after another once every platform is packed. `isSkipped` leaves out targets the test hook skipped.
 */
export function partitionTargetsToFinish(targets: Iterable<Target>, isSkipped: (target: Target) => boolean): { readonly async: Array<Target>; readonly sync: Array<Target> } {
  const async: Array<Target> = []
  const sync: Array<Target> = []
  for (const target of targets) {
    if (isSkipped(target)) {
      continue
    }
    if (target.isAsyncSupported) {
      async.push(target)
    } else {
      sync.push(target)
    }
  }
  return { async, sync }
}

/** Runs `actions` one after another, starting none once the build is cancelled. */
export async function runUntilCancelled(actions: Iterable<() => Promise<unknown>>, cancellationToken: Pick<CancellationToken, "cancelled">): Promise<void> {
  for (const action of actions) {
    if (cancellationToken.cancelled) {
      break
    }
    await action()
  }
}
