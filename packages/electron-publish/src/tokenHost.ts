import { InvalidConfigurationError, isEmptyOrSpaces } from "builder-util"

/** Comma-separated host names that a publish token from the environment may also be sent to. */
export const PUBLISH_TOKEN_HOSTS_ENV = "ELECTRON_BUILDER_PUBLISH_TOKEN_HOSTS"

export const PUBLISH_TOKEN_HOST_DOCS_URL = "https://www.electron.build/docs/migration/v27-build-changes#publish-tokens-from-the-environment-are-bound-to-the-provider-host"

export type TokenHostProvider = "github" | "gitlab" | "keygen"

// The provider's public hosts, and the variables in which its CI runner reports the host it belongs to.
const PROVIDER_HOSTS: Record<TokenHostProvider, { readonly defaults: ReadonlyArray<string>; readonly ciEnv: ReadonlyArray<string> }> = {
  github: { defaults: ["github.com", "api.github.com", "uploads.github.com"], ciEnv: ["GITHUB_SERVER_URL", "GITHUB_API_URL"] },
  gitlab: { defaults: ["gitlab.com"], ciEnv: ["CI_SERVER_URL", "CI_API_V4_URL"] },
  keygen: { defaults: ["api.keygen.sh"], ciEnv: [] },
}

/** The variables that decide which hosts may receive a token from the environment. They must come from the publishing job, not from a project file. */
export const PUBLISH_TOKEN_HOST_ENV_NAMES: ReadonlyArray<string> = [PUBLISH_TOKEN_HOSTS_ENV, ...Object.values(PROVIDER_HOSTS).flatMap(it => it.ciEnv)]

/**
 * Returns the lower-case host name of a configured `host` option (a name, optionally with a port, and with `allowPath` a path).
 * Only ASCII host name characters, a port and an IPv6 literal are accepted, so user info, a query, a fragment or
 * anything that another URL parser could read differently is rejected. A path (GitLab under a relative URL root) may hold only
 * unreserved characters in non-empty segments, so it cannot change the host. The value is not echoed: user info may hold a password.
 */
export function parseConfiguredHost(host: string, option: string, allowPath = false): string {
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
  return url.hostname
}

/** Whether a token of `provider` taken from the environment may be sent to `hostname`. */
export function isEnvTokenHostAllowed(provider: TokenHostProvider, hostname: string): boolean {
  const { defaults, ciEnv } = PROVIDER_HOSTS[provider]
  if (
    defaults.includes(hostname) ||
    ciEnv.some(name => {
      const value = process.env[name]
      return !isEmptyOrSpaces(value) && URL.parse(value)?.hostname === hostname
    })
  ) {
    return true
  }
  const allowList = process.env[PUBLISH_TOKEN_HOSTS_ENV]
  if (isEmptyOrSpaces(allowList)) {
    return false
  }
  return allowList
    .split(",")
    .map(it => it.trim())
    .filter(it => it.length > 0)
    .some(it => parseConfiguredHost(it, PUBLISH_TOKEN_HOSTS_ENV) === hostname)
}

/** Throws when a token of `provider` taken from the environment variable `envName` may not be sent to `hostname`. */
export function assertEnvTokenHostAllowed(provider: TokenHostProvider, envName: string, hostname: string): void {
  if (isEnvTokenHostAllowed(provider, hostname)) {
    return
  }
  throw new InvalidConfigurationError(
    `Since electron-builder 27, a publish token from the environment is sent only to its provider's host: ${envName} is not sent to "${hostname}". ` +
      `To publish to this host, add "${hostname}" to the ${PUBLISH_TOKEN_HOSTS_ENV} environment variable of the publishing job. See ${PUBLISH_TOKEN_HOST_DOCS_URL}`
  )
}
