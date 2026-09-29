import { createHash } from "crypto"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { InvalidConfigurationError } from "builder-util"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { awsSdkLoaders, memoizeAwsCredentials, parseAwsIni, resolveS3Credentials, validateS3CredentialsOptions } from "electron-publish/src/s3/awsCredentials"

// These tests exercise the real resolver (no module mock) against temp shared config/credentials files, with
// decoy values in every ambient source that v26 used to consult, to prove only the configured source is read.

let root: string

function write(relative: string, content: string): string {
  const file = path.join(root, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
  return file
}

/** Populates every ambient credential source with decoy values that must never be picked up. */
function stubAmbientDecoys(options: { envKeys?: boolean } = {}): void {
  // ~/.aws/* under a temp HOME
  write(
    "home/.aws/credentials",
    "[default]\naws_access_key_id = HOME_DEFAULT_KEY\naws_secret_access_key = home-default-secret\n[decoy]\naws_access_key_id = HOME_DECOY_KEY\naws_secret_access_key = home-decoy-secret\n"
  )
  write("home/.aws/config", "[default]\naws_access_key_id = HOME_CONFIG_KEY\naws_secret_access_key = home-config-secret\n")
  vi.stubEnv("HOME", path.join(root, "home"))
  vi.stubEnv("USERPROFILE", path.join(root, "home"))
  vi.stubEnv("AWS_PROFILE", "decoy")
  vi.stubEnv("AWS_SDK_LOAD_CONFIG", "1")
  vi.stubEnv("AWS_CONFIG_FILE", write("decoy/config", "[profile decoy]\naws_access_key_id = ENV_CONFIG_FILE_KEY\naws_secret_access_key = env-config-file-secret\n"))
  vi.stubEnv("AWS_SHARED_CREDENTIALS_FILE", write("decoy/credentials", "[decoy]\naws_access_key_id = ENV_CREDS_FILE_KEY\naws_secret_access_key = env-creds-file-secret\n"))
  vi.stubEnv("AWS_ACCESS_KEY", "LEGACY_KEY")
  vi.stubEnv("AWS_SECRET_KEY", "legacy-secret")
  if (options.envKeys) {
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AMBIENT_ENV_KEY")
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "ambient-env-secret")
    vi.stubEnv("AWS_SESSION_TOKEN", "ambient-env-token")
  } else {
    vi.stubEnv("AWS_ACCESS_KEY_ID", "")
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "")
    vi.stubEnv("AWS_SESSION_TOKEN", "")
  }
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "s3-credentials-"))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  fs.rmSync(root, { recursive: true, force: true })
})

/** Runs `fn` and returns every process.env key it read. */
async function recordEnvReads(fn: () => Promise<unknown>): Promise<Array<string>> {
  const original = process.env
  const reads: Array<string> = []
  process.env = new Proxy(original, {
    get(target, key, receiver) {
      if (typeof key === "string") {
        reads.push(key)
      }
      return Reflect.get(target, key, receiver)
    },
  })
  try {
    await fn().catch(() => null)
  } finally {
    process.env = original
  }
  return reads
}

describe("S3 credentials — no source configured", { concurrent: false }, () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["{}", {}],
    ["{ profile } without source", { profile: "release" }],
    ["{ env } without source", { env: { accessKeyId: "A", secretAccessKey: "B" } }],
  ])("throws InvalidConfigurationError for %s and reads no environment variable", async (_name, options) => {
    stubAmbientDecoys({ envKeys: true })
    const ini = vi.spyOn(awsSdkLoaders, "ini")
    const sso = vi.spyOn(awsSdkLoaders, "sso")
    const promise = resolveS3Credentials(options as any)
    await expect(promise).rejects.toBeInstanceOf(InvalidConfigurationError)
    await expect(promise).rejects.toThrow(/requires an explicit credential source.*"source": "env".*"source": "profile"/)
    expect(await recordEnvReads(() => resolveS3Credentials(options as any))).toEqual([])
    expect(ini).not.toHaveBeenCalled()
    expect(sso).not.toHaveBeenCalled()
  })

  it("validateS3CredentialsOptions checks the shape without reading anything", async () => {
    stubAmbientDecoys({ envKeys: true })
    expect(() => validateS3CredentialsOptions(undefined)).toThrow(InvalidConfigurationError)
    expect(() => validateS3CredentialsOptions({ source: "bogus" } as any)).toThrow(/Unsupported "awsCredentials.source"/)
    expect(await recordEnvReads(async () => validateS3CredentialsOptions({ source: "env" }))).toEqual([])
  })
})

