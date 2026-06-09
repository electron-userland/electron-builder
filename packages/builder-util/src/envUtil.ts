import * as path from "path"
import { isEmptyOrSpaces } from "./stringUtil.js"
import { log } from "./log.js"
import { exists } from "./fs.js"
import { stat } from "fs/promises"

/**
 * Validates that a value is safe to embed in a double-quoted shell string.
 * Rejects characters that would be interpreted as shell metacharacters inside `"..."`:
 * `$`, backtick, `"`, `\`, and newlines.
 */
export function validateShellEmbeddable(value: string, fieldName: string): void {
  if (/[$`"\\\n]/.test(value)) {
    throw new Error(
      `${fieldName} contains characters that are not safe in shell scripts: ${JSON.stringify(value)}. ` +
        `Avoid $, backtick, double-quote, backslash, and newline characters.`
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

export async function resolveEnvToolsetPath(envVarKey: string, expectedType: "directory" | "file"): Promise<string | null> {
  const value = resolveEnvShellValue(envVarKey)
  if (value == null) {
    return null
  }
  if (!path.isAbsolute(value)) {
    throw new Error(`${envVarKey} must be an absolute path: ${value}`)
  }
  const p = path.resolve(value)
  if (!(await exists(p))) {
    throw new Error(`${envVarKey} path does not exist: ${p}`)
  }
  const targetStat = await stat(p)
  const targetType = targetStat.isDirectory() ? "directory" : targetStat.isFile() ? "file" : "unknown"
  if (targetType !== expectedType) {
    throw new Error(`${envVarKey} path must be a ${expectedType}, but got ${targetType}: ${p}`)
  }
  log.info({ [envVarKey]: p }, `resolved ${envVarKey} from environment variable`)
  return p
}

export function validateSecuredUrl(url: string): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Not a valid URL: ${url}`)
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`URL must use https:// (got ${parsed.protocol})`)
  }
  return parsed
}

export function parseValidEnvVarUrl(envVarName: string): string | null {
  const url = process.env[envVarName]?.trim()
  if (url == null || url === "") {
    return null
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`${envVarName} is not a valid URL: ${url}`)
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${envVarName} must use https:// (got ${parsed.protocol})`)
  }
  return url
}
