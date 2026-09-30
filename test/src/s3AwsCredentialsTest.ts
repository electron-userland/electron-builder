import { createHash } from "crypto"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { Readable } from "stream"
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
    const sts = vi.spyOn(awsSdkLoaders, "sts")
    const promise = resolveS3Credentials(options as any)
    await expect(promise).rejects.toBeInstanceOf(InvalidConfigurationError)
    await expect(promise).rejects.toThrow(/requires an explicit credential source.*"source": "env".*"source": "profile"/)
    expect(await recordEnvReads(() => resolveS3Credentials(options as any))).toEqual([])
    expect(ini).not.toHaveBeenCalled()
    expect(sso).not.toHaveBeenCalled()
    expect(sts).not.toHaveBeenCalled()
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
    const sts = vi.spyOn(awsSdkLoaders, "sts")
    const promise = resolveS3Credentials({ source: "env" })
    await expect(promise).rejects.toBeInstanceOf(InvalidConfigurationError)
    await expect(promise).rejects.toThrow(/AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are not set.*"source": "profile"/)
    expect(ini).not.toHaveBeenCalled()
    expect(sso).not.toHaveBeenCalled()
    expect(sts).not.toHaveBeenCalled()
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
    await expect(resolveS3Credentials({ source: "env", profile: "release" })).rejects.toThrow(
      /awsCredentials\.profile" only applies to "awsCredentials\.source": "profile" or "sso-role-chain"/
    )
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
    const sts = vi.spyOn(awsSdkLoaders, "sts")
    const credentialsFile = write("custom/credentials", "[release]\naws_access_key_id = FILE_KEY\naws_secret_access_key = file-secret\naws_session_token = file-token\n")
    await expect(resolveS3Credentials({ source: "profile", profile: "release", credentialsFile, configFile: path.join(root, "custom/missing-config") })).resolves.toEqual({
      accessKeyId: "FILE_KEY",
      secretAccessKey: "file-secret",
      sessionToken: "file-token",
    })
    expect(ini).not.toHaveBeenCalled()
    expect(sso).not.toHaveBeenCalled()
    expect(sts).not.toHaveBeenCalled()
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

  it("refuses an assume-role profile whose source_profile is an SSO profile and points to source: sso-role-chain", async () => {
    stubAmbientDecoys({ envKeys: true })
    const configFile = write(
      "custom/config",
      "[profile deploy]\nrole_arn = arn:aws:iam::123456789012:role/deploy\nsource_profile = login\n[profile login]\nsso_session = corp\nsso_account_id = 123456789012\nsso_role_name = Base\n[sso-session corp]\nsso_start_url = https://example.awsapps.com/start\nsso_region = us-east-1\n"
    )
    const ini = vi.spyOn(awsSdkLoaders, "ini")
    const promise = resolveS3Credentials({ source: "profile", profile: "deploy", configFile })
    await expect(promise).rejects.toBeInstanceOf(InvalidConfigurationError)
    await expect(promise).rejects.toThrow(/SSO\) profile "login" \(source_profile\), which "awsCredentials.source": "profile" does not resolve/)
    await expect(promise).rejects.toThrow(/"awsCredentials": \{ "source": "sso-role-chain", "profile": "deploy" \}/)
    expect(ini).not.toHaveBeenCalled()
  })

  it("routes credential_process and assume-role profiles to fromIni with explicit paths", async () => {
    stubAmbientDecoys({ envKeys: true })
    const configFile = write(
      "custom/config",
      "[profile proc]\ncredential_process = /bin/false\n[profile role]\nrole_arn = arn:aws:iam::123456789012:role/r\nsource_profile = base\naws_access_key_id = BASE\naws_secret_access_key = base\n"
    )
    const credentialsFile = write("custom/credentials", "")
    const fromIni = vi.fn((_init: any) => () => Promise.resolve({ accessKeyId: "INI_KEY", secretAccessKey: "ini-secret" }))
    vi.spyOn(awsSdkLoaders, "ini").mockResolvedValue({ fromIni })
    const sso = vi.spyOn(awsSdkLoaders, "sso")
    const sts = vi.spyOn(awsSdkLoaders, "sts")
    for (const profile of ["proc", "role"]) {
      await expect(resolveS3Credentials({ source: "profile", profile, configFile, credentialsFile })).resolves.toMatchObject({ accessKeyId: "INI_KEY" })
    }
    expect(fromIni.mock.calls).toEqual([
      [{ profile: "proc", filepath: credentialsFile, configFilepath: configFile, clientConfig: { ignoreConfiguredEndpointUrls: true }, parentClientConfig: { profile: "proc" } }],
      [
        {
          profile: "role",
          filepath: credentialsFile,
          configFilepath: configFile,
          clientConfig: { ignoreConfiguredEndpointUrls: true },
          parentClientConfig: { profile: "role" },
          roleAssumer: expect.any(Function),
        },
      ],
    ])
    // the STS client is only loaded for the assume-role profile
    expect(sts).toHaveBeenCalledTimes(1)
    expect(sso).not.toHaveBeenCalled()
  })

  it("assumes roles for fromIni with the explicit STS client (AWS_ENDPOINT_URL_STS / AWS_REGION / AWS_CONFIG_FILE are decoys)", async () => {
    stubAmbientDecoys({ envKeys: true })
    vi.stubEnv("AWS_CONFIG_FILE", write("decoy/role-config", "[profile role]\nregion = ap-south-1\nendpoint_url = https://decoy-endpoint.example.com\n"))
    vi.stubEnv("AWS_PROFILE", "role")
    vi.stubEnv("AWS_REGION", "ap-south-1")
    vi.stubEnv("AWS_ENDPOINT_URL", "https://decoy-endpoint.example.com")
    vi.stubEnv("AWS_ENDPOINT_URL_STS", "https://decoy-sts.example.com")
    const configFile = write(
      "custom/config",
      "[profile role]\nrole_arn = arn:aws:iam::123456789012:role/r\nsource_profile = base\nregion = eu-west-1\n[profile base]\naws_access_key_id = BASE_KEY\naws_secret_access_key = base-secret\n"
    )
    const requests: Array<any> = []
    const realSts = awsSdkLoaders.sts
    vi.spyOn(awsSdkLoaders, "sts").mockImplementation(async () => {
      const sdk = await realSts()
      const requestHandler = {
        handle: (request: any) => {
          requests.push(request)
          const xml =
            '<AssumeRoleResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><AssumeRoleResult><Credentials>' +
            "<AccessKeyId>ROLE_KEY</AccessKeyId><SecretAccessKey>role-secret</SecretAccessKey><SessionToken>role-token</SessionToken>" +
            "<Expiration>2099-01-01T00:00:00Z</Expiration></Credentials></AssumeRoleResult></AssumeRoleResponse>"
          return Promise.resolve({ response: { statusCode: 200, headers: { "content-type": "text/xml" }, body: Readable.from([Buffer.from(xml)]) } })
        },
      }
      class STSClient extends sdk.STSClient {
        constructor(config: any) {
          super({ ...config, requestHandler })
        }
      }
      return { ...sdk, STSClient }
    })

    await expect(resolveS3Credentials({ source: "profile", profile: "role", configFile, credentialsFile: path.join(root, "custom/missing") })).resolves.toMatchObject({
      accessKeyId: "ROLE_KEY",
      sessionToken: "role-token",
    })
    expect(requests).toHaveLength(1)
    expect(requests[0].hostname).toBe("sts.eu-west-1.amazonaws.com")
    expect(requests[0].headers.authorization).toMatch(/Credential=BASE_KEY\/\d{8}\/eu-west-1\/sts\/aws4_request/)
  })
})

