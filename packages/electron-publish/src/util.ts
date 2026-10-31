import { InvalidConfigurationError, isEmptyOrSpaces, isTokenCharValid, log } from "builder-util"
import { hashSensitiveValue } from "builder-util-runtime"

export const trimStringWithWarn = (str: string, maxLength: number, warnMessage: string): string => {
  if (str.length <= maxLength) {
    return str
  }
  log.warn({ length: str.length, maxLength }, warnMessage)
  return str.substring(0, maxLength)
}

// Shared by the GitHub/GitLab publishers: validates an already-resolved personal access token (not-set guard,
// trim, character validity). Token RESOLUTION (which env vars, precedence) stays at the call site since it differs
// per provider. `providerName`/`envHint` parameterize the otherwise-identical error messages.
export function validateResolvedToken(token: string | null | undefined, providerName: string, envHint: string): string {
  if (isEmptyOrSpaces(token)) {
    throw new InvalidConfigurationError(`${providerName} Personal Access Token is not set, neither programmatically, nor using env "${envHint}"`)
  }

  const trimmed = token.trim()

  if (!isTokenCharValid(trimmed)) {
    throw new InvalidConfigurationError(`${providerName} Personal Access Token ${hashSensitiveValue(trimmed)} contains invalid characters, please check env "${envHint}"`)
  }

  return trimmed
}

/**
 * Validates a configured `host` option: an ASCII host name (punycode for an internationalized name), an IPv6 literal, an optional port
 * and, with `allowPath` (GitLab under a relative URL root), a path of non-empty segments of unreserved characters.
 * User info, a query, a fragment, a backslash, `%` and anything else another URL parser could read differently are rejected.
 * The value is not echoed: user info may hold a password.
 */
export function validateConfiguredHost(host: string, option: string, allowPath = false): void {
  const pathStart = allowPath ? host.indexOf("/") : -1
  const authority = pathStart === -1 ? host : host.substring(0, pathStart)
  const path = pathStart === -1 ? "" : host.substring(pathStart)
  const url = /^[A-Za-z0-9.:[\]-]+$/.test(authority) && /^(\/[A-Za-z0-9._~-]+)*\/?$/.test(path) ? URL.parse(`https://${authority}`) : null
  if (url == null || url.hostname === "") {
    const shape = allowPath
      ? 'optionally with a port and a path (e.g. "git.example.com:8443/gitlab"), without user info, query or fragment'
      : 'optionally with a port (e.g. "git.example.com:8443"), without user info, path, query or fragment'
    throw new InvalidConfigurationError(`${option} must be a host name in ASCII (punycode for an internationalized name), ${shape}`)
  }
}