describe("S3 credentials — source: env", { concurrent: false }, () => {
  it("reads only AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN", async () => {
    stubAmbientDecoys({ envKeys: true })
    await expect(resolveS3Credentials({ source: "env" })).resolves.toEqual({
      accessKeyId: "AMBIENT_ENV_KEY",
      secretAccessKey: "ambient-env-secret",
      sessionToken: "ambient-env-token",
    })
    expect(await recordEnvReads(() => resolveS3Credentials({ source: "env" }))).toEqual(["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"])
  })

  it("does not fall back to AWS_PROFILE, AWS_CONFIG_FILE, AWS_SHARED_CREDENTIALS_FILE, AWS_SDK_LOAD_CONFIG, ~/.aws or legacy names", async () => {
    stubAmbientDecoys()
    const ini = vi.spyOn(awsSdkLoaders, "ini")
    const sso = vi.spyOn(awsSdkLoaders, "sso")
    const promise = resolveS3Credentials({ source: "env" })
    await expect(promise).rejects.toBeInstanceOf(InvalidConfigurationError)
    await expect(promise).rejects.toThrow(/AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are not set.*"source": "profile"/)
    expect(ini).not.toHaveBeenCalled()
    expect(sso).not.toHaveBeenCalled()
  })

  it("rejects a partial pair instead of mixing sources", async () => {
    stubAmbientDecoys()
    vi.stubEnv("AWS_ACCESS_KEY_ID", "ONLY_THE_ID")
    await expect(resolveS3Credentials({ source: "env" })).rejects.toThrow(/AWS_SECRET_ACCESS_KEY is not set/)
  })

  it("reads custom variable names and ignores AWS_*", async () => {
    stubAmbientDecoys({ envKeys: true })
    vi.stubEnv("RELEASE_S3_KEY_ID", "RELEASE_KEY")
    vi.stubEnv("RELEASE_S3_SECRET", "release-secret")
    vi.stubEnv("RELEASE_S3_TOKEN", "release-token")
    const env = { accessKeyId: "RELEASE_S3_KEY_ID", secretAccessKey: "RELEASE_S3_SECRET", sessionToken: "RELEASE_S3_TOKEN" }
    await expect(resolveS3Credentials({ source: "env", env })).resolves.toEqual({ accessKeyId: "RELEASE_KEY", secretAccessKey: "release-secret", sessionToken: "release-token" })
    // without a configured sessionToken name, AWS_SESSION_TOKEN is not mixed in
    const withoutToken = { source: "env" as const, env: { accessKeyId: "RELEASE_S3_KEY_ID", secretAccessKey: "RELEASE_S3_SECRET" } }
    await expect(resolveS3Credentials(withoutToken)).resolves.toEqual({ accessKeyId: "RELEASE_KEY", secretAccessKey: "release-secret", sessionToken: undefined })
    expect(await recordEnvReads(() => resolveS3Credentials(withoutToken))).toEqual(["RELEASE_S3_KEY_ID", "RELEASE_S3_SECRET"])
  })

  it("names the custom variables when they are missing, even if AWS_* are set", async () => {
    stubAmbientDecoys({ envKeys: true })
    await expect(resolveS3Credentials({ source: "env", env: { accessKeyId: "RELEASE_S3_KEY_ID", secretAccessKey: "RELEASE_S3_SECRET" } })).rejects.toThrow(
      /RELEASE_S3_KEY_ID and RELEASE_S3_SECRET are not set/
    )
  })

  it("rejects options that belong to the other source", async () => {
    stubAmbientDecoys({ envKeys: true })
    await expect(resolveS3Credentials({ source: "env", profile: "release" })).rejects.toThrow(/awsCredentials\.profile" only applies to "awsCredentials\.source": "profile"/)
    await expect(resolveS3Credentials({ source: "profile", profile: "release", env: { accessKeyId: "A", secretAccessKey: "B" } })).rejects.toThrow(
      /awsCredentials\.env" only applies/
    )
  })
})

describe("S3 credentials — source: profile", { concurrent: false }, () => {
  it("requires an explicit profile (no AWS_PROFILE fallback)", async () => {
    stubAmbientDecoys({ envKeys: true })
    await expect(resolveS3Credentials({ source: "profile" })).rejects.toThrow(/"awsCredentials\.profile" must be set/)
  })

  it("resolves static keys from the credentials file without loading the AWS SDK, ignoring AWS_* env decoys", async () => {
    stubAmbientDecoys({ envKeys: true })
    const ini = vi.spyOn(awsSdkLoaders, "ini")
    const sso = vi.spyOn(awsSdkLoaders, "sso")
    const credentialsFile = write("custom/credentials", "[release]\naws_access_key_id = FILE_KEY\naws_secret_access_key = file-secret\naws_session_token = file-token\n")
    await expect(resolveS3Credentials({ source: "profile", profile: "release", credentialsFile, configFile: path.join(root, "custom/missing-config") })).resolves.toEqual({
      accessKeyId: "FILE_KEY",
      secretAccessKey: "file-secret",
      sessionToken: "file-token",
    })
    expect(ini).not.toHaveBeenCalled()
    expect(sso).not.toHaveBeenCalled()
  })

  it("resolves static keys from the config file, with the credentials file winning per key", async () => {
    stubAmbientDecoys({ envKeys: true })
    const ini = vi.spyOn(awsSdkLoaders, "ini")
    const configFile = write("custom/config", "[profile release]\naws_access_key_id = CONFIG_KEY\naws_secret_access_key = config-secret\naws_session_token = config-token\n")
    const credentialsFile = write("custom/credentials", "[release]\naws_secret_access_key = file-secret\n")
    await expect(resolveS3Credentials({ source: "profile", profile: "release", credentialsFile, configFile })).resolves.toEqual({
      accessKeyId: "CONFIG_KEY",
      secretAccessKey: "file-secret",
      sessionToken: "config-token",
    })
    expect(ini).not.toHaveBeenCalled()
  })

  it("uses ~/.aws/credentials and ~/.aws/config by default, not AWS_SHARED_CREDENTIALS_FILE / AWS_CONFIG_FILE", async () => {
    stubAmbientDecoys({ envKeys: true })
    await expect(resolveS3Credentials({ source: "profile", profile: "default" })).resolves.toMatchObject({ accessKeyId: "HOME_DEFAULT_KEY" })
    await expect(resolveS3Credentials({ source: "profile", profile: "decoy" })).resolves.toMatchObject({ accessKeyId: "HOME_DECOY_KEY" })
  })

  it("handles [profile default], quoted profile names and inline comments", async () => {
    stubAmbientDecoys({ envKeys: true })
    const configFile = write(
      "custom/config",
      [
        "# leading comment",
        "[profile default] ; the default profile, spelled the long way",
        "aws_access_key_id = DEFAULT_KEY # trailing comment",
        "aws_secret_access_key = default;secret ; semicolon comment",
        '[profile "release"]',
        "aws_access_key_id=QUOTED_KEY",
        "aws_secret_access_key=quoted-secret",
        "s3 =",
        "  aws_access_key_id = NESTED_MUST_NOT_WIN",
        "",
      ].join("\n")
    )
    const options = { source: "profile" as const, credentialsFile: path.join(root, "custom/missing-credentials"), configFile }
    await expect(resolveS3Credentials({ ...options, profile: "default" })).resolves.toEqual({
      accessKeyId: "DEFAULT_KEY",
      secretAccessKey: "default;secret",
      sessionToken: undefined,
    })
    await expect(resolveS3Credentials({ ...options, profile: "release" })).resolves.toEqual({
      accessKeyId: "QUOTED_KEY",
      secretAccessKey: "quoted-secret",
      sessionToken: undefined,
    })
  })

  it("expands ~/ in configured paths", async () => {
    stubAmbientDecoys({ envKeys: true })
    write("home/custom/credentials", "[release]\naws_access_key_id = TILDE_KEY\naws_secret_access_key = tilde-secret\n")
    await expect(resolveS3Credentials({ source: "profile", profile: "release", credentialsFile: "~/custom/credentials" })).resolves.toMatchObject({ accessKeyId: "TILDE_KEY" })
  })

  it("fails clearly when the profile is in neither file", async () => {
    stubAmbientDecoys({ envKeys: true })
    const configFile = write("custom/config", "[profile other]\naws_access_key_id = OTHER\naws_secret_access_key = other\n")
    const promise = resolveS3Credentials({ source: "profile", profile: "release", configFile, credentialsFile: path.join(root, "custom/missing") })
    await expect(promise).rejects.toBeInstanceOf(InvalidConfigurationError)
    await expect(promise).rejects.toThrow(/AWS profile "release" was not found/)
  })

  it("resolves an SSO profile through fromSSO with the explicit configFile (AWS_CONFIG_FILE and AWS_PROFILE are decoys)", async () => {
    stubAmbientDecoys({ envKeys: true })
    const configFile = write(
      "custom/config",
      [
        "[profile release]",
        "sso_session = corp",
        "sso_account_id = 123456789012",
        "sso_role_name = Publisher",
        "[sso-session corp]",
        "sso_start_url = https://example.awsapps.com/start",
        "sso_region = us-east-1",
        "",
      ].join("\n")
    )
    // cached `aws sso login` token for session "corp" under the (stubbed) HOME
    const cacheName = createHash("sha1").update("corp").digest("hex")
    write(
      `home/.aws/sso/cache/${cacheName}.json`,
      JSON.stringify({
        accessToken: "cached-sso-token",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        region: "us-east-1",
        startUrl: "https://example.awsapps.com/start",
      })
    )

    const expiration = Date.now() + 3600_000
    const send = vi.fn().mockResolvedValue({ roleCredentials: { accessKeyId: "SSO_KEY", secretAccessKey: "sso-secret", sessionToken: "sso-token", expiration } })
    const realSso = awsSdkLoaders.sso
    const inits: Array<any> = []
    vi.spyOn(awsSdkLoaders, "sso").mockImplementation(async () => {
      const sdk = await realSso()
      // inject a fake SSO client so no network call is made; everything else is the real provider
      return { ...sdk, fromSSO: (init: any) => (inits.push(init), sdk.fromSSO({ ...init, ssoClient: { send } as any })) }
    })
    const ini = vi.spyOn(awsSdkLoaders, "ini")

    const credentials = await resolveS3Credentials({ source: "profile", profile: "release", configFile, credentialsFile: path.join(root, "custom/missing") })
    expect(credentials).toEqual({ accessKeyId: "SSO_KEY", secretAccessKey: "sso-secret", sessionToken: "sso-token", expiration: new Date(expiration) })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].input).toEqual({ accountId: "123456789012", roleName: "Publisher", accessToken: "cached-sso-token" })
    expect(inits[0]).toMatchObject({ profile: "release", configFilepath: configFile, clientConfig: { ignoreConfiguredEndpointUrls: true } })
    expect(ini).not.toHaveBeenCalled()
  })

  it("surfaces an SSO failure (no cached token) with the profile name instead of signing anonymously", async () => {
    stubAmbientDecoys({ envKeys: true })
    const configFile = write(
      "custom/config",
      "[profile release]\nsso_session = missing\nsso_account_id = 123456789012\nsso_role_name = Publisher\n[sso-session missing]\nsso_start_url = https://example.com/start\nsso_region = us-east-1\n"
    )
    const promise = resolveS3Credentials({ source: "profile", profile: "release", configFile })
    await expect(promise).rejects.toThrow(/Cannot resolve AWS credentials for profile "release"/)
    // the failure is about the missing SSO token, i.e. the explicit configFile was used to find the profile
    await expect(promise).rejects.toThrow(/SSO session token associated with profile=release was not found/)
  })

  it("refuses an assume-role profile whose source_profile is an SSO profile (the SDK would ignore the configured files)", async () => {
    stubAmbientDecoys({ envKeys: true })
    const configFile = write(
      "custom/config",
      "[profile deploy]\nrole_arn = arn:aws:iam::123456789012:role/deploy\nsource_profile = login\n[profile login]\nsso_session = corp\nsso_account_id = 123456789012\nsso_role_name = Base\n[sso-session corp]\nsso_start_url = https://example.awsapps.com/start\nsso_region = us-east-1\n"
    )
    const ini = vi.spyOn(awsSdkLoaders, "ini")
    const promise = resolveS3Credentials({ source: "profile", profile: "deploy", configFile })
    await expect(promise).rejects.toBeInstanceOf(InvalidConfigurationError)
    await expect(promise).rejects.toThrow(/SSO\) profile "login" \(source_profile\), which is not supported/)
    expect(ini).not.toHaveBeenCalled()
  })

  it("routes credential_process and assume-role profiles to fromIni with explicit paths", async () => {
    stubAmbientDecoys({ envKeys: true })
    const configFile = write(
      "custom/config",
      "[profile proc]\ncredential_process = /bin/false\n[profile role]\nrole_arn = arn:aws:iam::123456789012:role/r\nsource_profile = base\naws_access_key_id = BASE\naws_secret_access_key = base\n"
    )
    const credentialsFile = write("custom/credentials", "")
    const fromIni = vi.fn(() => () => Promise.resolve({ accessKeyId: "INI_KEY", secretAccessKey: "ini-secret" }))
    vi.spyOn(awsSdkLoaders, "ini").mockResolvedValue({ fromIni })
    const sso = vi.spyOn(awsSdkLoaders, "sso")
    for (const profile of ["proc", "role"]) {
      await expect(resolveS3Credentials({ source: "profile", profile, configFile, credentialsFile })).resolves.toMatchObject({ accessKeyId: "INI_KEY" })
    }
    expect(fromIni.mock.calls).toEqual([
      [{ profile: "proc", filepath: credentialsFile, configFilepath: configFile, clientConfig: { ignoreConfiguredEndpointUrls: true }, parentClientConfig: { profile: "proc" } }],
      [{ profile: "role", filepath: credentialsFile, configFilepath: configFile, clientConfig: { ignoreConfiguredEndpointUrls: true }, parentClientConfig: { profile: "role" } }],
    ])
    expect(sso).not.toHaveBeenCalled()
  })
})

