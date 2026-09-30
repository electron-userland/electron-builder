import { InvalidConfigurationError } from "builder-util"
import type { S3AwsCredentialsOptions } from "builder-util-runtime"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

export interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  /** When the credentials stop being valid (temporary credentials only). */
  expiration?: Date
}

const DEFAULT_ENV_NAMES = { accessKeyId: "AWS_ACCESS_KEY_ID", secretAccessKey: "AWS_SECRET_ACCESS_KEY", sessionToken: "AWS_SESSION_TOKEN" }

/** Credentials this close to their expiration are resolved again instead of being reused. */
const EXPIRATION_MARGIN_MS = 60 * 1000

/** The most `role_arn` + `source_profile` hops a `source: "sso-role-chain"` profile may chain before its SSO profile. */
export const MAX_ROLE_CHAIN_HOPS = 5

/** STS region when the named role profile sets no `region` (the AWS SDK's AssumeRole default). `AWS_REGION` is never read. */
const DEFAULT_STS_REGION = "us-east-1"

/**
 * Loaders for the AWS SDK credential providers and the STS client. They are imported only when a non-static
 * `source: "profile"` profile or a `source: "sso-role-chain"` profile is resolved, so builds that don't need them
 * never load the SDK. Exported so tests can observe and stub them.
 */
export const awsSdkLoaders: {
  ini: () => Promise<typeof import("@aws-sdk/credential-provider-ini")>
  sso: () => Promise<typeof import("@aws-sdk/credential-provider-sso")>
  sts: () => Promise<typeof import("@aws-sdk/nested-clients/sts")>
} = {
  ini: () => import("@aws-sdk/credential-provider-ini"),
  sso: () => import("@aws-sdk/credential-provider-sso"),
  sts: () => import("@aws-sdk/nested-clients/sts"),
}

type IniData = Record<string, Record<string, string>>

/**
 * Parses an AWS shared config/credentials file the way the AWS SDK does: `[profile name]` and `[profile "name"]`
 * headers are normalized to `name` (config file only), `[profile default]` is the `default` profile, and full-line
 * or inline `#` / `;` comments (preceded by whitespace) are stripped. Nested (indented) sub-sections are ignored.
 */
