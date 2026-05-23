import { isEmptyOrSpaces, log } from "builder-util"
import * as path from "path"

export function validateEnvValue(envVarName: string): string | null {
  const rawValue = process.env[envVarName]
  if (isEmptyOrSpaces(rawValue)) {
    return null
  }
  const trimmed = rawValue.trim()
  if (/[;&|`$<>"'\\]/.test(trimmed)) {
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