describe("S3 credentials — source: sso-role-chain", { concurrent: false }, () => {
  const SSO_SECTIONS = [
    "[profile login]",
    "sso_session = corp",
    "sso_account_id = 111111111111",
    "sso_role_name = Base",
    "[sso-session corp]",
    "sso_start_url = https://example.awsapps.com/start",
    "sso_region = us-east-1",
  ]

  /** Decoys on top of stubAmbientDecoys: an AWS_CONFIG_FILE that defines the same profile names differently, plus region / endpoint / profile variables. */
  function stubChainDecoys(): void {
    stubAmbientDecoys({ envKeys: true })
    vi.stubEnv(
      "AWS_CONFIG_FILE",
      write(
        "decoy/chain-config",
        [
          "[profile deploy]",
          "role_arn = arn:aws:iam::999999999999:role/DECOY",
          "source_profile = login",
          "region = ap-south-1",
          "endpoint_url = https://decoy-endpoint.example.com",
          "[profile login]",
          "sso_session = corp",
          "sso_account_id = 999999999999",
          "sso_role_name = Decoy",
          "[sso-session corp]",
          "sso_start_url = https://decoy.awsapps.com/start",
          "sso_region = ap-south-1",
          "",
        ].join("\n")
      )
    )
    vi.stubEnv("AWS_PROFILE", "deploy")
    vi.stubEnv("AWS_REGION", "ap-south-1")
    vi.stubEnv("AWS_DEFAULT_REGION", "ap-south-1")
    vi.stubEnv("AWS_ENDPOINT_URL", "https://decoy-endpoint.example.com")
    vi.stubEnv("AWS_ENDPOINT_URL_STS", "https://decoy-sts.example.com")
    vi.stubEnv("AWS_ENDPOINT_URL_SSO", "https://decoy-sso.example.com")
    vi.stubEnv("AWS_STS_REGIONAL_ENDPOINTS", "legacy")
    vi.stubEnv("AWS_USE_FIPS_ENDPOINT", "true")
    vi.stubEnv("AWS_DEFAULTS_MODE", "auto")
    vi.stubEnv("AWS_ROLE_ARN", "arn:aws:iam::999999999999:role/DECOY_WEB_IDENTITY")
    vi.stubEnv("AWS_WEB_IDENTITY_TOKEN_FILE", write("decoy/token", "decoy-token"))
  }

  /** A cached `aws sso login` token for session "corp" under the stubbed HOME. */
  function writeSsoToken(): void {
    write(
      `home/.aws/sso/cache/${createHash("sha1").update("corp").digest("hex")}.json`,
      JSON.stringify({
        accessToken: "cached-sso-token",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        region: "us-east-1",
        startUrl: "https://example.awsapps.com/start",
      })
    )
  }

  /** Real fromSSO with a fake SSO client (no network). */
  function fakeSso(expiration = Date.now() + 3600_000) {
    const send = vi.fn().mockResolvedValue({ roleCredentials: { accessKeyId: "SSO_KEY", secretAccessKey: "sso-secret", sessionToken: "sso-token", expiration } })
    const inits: Array<any> = []
    const realSso = awsSdkLoaders.sso
    const loader = vi.spyOn(awsSdkLoaders, "sso").mockImplementation(async () => {
      const sdk = await realSso()
      return { ...sdk, fromSSO: (init: any) => (inits.push(init), sdk.fromSSO({ ...init, ssoClient: { send } as any })) }
    })
    return { send, inits, loader }
  }

  /** A fake STS module: each AssumeRole returns credentials named after the role. */
  function fakeSts() {
    const clients: Array<{ config: any; inputs: Array<any>; destroyed: boolean }> = []
    class AssumeRoleCommand {
      constructor(readonly input: any) {}
    }
    class STSClient {
      readonly record: { config: any; inputs: Array<any>; destroyed: boolean }
      constructor(config: any) {
        this.record = { config, inputs: [], destroyed: false }
        clients.push(this.record)
      }
      send(command: AssumeRoleCommand) {
        this.record.inputs.push(command.input)
        const role = command.input.RoleArn.split("/").pop()
        return Promise.resolve({
          Credentials: { AccessKeyId: `${role}_KEY`, SecretAccessKey: `${role}-secret`, SessionToken: `${role}-token`, Expiration: new Date(Date.now() + 3600_000) },
        })
      }
      destroy() {
        this.record.destroyed = true
      }
    }
    const loader = vi.spyOn(awsSdkLoaders, "sts").mockResolvedValue({ STSClient, AssumeRoleCommand } as any)
    return { clients, loader }
  }

  const credentialsFile = () => path.join(root, "custom/missing-credentials")

  it("resolves SSO -> role (2 hops) from the explicit configFile, ignoring AWS_CONFIG_FILE, AWS_PROFILE, AWS_REGION and AWS_* keys", async () => {
    stubChainDecoys()
    writeSsoToken()
    const configFile = write(
      "custom/config",
      [
        "[profile deploy]",
        "role_arn = arn:aws:iam::222222222222:role/deploy",
        "source_profile = login",
        "role_session_name = release-session",
        "external_id = ext-123",
        "duration_seconds = 1800",
        "region = eu-west-1",
        ...SSO_SECTIONS,
        "",
      ].join("\n")
    )
    const sso = fakeSso()
    const sts = fakeSts()
    const ini = vi.spyOn(awsSdkLoaders, "ini")

    const credentials = await resolveS3Credentials({ source: "sso-role-chain", profile: "deploy", configFile, credentialsFile: credentialsFile() })
    expect(credentials).toMatchObject({ accessKeyId: "deploy_KEY", secretAccessKey: "deploy-secret", sessionToken: "deploy-token" })
    expect(credentials.expiration).toBeInstanceOf(Date)

    // SSO: the explicit file's account/role, the explicit paths, no configured endpoint URLs
    expect(sso.send).toHaveBeenCalledTimes(1)
    expect(sso.send.mock.calls[0][0].input).toEqual({ accountId: "111111111111", roleName: "Base", accessToken: "cached-sso-token" })
    expect(sso.inits).toEqual([
      { profile: "login", filepath: credentialsFile(), configFilepath: configFile, clientConfig: { ignoreConfiguredEndpointUrls: true }, parentClientConfig: { profile: "login" } },
    ])

    // STS: one client per hop, signed with the SSO credentials, with every ambient-derived setting given explicitly
    expect(sts.clients).toHaveLength(1)
    expect(sts.clients[0].config).toMatchObject({
      credentials: { accessKeyId: "SSO_KEY", secretAccessKey: "sso-secret", sessionToken: "sso-token" },
      region: "eu-west-1",
      profile: "deploy",
      useGlobalEndpoint: false,
      useFipsEndpoint: false,
      useDualstackEndpoint: false,
      ignoreConfiguredEndpointUrls: true,
      defaultsMode: "standard",
    })
    expect(sts.clients[0].inputs).toEqual([{ RoleArn: "arn:aws:iam::222222222222:role/deploy", RoleSessionName: "release-session", ExternalId: "ext-123", DurationSeconds: 1800 }])
    expect(sts.clients[0].destroyed).toBe(true)
    expect(ini).not.toHaveBeenCalled()
  })

  it("resolves SSO -> role -> role (3 hops), each AssumeRole signed with the previous hop's credentials", async () => {
    stubChainDecoys()
    writeSsoToken()
    const configFile = write(
      "custom/config",
      [
        "[profile deploy]",
        "role_arn = arn:aws:iam::333333333333:role/deploy",
        "source_profile = hub",
        "sts_regional_endpoints = legacy",
        "[profile hub]",
        "role_arn = arn:aws:iam::222222222222:role/hub",
        "source_profile = login",
        "region = eu-central-1",
        ...SSO_SECTIONS,
        "",
      ].join("\n")
    )
    fakeSso()
    const sts = fakeSts()

    await expect(resolveS3Credentials({ source: "sso-role-chain", profile: "deploy", configFile, credentialsFile: credentialsFile() })).resolves.toMatchObject({
      accessKeyId: "deploy_KEY",
      sessionToken: "deploy-token",
    })
    expect(sts.clients.map(it => it.inputs[0].RoleArn)).toEqual(["arn:aws:iam::222222222222:role/hub", "arn:aws:iam::333333333333:role/deploy"])
    expect(sts.clients.map(it => it.config.credentials.accessKeyId)).toEqual(["SSO_KEY", "hub_KEY"])
    // like the AWS SDK: the named profile's region (none -> us-east-1, not AWS_REGION or the hub's region) and sts_regional_endpoints
    expect(sts.clients.map(it => [it.config.region, it.config.useGlobalEndpoint])).toEqual([
      ["us-east-1", true],
      ["us-east-1", true],
    ])
    expect(sts.clients[0].inputs[0].RoleSessionName).toMatch(/^electron-builder-\d+$/)
    expect(sts.clients[0].inputs[0]).toMatchObject({ ExternalId: undefined, DurationSeconds: undefined })
  })

  it("sends AssumeRole through the real STS client to the configured region's endpoint, not AWS_ENDPOINT_URL_STS / AWS_REGION", async () => {
    stubChainDecoys()
    writeSsoToken()
    const configFile = write(
      "custom/config",
      ["[profile deploy]", "role_arn = arn:aws:iam::222222222222:role/deploy", "source_profile = login", "region = eu-west-1", ...SSO_SECTIONS, ""].join("\n")
    )
    fakeSso()
    const requests: Array<any> = []
    const realSts = awsSdkLoaders.sts
    vi.spyOn(awsSdkLoaders, "sts").mockImplementation(async () => {
      const sdk = await realSts()
      const requestHandler = {
        handle: async (request: any) => {
          requests.push(request)
          const xml =
            '<AssumeRoleResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><AssumeRoleResult><Credentials>' +
            "<AccessKeyId>REAL_STS_KEY</AccessKeyId><SecretAccessKey>real-sts-secret</SecretAccessKey><SessionToken>real-sts-token</SessionToken>" +
            "<Expiration>2099-01-01T00:00:00Z</Expiration></Credentials></AssumeRoleResult></AssumeRoleResponse>"
          return { response: { statusCode: 200, headers: { "content-type": "text/xml" }, body: Readable.from([Buffer.from(xml)]) } }
        },
      }
      class STSClient extends sdk.STSClient {
        constructor(config: any) {
          super({ ...config, requestHandler })
        }
      }
      return { ...sdk, STSClient }
    })

    await expect(resolveS3Credentials({ source: "sso-role-chain", profile: "deploy", configFile, credentialsFile: credentialsFile() })).resolves.toEqual({
      accessKeyId: "REAL_STS_KEY",
      secretAccessKey: "real-sts-secret",
      sessionToken: "real-sts-token",
      expiration: new Date("2099-01-01T00:00:00Z"),
    })
    expect(requests).toHaveLength(1)
    expect(requests[0].hostname).toBe("sts.eu-west-1.amazonaws.com")
    expect(requests[0].headers.authorization).toMatch(/Credential=SSO_KEY\/\d{8}\/eu-west-1\/sts\/aws4_request/)
    expect(requests[0].headers["x-amz-security-token"]).toBe("sso-token")
    expect(String(requests[0].body)).toContain("RoleArn=arn%3Aaws%3Aiam%3A%3A222222222222%3Arole%2Fdeploy")

    // neither our code nor the SSO / STS clients consult AWS_CONFIG_FILE, AWS_PROFILE, AWS_REGION, AWS_ENDPOINT_URL*, AWS_* keys etc.;
    // only HOME (SSO token cache) and the SDK's user-agent / Lambda recursion-detection variables are read
    const reads = await recordEnvReads(() => resolveS3Credentials({ source: "sso-role-chain", profile: "deploy", configFile, credentialsFile: credentialsFile() }))
    expect(requests).toHaveLength(2)
    expect(reads.filter(it => it.startsWith("AWS_") && it !== "AWS_EXECUTION_ENV" && it !== "AWS_LAMBDA_FUNCTION_NAME")).toEqual([])
  })

  it("resolves the chain once for many uploads when memoized", async () => {
    stubChainDecoys()
    writeSsoToken()
    const configFile = write("custom/config", ["[profile deploy]", "role_arn = arn:aws:iam::222222222222:role/deploy", "source_profile = login", ...SSO_SECTIONS, ""].join("\n"))
    const sso = fakeSso()
    const sts = fakeSts()
    const get = memoizeAwsCredentials(() => resolveS3Credentials({ source: "sso-role-chain", profile: "deploy", configFile, credentialsFile: credentialsFile() }))
    await Promise.all([get(), get(), get()])
    await get()
    expect(sso.send).toHaveBeenCalledTimes(1)
    expect(sts.clients).toHaveLength(1)
  })

  it.each([
    [
      "a source_profile cycle",
      ["[profile deploy]", "role_arn = arn:aws:iam::1:role/a", "source_profile = hub", "[profile hub]", "role_arn = arn:aws:iam::1:role/b", "source_profile = deploy"],
      /source_profile chain has a cycle: deploy -> hub -> deploy/,
    ],
    ["a self-referencing source_profile", ["[profile deploy]", "role_arn = arn:aws:iam::1:role/a", "source_profile = deploy"], /cycle: deploy -> deploy/],
    [
      "a chain longer than 5 assume-role hops",
      [...[0, 1, 2, 3, 4, 5].flatMap(i => [`[profile r${i}]`, `role_arn = arn:aws:iam::1:role/r${i}`, `source_profile = ${i === 5 ? "login" : `r${i + 1}`}`]), ...SSO_SECTIONS],
      /longer than 5 assume-role hops: r0 -> r1 -> r2 -> r3 -> r4 -> r5/,
      "r0",
    ],
    [
      "a missing source_profile",
      ["[profile deploy]", "role_arn = arn:aws:iam::1:role/a", "source_profile = nowhere"],
      /source_profile "nowhere" of profile "deploy" was not found/,
    ],
    ["credential_source", ["[profile deploy]", "role_arn = arn:aws:iam::1:role/a", "credential_source = Environment"], /profile "deploy" sets credential_source/],
    ["mfa_serial", ["[profile deploy]", "role_arn = arn:aws:iam::1:role/a", "source_profile = login", "mfa_serial = arn:aws:iam::1:mfa/me", ...SSO_SECTIONS], /sets mfa_serial/],
    [
      "web identity in the chain",
      ["[profile deploy]", "role_arn = arn:aws:iam::1:role/a", "source_profile = web", "[profile web]", "role_arn = arn:aws:iam::1:role/w", "web_identity_token_file = /tmp/t"],
      /profile "web" sets web_identity_token_file/,
    ],
    [
      "credential_process at the root",
      ["[profile deploy]", "role_arn = arn:aws:iam::1:role/a", "source_profile = proc", "[profile proc]", "credential_process = /bin/false"],
      /profile "proc" sets credential_process/,
    ],
    [
      "a chain that starts at static keys",
      ["[profile deploy]", "role_arn = arn:aws:iam::1:role/a", "source_profile = keys", "[profile keys]", "aws_access_key_id = K", "aws_secret_access_key = S"],
      /ends at static keys in profile "keys".*"awsCredentials.source": "profile"/,
    ],
    ["a named profile that is not an assume-role profile", SSO_SECTIONS.map(it => it.replace("profile login", "profile deploy")), /profile "deploy" is not an assume-role profile/],
    [
      "a role_arn without source_profile",
      ["[profile deploy]", "role_arn = arn:aws:iam::1:role/a", "source_profile = mid", "[profile mid]", "role_arn = arn:aws:iam::1:role/m"],
      /profile "mid" sets role_arn without source_profile/,
    ],
    [
      "a chain that ends at neither a role nor SSO",
      ["[profile deploy]", "role_arn = arn:aws:iam::1:role/a", "source_profile = empty", "[profile empty]", "region = us-west-2"],
      /ends at profile "empty", which is neither/,
    ],
    [
      "an invalid duration_seconds",
      ["[profile deploy]", "role_arn = arn:aws:iam::1:role/a", "source_profile = login", "duration_seconds = 1h", ...SSO_SECTIONS],
      /invalid duration_seconds: "1h"/,
    ],
    [
      "an invalid sts_regional_endpoints",
      ["[profile deploy]", "role_arn = arn:aws:iam::1:role/a", "source_profile = login", "sts_regional_endpoints = global", ...SSO_SECTIONS],
      /invalid sts_regional_endpoints: "global"/,
    ],
  ] as Array<[string, Array<string>, RegExp, string?]>)("rejects %s with InvalidConfigurationError before loading the SDK", async (_name, lines, message, profile = "deploy") => {
    stubChainDecoys()
    const configFile = write("custom/config", [...lines, ""].join("\n"))
    const loaders = (["ini", "sso", "sts"] as const).map(it => vi.spyOn(awsSdkLoaders, it))
    const promise = resolveS3Credentials({ source: "sso-role-chain", profile, configFile, credentialsFile: credentialsFile() })
    await expect(promise).rejects.toBeInstanceOf(InvalidConfigurationError)
    await expect(promise).rejects.toThrow(message)
    for (const loader of loaders) {
      expect(loader).not.toHaveBeenCalled()
    }
  })

  it("wraps an STS failure with the profile and the hop", async () => {
    stubChainDecoys()
    writeSsoToken()
    const configFile = write("custom/config", ["[profile deploy]", "role_arn = arn:aws:iam::222222222222:role/deploy", "source_profile = login", ...SSO_SECTIONS, ""].join("\n"))
    fakeSso()
    class AssumeRoleCommand {
      constructor(readonly input: any) {}
    }
    const destroy = vi.fn()
    class STSClient {
      send = () => Promise.reject(new Error("AccessDenied: not authorized to perform sts:AssumeRole"))
      destroy = destroy
    }
    vi.spyOn(awsSdkLoaders, "sts").mockResolvedValue({ STSClient, AssumeRoleCommand } as any)
    await expect(resolveS3Credentials({ source: "sso-role-chain", profile: "deploy", configFile, credentialsFile: credentialsFile() })).rejects.toThrow(
      /Cannot resolve AWS credentials for profile "deploy" .* at AssumeRole arn:aws:iam::222222222222:role\/deploy \(profile "deploy"\): AccessDenied/
    )
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it("requires an explicit profile and rejects env names", async () => {
    stubChainDecoys()
    await expect(resolveS3Credentials({ source: "sso-role-chain" })).rejects.toThrow(/"awsCredentials\.profile" must be set when "awsCredentials\.source" is "sso-role-chain"/)
    await expect(resolveS3Credentials({ source: "sso-role-chain", profile: "deploy", env: { accessKeyId: "A", secretAccessKey: "B" } })).rejects.toThrow(
      /"awsCredentials\.env" only applies to "awsCredentials\.source": "env" \(source is "sso-role-chain"\)/
    )
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