export function parseAwsIni(content: string, isConfigFile: boolean): { profiles: IniData; ssoSessions: IniData } {
  const profiles: IniData = Object.create(null)
  const ssoSessions: IniData = Object.create(null)
  let current: Record<string, string> | null = null
  let inSubSection = false

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.split(/(^|\s)[;#]/)[0].trim()
    if (line.length === 0) {
      continue
    }

    const header = /^\[([^[\]]+)]$/.exec(line)
    if (header != null) {
      current = null
      inSubSection = false
      const name = header[1].trim()
      const prefixed = /^([\w-]+)\s+(["']?)(.+)\2$/.exec(name)
      let target: IniData | null = null
      let key = name
      if (prefixed == null) {
        // the config file has no unprefixed profiles except `[default]`
        target = !isConfigFile || name === "default" ? profiles : null
      } else if (isConfigFile && prefixed[1] === "profile") {
        target = profiles
        key = prefixed[3]
      } else if (isConfigFile && prefixed[1] === "sso-session") {
        target = ssoSessions
        key = prefixed[3]
      } else if (!isConfigFile) {
        target = profiles
      }
      if (target != null && key !== "__proto__") {
        current = target[key] ??= Object.create(null)
      }
      continue
    }

    if (current == null) {
      continue
    }
    const eq = line.indexOf("=")
    if (eq <= 0) {
      continue
    }
    const name = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (value === "") {
      // start of a nested sub-section (e.g. `s3 =` followed by indented keys) — not used for credentials
      inSubSection = true
      continue
    }
    if (inSubSection && rawLine.trimStart() !== rawLine) {
      continue
    }
    inSubSection = false
    current[name] = value
  }
  return { profiles, ssoSessions }
}

function expandHome(file: string): string {
  return file.startsWith("~/") || file.startsWith("~\\") ? path.join(os.homedir(), file.slice(2)) : path.resolve(file)
}

async function readOptionalFile(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8")
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return null
    }
    throw e
  }
}

function resolveFromEnv(options: S3AwsCredentialsOptions): AwsCredentials {
  const names = options.env ?? DEFAULT_ENV_NAMES
  const accessKeyId = process.env[names.accessKeyId]
  const secretAccessKey = process.env[names.secretAccessKey]
  if (!accessKeyId || !secretAccessKey) {
    const missing = [accessKeyId ? null : names.accessKeyId, secretAccessKey ? null : names.secretAccessKey].filter(it => it != null)
    throw new InvalidConfigurationError(
      `S3 publishing requires AWS credentials, but ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} not set. ` +
        `Set them ("awsCredentials.source" is "env"), or use a shared config profile (IAM Identity Center/SSO, credential_process, assume-role, static keys) with ` +
        `"awsCredentials": { "source": "profile", "profile": "<name>" }. AWS_PROFILE, AWS_SDK_LOAD_CONFIG and the ~/.aws files are not read implicitly.`
    )
  }
  const sessionToken = names.sessionToken == null ? undefined : process.env[names.sessionToken]
  return { accessKeyId, secretAccessKey, sessionToken: sessionToken || undefined }
}

/** Merges the two files like the AWS SDK does: per profile, keys from the credentials file win. */
function mergeProfiles(fromConfigFile: IniData, fromCredentialsFile: IniData): IniData {
  const result: IniData = Object.create(null)
  for (const name of new Set([...Object.keys(fromConfigFile), ...Object.keys(fromCredentialsFile)])) {
    result[name] = { ...fromConfigFile[name], ...fromCredentialsFile[name] }
  }
  return result
}

function isStaticProfile(profile: Record<string, string>): boolean {
  return !!profile.aws_access_key_id && !!profile.aws_secret_access_key
}

/** Follows an assume-role `source_profile` chain the way the AWS SDK does and returns the SSO profile it ends at, if any. */
function findSsoSourceProfile(profiles: IniData, profileName: string): string | null {
  const visited = new Set([profileName])
  let current = profiles[profileName]
  while (current != null && isAssumeRoleProfile(current) && current.source_profile != null) {
    const sourceName = current.source_profile
    const source = profiles[sourceName]
    if (source == null || visited.has(sourceName) || isStaticProfile(source)) {
      // missing or cyclic profiles are reported by the SDK; static source keys win over everything else in a chain
      return null
    }
    visited.add(sourceName)
    if (!isAssumeRoleProfile(source) && source.web_identity_token_file == null && source.credential_process == null && isSsoProfile(source)) {
      return sourceName
    }
    current = source
  }
  return null
}

function isAssumeRoleProfile(profile: Record<string, string>): boolean {
  return profile.role_arn != null && (profile.source_profile != null || profile.credential_source != null)
}

function isSsoProfile(profile: Record<string, string>): boolean {
  return ["sso_start_url", "sso_account_id", "sso_session", "sso_region", "sso_role_name"].some(key => profile[key] != null)
}

interface LoadedProfiles {
  profileName: string
  profiles: IniData
  filepath: string
  configFilepath: string
}

/** Reads the configured (or ~/.aws default) files — never AWS_SHARED_CREDENTIALS_FILE / AWS_CONFIG_FILE — and checks the named profile exists. */
async function loadProfiles(options: S3AwsCredentialsOptions): Promise<LoadedProfiles> {
  // presence is checked by validateS3CredentialsOptions
  const profileName = options.profile!.trim()

  const filepath = expandHome(options.credentialsFile ?? "~/.aws/credentials")
  const configFilepath = expandHome(options.configFile ?? "~/.aws/config")
  const [credentialsContent, configContent] = await Promise.all([readOptionalFile(filepath), readOptionalFile(configFilepath)])
  const profiles = mergeProfiles(
    configContent == null ? {} : parseAwsIni(configContent, true).profiles,
    credentialsContent == null ? {} : parseAwsIni(credentialsContent, false).profiles
  )
  if (profiles[profileName] == null) {
    throw new InvalidConfigurationError(
      `AWS profile "${profileName}" was not found in ${filepath} or ${configFilepath} (set "awsCredentials.credentialsFile" / "awsCredentials.configFile" to use other files)`
    )
  }
  return { profileName, profiles, filepath, configFilepath }
}

/** fromSSO options that keep the SSO client on the configured profile and files, with no AWS_ENDPOINT_URL* / endpoint_url redirection. */
function explicitSsoInit(profile: string, filepath: string, configFilepath: string) {
  return { profile, filepath, configFilepath, clientConfig: { ignoreConfiguredEndpointUrls: true }, parentClientConfig: { profile } }
}

type StsModule = Awaited<ReturnType<(typeof awsSdkLoaders)["sts"]>>
type AssumeRoleInput = { RoleArn: string; RoleSessionName: string; ExternalId?: string; DurationSeconds?: number; SerialNumber?: string; TokenCode?: string }

interface StsSettings {
  profileName: string
  region: string
  useGlobalEndpoint: boolean
}

/** Like the AWS SDK's fromIni, AssumeRole uses the named profile's `region` (else us-east-1) and `sts_regional_endpoints` — never AWS_REGION. */
function stsSettings(profileName: string, namedProfile: Record<string, string>): StsSettings {
  const stsRegionalEndpoints = namedProfile.sts_regional_endpoints?.trim().toLowerCase()
  if (stsRegionalEndpoints != null && stsRegionalEndpoints !== "regional" && stsRegionalEndpoints !== "legacy") {
    throw new InvalidConfigurationError(
      `AWS profile "${profileName}" has an invalid sts_regional_endpoints: ${JSON.stringify(namedProfile.sts_regional_endpoints)} (expected "regional" or "legacy")`
    )
  }
  return { profileName, region: namedProfile.region?.trim() || DEFAULT_STS_REGION, useGlobalEndpoint: stsRegionalEndpoints === "legacy" }
}

/**
 * Returns an STS AssumeRole function whose client gets every setting explicitly: credentials, region, endpoint mode, FIPS / dual-stack,
 * defaults mode, retries, auth scheme preference and app id, with configured endpoint URLs ignored. So it reads neither
 * AWS_REGION / AWS_ENDPOINT_URL* / other AWS_* variables nor AWS_CONFIG_FILE / AWS_PROFILE for them.
 */
function explicitRoleAssumer(sts: StsModule, settings: StsSettings) {
  return async (source: AwsCredentials, input: AssumeRoleInput): Promise<AwsCredentials> => {
    const client = new sts.STSClient({
      credentials: { accessKeyId: source.accessKeyId, secretAccessKey: source.secretAccessKey, sessionToken: source.sessionToken },
      region: settings.region,
      profile: settings.profileName,
      useGlobalEndpoint: settings.useGlobalEndpoint,
      useFipsEndpoint: false,
      useDualstackEndpoint: false,
      ignoreConfiguredEndpointUrls: true,
      defaultsMode: "standard",
      retryMode: "standard",
      maxAttempts: 3,
      authSchemePreference: [],
      userAgentAppId: () => Promise.resolve(undefined),
    })
    try {
      const { Credentials: assumed } = await client.send(new sts.AssumeRoleCommand(input))
      if (assumed?.AccessKeyId == null || assumed.SecretAccessKey == null) {
        throw new Error(`STS returned no credentials for ${input.RoleArn}`)
      }
      return { accessKeyId: assumed.AccessKeyId, secretAccessKey: assumed.SecretAccessKey, sessionToken: assumed.SessionToken, expiration: assumed.Expiration }
    } finally {
      client.destroy()
    }
  }
}

async function resolveFromProfile(options: S3AwsCredentialsOptions): Promise<AwsCredentials> {
  const { profileName, profiles, filepath, configFilepath } = await loadProfiles(options)
  const profile = profiles[profileName]

  if (isStaticProfile(profile) && !isAssumeRoleProfile(profile)) {
    return { accessKeyId: profile.aws_access_key_id, secretAccessKey: profile.aws_secret_access_key, sessionToken: profile.aws_session_token || undefined }
  }

  const ssoSourceProfile = findSsoSourceProfile(profiles, profileName)
  if (ssoSourceProfile != null) {
    // fromIni resolves an SSO source_profile through fromSSO without the configured file paths, i.e. from AWS_CONFIG_FILE or
    // ~/.aws/config. Refuse rather than let the SDK pick credentials from files the configuration did not name.
    throw new InvalidConfigurationError(
      `AWS profile "${profileName}" assumes a role with credentials from the IAM Identity Center (SSO) profile "${ssoSourceProfile}" (source_profile), ` +
        `which "awsCredentials.source": "profile" does not resolve (the AWS SDK would read that SSO profile without the configured files). ` +
        `Set "awsCredentials": { "source": "sso-role-chain", "profile": "${profileName}" } to resolve the chain with the configured files, ` +
        `or use an SSO profile that grants the publishing role directly ("sso_role_name").`
    )
  }

  // Explicit profile and file paths so the SDK never falls back to AWS_PROFILE / AWS_CONFIG_FILE / AWS_SHARED_CREDENTIALS_FILE,
  // no AWS_ENDPOINT_URL* / endpoint_url redirection of the SSO calls, and the nested STS client reads its (non-credential)
  // settings from the named profile rather than from AWS_PROFILE.
  const init = explicitSsoInit(profileName, filepath, configFilepath)
  const assumeRoleSettings = isAssumeRoleProfile(profile) ? stsSettings(profileName, profile) : null
  let resolved: AwsCredentials
  try {
    if (!isAssumeRoleProfile(profile) && profile.credential_process == null && profile.web_identity_token_file == null && isSsoProfile(profile)) {
      // fromIni drops filepath/configFilepath when it delegates to fromSSO, so call fromSSO directly
      const { fromSSO } = await awsSdkLoaders.sso()
      resolved = await fromSSO(init)()
    } else {
      const { fromIni } = await awsSdkLoaders.ini()
      // fromIni's own STS client drops clientConfig (it would honour AWS_ENDPOINT_URL* and read AWS_CONFIG_FILE settings), so assume
      // roles with the explicitly configured client instead
      resolved = await fromIni(assumeRoleSettings == null ? init : { ...init, roleAssumer: explicitRoleAssumer(await awsSdkLoaders.sts(), assumeRoleSettings) })()
    }
  } catch (e: any) {
    throw new Error(`Cannot resolve AWS credentials for profile "${profileName}" (${configFilepath}, ${filepath}): ${e?.message ?? e}`, { cause: e })
  }
  return { accessKeyId: resolved.accessKeyId, secretAccessKey: resolved.secretAccessKey, sessionToken: resolved.sessionToken, expiration: resolved.expiration }
}

interface RoleChainHop {
  profileName: string
  roleArn: string
  roleSessionName?: string
  externalId?: string
  durationSeconds?: number
}

/** Profile keys a `source: "sso-role-chain"` chain refuses, with the reason. */
const UNSUPPORTED_ROLE_CHAIN_KEYS: ReadonlyArray<[key: string, reason: string]> = [
  ["credential_source", "credential_source (Environment / Ec2InstanceMetadata / EcsContainer) reads ambient credentials"],
  ["mfa_serial", "mfa_serial needs an interactive MFA code"],
  ["web_identity_token_file", "web identity (web_identity_token_file) is not supported"],
  ["credential_process", "credential_process is not supported in a role chain"],
]

/**
 * Walks `role_arn` + `source_profile` from the named profile to the IAM Identity Center (SSO) profile the chain starts from,
 * using only the configured files. Everything is checked before any SDK is loaded or any request is made.
 */
function planSsoRoleChain(loaded: LoadedProfiles): { ssoProfileName: string; hops: Array<RoleChainHop> } {
  const { profileName, profiles, filepath, configFilepath } = loaded
  const hops: Array<RoleChainHop> = []
  const visited: Array<string> = []
  const fail = (message: string) => new InvalidConfigurationError(`"awsCredentials.source": "sso-role-chain" (profile "${profileName}"): ${message}`)

  let name = profileName
  for (;;) {
    if (visited.includes(name)) {
      throw fail(`the source_profile chain has a cycle: ${[...visited, name].join(" -> ")}`)
    }
    const profile = profiles[name]
    if (profile == null) {
      throw fail(`source_profile "${name}" of profile "${visited[visited.length - 1]}" was not found in ${filepath} or ${configFilepath}`)
    }
    visited.push(name)

    for (const [key, reason] of UNSUPPORTED_ROLE_CHAIN_KEYS) {
      if (profile[key] != null) {
        throw fail(
          `profile "${name}" sets ${key}, which is not supported: ${reason}. Use "awsCredentials.source": "profile" with a profile the AWS SDK can resolve from the configured files instead.`
        )
      }
    }

    const isNamedProfile = name === profileName
    if (!isNamedProfile && isStaticProfile(profile)) {
      // the AWS SDK uses static keys of a source profile before anything else in it
      throw fail(
        `the chain ends at static keys in profile "${name}", not at an IAM Identity Center (SSO) profile. Use "awsCredentials.source": "profile" for chains that start from static keys.`
      )
    }

    if (profile.role_arn != null) {
      if (profile.source_profile == null) {
        throw fail(`profile "${name}" sets role_arn without source_profile`)
      }
      if (hops.length >= MAX_ROLE_CHAIN_HOPS) {
        throw fail(`the role chain is longer than ${MAX_ROLE_CHAIN_HOPS} assume-role hops: ${visited.join(" -> ")} -> ...`)
      }
      hops.push({
        profileName: name,
        roleArn: profile.role_arn,
        roleSessionName: profile.role_session_name || undefined,
        externalId: profile.external_id || undefined,
        durationSeconds: parseDurationSeconds(profile.duration_seconds, name, fail),
      })
      name = profile.source_profile.trim()
      continue
    }

    if (isNamedProfile) {
      throw fail(`profile "${name}" is not an assume-role profile (role_arn + source_profile). Use "awsCredentials.source": "profile" for it.`)
    }
    if (!isSsoProfile(profile)) {
      throw fail(`the chain ends at profile "${name}", which is neither an assume-role profile nor an IAM Identity Center (SSO) profile`)
    }
    // hops are listed from the named profile down; they are assumed from the SSO profile up
    return { ssoProfileName: name, hops: hops.reverse() }
  }
}

function parseDurationSeconds(value: string | undefined, profileName: string, fail: (message: string) => Error): number | undefined {
  if (value == null || value === "") {
    return undefined
  }
  if (!/^\d+$/.test(value)) {
    throw fail(`profile "${profileName}" has an invalid duration_seconds: ${JSON.stringify(value)}`)
  }
  return Number.parseInt(value, 10)
}

/**
 * `source: "sso-role-chain"`: resolves the SSO profile at the root of the chain with fromSSO and the configured files, then calls
 * STS AssumeRole for each hop with the previous hop's credentials. The STS client gets every setting explicitly (credentials,
 * region, endpoint mode, retries, profile) so it reads neither AWS_* variables nor AWS_CONFIG_FILE / AWS_PROFILE for them.
 */
async function resolveFromSsoRoleChain(options: S3AwsCredentialsOptions): Promise<AwsCredentials> {
  const loaded = await loadProfiles(options)
  const { profileName, profiles, filepath, configFilepath } = loaded
  const { ssoProfileName, hops } = planSsoRoleChain(loaded)

  // validated before anything is loaded or requested
  const settings = stsSettings(profileName, profiles[profileName])

  let credentials: AwsCredentials
  let step = `IAM Identity Center (SSO) profile "${ssoProfileName}"`
  try {
    const [{ fromSSO }, sts] = await Promise.all([awsSdkLoaders.sso(), awsSdkLoaders.sts()])
    const assumeRole = explicitRoleAssumer(sts, settings)
    credentials = await fromSSO(explicitSsoInit(ssoProfileName, filepath, configFilepath))()

    for (const hop of hops) {
      step = `AssumeRole ${hop.roleArn} (profile "${hop.profileName}")`
      credentials = await assumeRole(credentials, {
        RoleArn: hop.roleArn,
        RoleSessionName: hop.roleSessionName ?? `electron-builder-${Date.now()}`,
        ExternalId: hop.externalId,
        DurationSeconds: hop.durationSeconds,
      })
    }
  } catch (e: any) {
    throw new Error(`Cannot resolve AWS credentials for profile "${profileName}" (${configFilepath}, ${filepath}) at ${step}: ${e?.message ?? e}`, { cause: e })
  }
  return { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey, sessionToken: credentials.sessionToken, expiration: credentials.expiration }
}

/**
 * Checks the shape of `awsCredentials` without reading any credentials. A source must be chosen explicitly:
 * there is no default, so credentials are never resolved from a source the configuration does not name.
 */
export function validateS3CredentialsOptions(options: S3AwsCredentialsOptions | null | undefined): asserts options is S3AwsCredentialsOptions {
  const source = options?.source
  if (options == null || source == null) {
    throw new InvalidConfigurationError(
      `S3 publishing requires an explicit credential source. Set "awsCredentials" in the s3 publish configuration to ` +
        `{ "source": "env" } to read AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN (or custom names via "env"), or to ` +
        `{ "source": "profile", "profile": "<name>" } to use a profile from the shared AWS config/credentials files (IAM Identity Center/SSO, credential_process, assume-role, static keys), or to ` +
        `{ "source": "sso-role-chain", "profile": "<name>" } for an assume-role profile whose source_profile chain starts at an IAM Identity Center (SSO) profile. ` +
        `Since v27, S3 credentials are not read implicitly from the environment, AWS_PROFILE or ~/.aws.`
    )
  }
  if (source === "env") {
    const profileOnly = (["profile", "credentialsFile", "configFile"] as const).filter(key => options[key] != null)
    if (profileOnly.length > 0) {
      throw new InvalidConfigurationError(
        `"awsCredentials.${profileOnly.join('", "awsCredentials.')}" only applies to "awsCredentials.source": "profile" or "sso-role-chain" (source is "env")`
      )
    }
  } else if (source === "profile" || source === "sso-role-chain") {
    if (options.env != null) {
      throw new InvalidConfigurationError(`"awsCredentials.env" only applies to "awsCredentials.source": "env" (source is "${source}")`)
    }
    if (!options.profile?.trim()) {
      throw new InvalidConfigurationError(
        `"awsCredentials.profile" must be set when "awsCredentials.source" is "${source}" (AWS_PROFILE is not used).` +
          (source === "profile" ? ` Use "default" for the [default] profile.` : ` Name the assume-role profile to publish with.`)
      )
    }
  } else {
    throw new InvalidConfigurationError(`Unsupported "awsCredentials.source": ${JSON.stringify(source)} (expected "env", "profile" or "sso-role-chain")`)
  }
}

/**
 * Resolves the credentials for the S3 publisher from exactly the source named in `awsCredentials`.
 * Always returns usable credentials or throws — never `undefined` (aws4 would then silently read other env variables).
 */
export async function resolveS3Credentials(options: S3AwsCredentialsOptions | null | undefined): Promise<AwsCredentials> {
  validateS3CredentialsOptions(options)
  switch (options.source) {
    case "env":
      return resolveFromEnv(options)
    case "sso-role-chain":
      return await resolveFromSsoRoleChain(options)
    default:
      return await resolveFromProfile(options)
  }
}

/**
 * Returns a resolver that reuses the resolved credentials until they are about to expire, so publishing many files
 * does not repeat SSO / STS / credential_process resolution per file. Concurrent callers share one pending resolution;
 * a failed resolution is not cached.
 */
export function memoizeAwsCredentials(resolve: () => Promise<AwsCredentials>): () => Promise<AwsCredentials> {
  let cached: AwsCredentials | null = null
  let pending: Promise<AwsCredentials> | null = null
  return () => {
    if (cached != null && (cached.expiration == null || cached.expiration.getTime() - Date.now() > EXPIRATION_MARGIN_MS)) {
      return Promise.resolve(cached)
    }
    if (pending == null) {
      pending = resolve().then(
        it => {
          cached = it
          pending = null
          return it
        },
        (e: unknown) => {
          pending = null
          throw e
        }
      )
    }
    return pending
  }
}

/** Guards the signers: aws4 falls back to reading `AWS_ACCESS_KEY_ID || AWS_ACCESS_KEY` etc. when given no credentials. */
export function requireAwsCredentials(credentials: AwsCredentials | null | undefined, operation: string): AwsCredentials {
  if (credentials == null || !credentials.accessKeyId || !credentials.secretAccessKey) {
    throw new Error(`${operation}: AWS credentials are required (refusing to sign the request without them)`)
  }
  return credentials
}
