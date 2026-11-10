// if baseUrl path doesn't ends with /, this path will be not prepended to passed pathname for new URL(input, base)
import { CancellationError, CancellationToken, HttpExecutor } from "builder-util-runtime"
import { URL } from "url"
import type { Logger, NonThrowableLogger } from "./types.js"

/** @internal */
export function newBaseUrl(url: string): URL {
  const result = new URL(url)
  if (!result.pathname.endsWith("/")) {
    result.pathname += "/"
  }
  return result
}

// addRandomQueryToAvoidCaching is false by default because in most cases URL already contains version number,
// so, it makes sense only for Generic Provider for channel files
export function newUrlFromBase(pathname: string, baseUrl: URL, addRandomQueryToAvoidCaching = false): URL {
  const result = new URL(pathname, baseUrl)
  // a URL on another origin (e.g. an absolute URL in the update manifest) keeps its own query; the base query is only added on the base
  // origin, with the same rule as the credential headers (an http → https upgrade of the same host keeps it)
  if (HttpExecutor.isCrossOrigin(baseUrl, result)) {
    return result
  }
  // search is not propagated (search is an empty string if not specified)
  const search = baseUrl.search
  if (search != null && search.length !== 0) {
    result.search = search
  } else if (addRandomQueryToAvoidCaching) {
    result.search = `noCache=${Date.now().toString(32)}`
  }
  return result
}

export function getChannelFilename(channel: string): string {
  return `${channel}.yml`
}

/** Calls `log`, ignoring an exception it throws: a throwing logger must not break the caller. */
function ignoreErrors(log: () => void): void {
  try {
    log()
  } catch (_ignored) {
    // a throwing logger must not break the caller
  }
}

/**
 * `logger` with every call made safe: a call that throws is ignored, so logging can never change how a download ends (a throw
 * would otherwise escape from a stream callback, or stop the fallback to a full download). `debug` is always present, and does
 * nothing when `logger` has none.
 * @internal
 */
export function nonThrowingLogger(logger: Logger): NonThrowableLogger {
  const result: NonThrowableLogger = {
    ...nonThrowingAppLogger(logger),
    debug: message => ignoreErrors(() => logger.debug?.(message)),
  }
  return result
}

/**
 * `logger` with every call made safe like {@link nonThrowingLogger}, but keeping its shape: `debug` is only present when `logger`
 * has one, so a log limiter wrapping it still sees that the app's logger drops debug messages and does not use up its quota on them.
 * @internal
 */
export function nonThrowingAppLogger(logger: Logger): Logger {
  const result: Logger = {
    info: message => ignoreErrors(() => logger.info(message)),
    warn: message => ignoreErrors(() => logger.warn(message)),
    error: message => ignoreErrors(() => logger.error(message)),
  }
  if (hasDebug(logger)) {
    result.debug = message => ignoreErrors(() => logger.debug?.(message))
  }
  return result
}

/** Whether `logger` has a `debug()` method; a logger whose property access throws counts as having none. */
function hasDebug(logger: Logger): boolean {
  try {
    return typeof logger.debug === "function"
  } catch (_ignored) {
    return false
  }
}

/**
 * A differential download that failed because the user cancelled it must surface as a cancellation, not fall back to a
 * full download: rethrows a {@link CancellationError}, or throws one when the token was cancelled and the failure is a
 * side effect of that (e.g. an aborted request). Returns normally for any other failure.
 * @internal
 */
export function throwIfCancelled(error: unknown, cancellationToken: CancellationToken): void {
  if (error instanceof CancellationError) {
    throw error
  }
  if (cancellationToken.cancelled) {
    throw new CancellationError()
  }
}
