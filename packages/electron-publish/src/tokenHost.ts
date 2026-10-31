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

/**
 * Returns the lower-case host name of a configured `host` option (a name, optionally with a port).
 * User info, a path, a query or a fragment is rejected. The value is not echoed: user info may hold a password.
 */
export function parseConfiguredHost(host: string, option: string): string {
  const url = /[/\\?#@\s]/.test(host) ? null : URL.parse(`https://${host}`)
  if (url == null || url.hostname === "") {
    throw new InvalidConfigurationError(`${option} must be a host name, optionally with a port (e.g. "git.example.com:8443"), without user info, path, query or fragment`)
  }
  return url.hostname
}

/** Whether a token of `provider` taken from the environment may be sent to `hostname`. */
export function isEnvTokenHostAllowed(provider: TokenHostProvider, hostname: string): boolean {
  const { defaults, ciEnv } = PROVIDER_HOSTS[provider]
  if (defaults.includes(hostname) || ciEnv.some(name => urlHostname(process.env[name]) === hostname)) {
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

function urlHostname(value: string | undefined): string | null {
  return isEmptyOrSpaces(value) ? null : (URL.parse(value)?.hostname ?? null)
}
