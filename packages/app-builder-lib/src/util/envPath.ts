import { isEmptyOrSpaces, log } from "builder-util"
import * as path from "path"

export function validateEnvValue(envVarName: string): string | null {
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

export function resolveEnvToolsetPath(envVarKey: string): string | null {
  const value = validateEnvValue(envVarKey)
  if (value == null) {
    return null
  }
  log.info({ envVarKey, value }, `resolved value from environment variable`)
  return path.resolve(value)
}