import * as path from "path"
import { isEmptyOrSpaces } from "./stringUtil"
import { log } from "./log"
import { existsSync } from "fs-extra"

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

export function resolveEnvToolsetPath(envVarKey: string): string | null {
  const value = resolveEnvShellValue(envVarKey)
  if (value == null) {
    return null
  }
  if (!path.isAbsolute(value)) {
    throw new Error(`${envVarKey} must be an absolute path: ${value}`)
  }
  const p = path.resolve(value)
  if (!existsSync(p)) {
    throw new Error(`${envVarKey} path does not exist: ${p}`)
  }
  log.info({ envVarKey, value: p }, `resolved value from environment variable`)
  return p
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
