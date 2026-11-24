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
