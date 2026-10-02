import { fromIni } from "@aws-sdk/credential-provider-ini"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

export interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

function parseIniSection(content: string, sectionName: string): Record<string, string> | null {
  let inSection = false
  let found = false
  const result: Record<string, string> = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith("[")) {
      const name = line.slice(1, line.indexOf("]")).trim()
      inSection = name === sectionName
      if (inSection) {
        found = true
      }
    } else if (inSection && line && !line.startsWith("#") && !line.startsWith(";")) {
      const eq = line.indexOf("=")
      if (eq > 0) {
        result[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
      }
    }
  }

  return found ? result : null
}

/**
 * Resolves AWS credentials using the standard provider chain:
 *   1. Environment variables (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
 *   2. Shared credentials file (~/.aws/credentials, respects AWS_PROFILE)
 *
 * Returns undefined when no credentials are found — callers should let aws4 sign
 * with anonymous credentials or throw a descriptive error as appropriate.
 */
export function resolveAwsCredentials(): AwsCredentials | undefined {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
    }
  }

  try {
    const profile = process.env.AWS_PROFILE ?? "default"
    const credsPath = process.env.AWS_SHARED_CREDENTIALS_FILE || path.join(os.homedir(), ".aws", "credentials")
    const raw = fs.readFileSync(credsPath, "utf8")
    const section = parseIniSection(raw, profile)
    if (section?.aws_access_key_id && section?.aws_secret_access_key) {
      return {
        accessKeyId: section.aws_access_key_id,
        secretAccessKey: section.aws_secret_access_key,
        sessionToken: section.aws_session_token || undefined,
      }
    }
  } catch {
    // file absent or unreadable — fall through
  }

  return undefined
}

/** Resolve shared-config profiles, including IAM Identity Center sessions. */
export async function resolveAwsCredentialsForS3(): Promise<AwsCredentials | undefined> {
  const credentials = resolveAwsCredentials()
  if (credentials || process.env.AWS_SDK_LOAD_CONFIG !== "1") {
    return credentials
  }

  // The provider handles SSO token caches, credential_process and role profiles.
  // Do not hide a configured profile's failure behind anonymous signing.
  const profile = process.env.AWS_PROFILE ?? "default"
  const configPath = process.env.AWS_CONFIG_FILE || path.join(os.homedir(), ".aws", "config")
  try {
    const section = profile === "default" ? "default" : `profile ${profile}`
    if (!parseIniSection(fs.readFileSync(configPath, "utf8"), section)) {
      return undefined
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined
    }
    throw error
  }
  const resolved = await fromIni({ profile })()
  return {
    accessKeyId: resolved.accessKeyId,
    secretAccessKey: resolved.secretAccessKey,
    sessionToken: resolved.sessionToken,
  }
}
