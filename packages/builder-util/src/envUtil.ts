import { isEmptyOrSpaces } from "./stringUtil.js"

/**
 * Validates that a value is safe to embed in a double-quoted shell string.
 * Rejects characters that would be interpreted as shell metacharacters inside `"..."`:
 * `$`, backtick, `"`, `\`, and newlines.
 */
export function validateShellEmbeddable(value: string, fieldName: string): void {
  if (/[$`"\\\n]/.test(value)) {
    throw new Error(
      `${fieldName} contains characters that are not safe in shell scripts: ${JSON.stringify(value)}. ` + `Avoid $, backtick, double-quote, backslash, and newline characters.`
    )
  }
}

export function resolveEnvShellValue(envVarName: string): string | null {
  const rawValue = process.env[envVarName]
  if (isEmptyOrSpaces(rawValue)) {
    return null
  }
  const trimmed = rawValue.trim()
  // On Windows, backslash is the native path separator and must not be rejected
  const shellUnsafeChars = process.platform === "win32" ? /[;&|`$<>"']/ : /[;&|`$<>"'\\]/
  if (shellUnsafeChars.test(trimmed)) {
    throw new Error(`${envVarName} contains shell-unsafe characters: ${trimmed}`)
  }
  return trimmed
}

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"])

export function parseValidEnvVarUrl(envVarName: string, allowHttp: boolean = false): string | null {
  const url = process.env[envVarName]?.trim()
  if (url == null || url === "") {
    return null
  }
  try {
    validateSecuredUrl(url, allowHttp)
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.startsWith("Not a valid URL:")) {
        throw new Error(`${envVarName} is not a valid URL`)
      }
      // Re-throw https/protocol errors with env var name instead of URL
      throw new Error(e.message.replace(url, envVarName))
    }
    throw e
  }
  return url
}

export function validateSecuredUrl(url: string, allowHttp: boolean = false): URL {
  const httpOverride = process.env["ELECTRON_BUILDER_DANGEROUSLY_ALLOW_HTTP"] === "true" || allowHttp
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Not a valid URL: ${url}`)
  }
  if (parsed.protocol !== "https:") {
    // Always permit plain HTTP to loopback addresses (local dev / air-gapped CI mirrors
    // running on the build machine itself).  For any other host, require opt-in.
    const isLocalhost = parsed.protocol === "http:" && LOCALHOST_HOSTNAMES.has(parsed.hostname)
    if (!isLocalhost && !httpOverride) {
      throw new Error(`${url} must use https:// (got ${parsed.protocol}). For non-localhost HTTP mirrors, force set ELECTRON_BUILDER_DANGEROUSLY_ALLOW_HTTP=true`)
    }
  }
  return parsed
}
