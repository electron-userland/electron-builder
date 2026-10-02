import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { resolveAwsCredentialsForS3 } from "electron-publish/src/s3/awsCredentials"

const homes: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const home of homes.splice(0)) {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

function sharedConfig(config: string, credentials?: string): void {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "s3-credentials-"))
  homes.push(home)
  const aws = path.join(home, ".aws")
  fs.mkdirSync(aws)
  fs.writeFileSync(path.join(aws, "config"), config)
  if (credentials) {
    fs.writeFileSync(path.join(aws, "credentials"), credentials)
  }
  vi.stubEnv("HOME", home)
  vi.stubEnv("AWS_CONFIG_FILE", path.join(aws, "config"))
  vi.stubEnv("AWS_SHARED_CREDENTIALS_FILE", path.join(aws, "credentials"))
  vi.stubEnv("AWS_ACCESS_KEY_ID", "")
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "")
  vi.stubEnv("AWS_SESSION_TOKEN", "")
}

describe("S3 shared config credentials", { concurrent: false }, () => {
  it("resolves a named profile from ~/.aws/config when AWS_SDK_LOAD_CONFIG=1", async () => {
    sharedConfig("[profile release]\naws_access_key_id = CONFIG_KEY\naws_secret_access_key = config-secret\naws_session_token = config-token\n")
    vi.stubEnv("AWS_PROFILE", "release")
    vi.stubEnv("AWS_SDK_LOAD_CONFIG", "1")
    await expect(resolveAwsCredentialsForS3()).resolves.toEqual({ accessKeyId: "CONFIG_KEY", secretAccessKey: "config-secret", sessionToken: "config-token" })
  })

  it("does not load shared config without explicit opt-in", async () => {
    sharedConfig("[default]\naws_access_key_id = CONFIG_KEY\naws_secret_access_key = config-secret\n")
    vi.stubEnv("AWS_SDK_LOAD_CONFIG", "")
    await expect(resolveAwsCredentialsForS3()).resolves.toBeUndefined()
  })

  it("keeps environment credentials ahead of shared config", async () => {
    sharedConfig("[default]\naws_access_key_id = CONFIG_KEY\naws_secret_access_key = config-secret\n")
    vi.stubEnv("AWS_SDK_LOAD_CONFIG", "1")
    vi.stubEnv("AWS_ACCESS_KEY_ID", "ENV_KEY")
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "env-secret")
    await expect(resolveAwsCredentialsForS3()).resolves.toMatchObject({ accessKeyId: "ENV_KEY", secretAccessKey: "env-secret" })
  })

  it("keeps shared credentials ahead of shared config", async () => {
    sharedConfig(
      "[default]\naws_access_key_id = CONFIG_KEY\naws_secret_access_key = config-secret\n",
      "[default]\naws_access_key_id = FILE_KEY\naws_secret_access_key = file-secret\n"
    )
    vi.stubEnv("AWS_SDK_LOAD_CONFIG", "1")
    await expect(resolveAwsCredentialsForS3()).resolves.toMatchObject({ accessKeyId: "FILE_KEY", secretAccessKey: "file-secret" })
  })

  it("keeps anonymous resolution when the opted-in config has no matching profile", async () => {
    sharedConfig("[profile other]\naws_access_key_id = OTHER\naws_secret_access_key = other-secret\n")
    vi.stubEnv("AWS_PROFILE", "release")
    vi.stubEnv("AWS_SDK_LOAD_CONFIG", "1")
    await expect(resolveAwsCredentialsForS3()).resolves.toBeUndefined()
  })

  it("surfaces an unresolved opted-in SSO profile instead of signing anonymously", async () => {
    sharedConfig(
      "[profile release]\nsso_session = missing\nsso_account_id = 123456789012\nsso_role_name = Publisher\n[sso-session missing]\nsso_start_url = https://example.com/start\nsso_region = us-east-1\n"
    )
    vi.stubEnv("AWS_PROFILE", "release")
    vi.stubEnv("AWS_SDK_LOAD_CONFIG", "1")
    await expect(resolveAwsCredentialsForS3()).rejects.toThrow()
  })
})