describe("parseAwsIni", () => {
  it("normalizes config-file profile headers and ignores unknown sections", () => {
    const { profiles, ssoSessions } = parseAwsIni(
      "[default]\na = 1\n[profile default]\nb = 2\n[profile x]\nc = 3\n[services s]\nd = 4\n[sso-session corp]\ne = 5\n[plain]\nf = 6\n",
      true
    )
    expect({ ...profiles.default }).toEqual({ a: "1", b: "2" })
    expect({ ...profiles.x }).toEqual({ c: "3" })
    expect(profiles.plain).toBeUndefined()
    expect(profiles.s).toBeUndefined()
    expect({ ...ssoSessions.corp }).toEqual({ e: "5" })
  })

  it("keeps credentials-file section names as-is", () => {
    const { profiles } = parseAwsIni("[release]\na = 1\n[profile release]\nb = 2\n", false)
    expect({ ...profiles.release }).toEqual({ a: "1" })
    expect({ ...profiles["profile release"] }).toEqual({ b: "2" })
  })
})

describe("memoizeAwsCredentials", () => {
  it("resolves once for many callers, including concurrent ones", async () => {
    const resolve = vi.fn().mockResolvedValue({ accessKeyId: "K", secretAccessKey: "S" })
    const get = memoizeAwsCredentials(resolve)
    await Promise.all([get(), get(), get()])
    await get()
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it("re-resolves credentials that expire within a minute", async () => {
    const resolve = vi
      .fn()
      .mockResolvedValueOnce({ accessKeyId: "OLD", secretAccessKey: "S", expiration: new Date(Date.now() + 30_000) })
      .mockResolvedValueOnce({ accessKeyId: "NEW", secretAccessKey: "S", expiration: new Date(Date.now() + 3600_000) })
    const get = memoizeAwsCredentials(resolve)
    expect((await get()).accessKeyId).toBe("OLD")
    expect((await get()).accessKeyId).toBe("NEW")
    expect((await get()).accessKeyId).toBe("NEW")
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it("does not cache failures", async () => {
    const resolve = vi.fn().mockRejectedValueOnce(new Error("sso expired")).mockResolvedValueOnce({ accessKeyId: "K", secretAccessKey: "S" })
    const get = memoizeAwsCredentials(resolve)
    await expect(get()).rejects.toThrow("sso expired")
    await expect(get()).resolves.toMatchObject({ accessKeyId: "K" })
  })
})
