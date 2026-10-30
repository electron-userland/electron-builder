import { AllPublishOptions, getS3LikeProviderBaseUrl, R2Options, S3Options, SpacesOptions } from "builder-util-runtime"
import { createClient } from "electron-updater/src/providerFactory"
import { GenericProvider } from "electron-updater/src/providers/GenericProvider"
import type { AppUpdater } from "electron-updater/src/AppUpdater"
import type { ProviderRuntimeOptions } from "electron-updater/src/providers/Provider"
import { describe, expect, test } from "vitest"
import { FakeElectronHttpExecutor } from "../helpers/updaterTestUtil.js"

// electron-updater resolves an `app-update.yml` publish config into a Provider on the END-USER
// machine. The s3/spaces/r2 providers all fall through to a GenericProvider pointed at the
// S3-like base URL. None of this routing was covered before; these tests pin it for all three.

const runtimeOptions: ProviderRuntimeOptions = {
  isUseMultipleRangeRequest: true,
  platform: "darwin",
  executor: {} as any,
}

const updater = {} as AppUpdater

function r2(overrides: Partial<R2Options> = {}): R2Options {
  return {
    provider: "r2",
    bucket: "my-releases",
    accountId: "abcdef1234567890abcdef1234567890",
    publicUrl: "https://pub-abcdef1234567890abcdef1234567890.r2.dev",
    ...overrides,
  }
}

describe("createClient — r2 routing", () => {
  test("routes r2 to a GenericProvider", () => {
    const provider = createClient(r2(), updater, runtimeOptions)
    expect(provider).toBeInstanceOf(GenericProvider)
  })

  test("uses the publicUrl-derived base URL (the end-user download host)", () => {
    const options = r2()
    const provider = createClient(options, updater, runtimeOptions) as any
    expect(provider.configuration.url).toBe(getS3LikeProviderBaseUrl(options))
    expect(provider.configuration.url).toContain("r2.dev")
    expect(provider.configuration.url).not.toContain("cloudflarestorage.com")
  })

  test("falls back to the authenticated S3 API endpoint when publicUrl is absent", () => {
    // Compatibility fallback: app-update.yml files from apps built before publicUrl became
    // required at build time may lack it, and the updater must still resolve a URL for them.
    // The S3 API endpoint always requires SigV4 authentication, so this URL will 401 on R2
    // unless the operator fronts the bucket some other way.
    const options = r2({ publicUrl: null })
    const provider = createClient(options, updater, runtimeOptions) as any
    expect(provider.configuration.url).toBe(`https://${options.accountId}.r2.cloudflarestorage.com/${options.bucket}`)
  })

  test.each(["eu", "fedramp"] as const)("fallback S3 API endpoint includes the '%s' jurisdiction subdomain", jurisdiction => {
    // Jurisdictional buckets only exist on https://<accountId>.<jurisdiction>.r2.cloudflarestorage.com —
    // note the dot on BOTH sides of the jurisdiction label.
    const options = r2({ publicUrl: null, jurisdiction })
    const provider = createClient(options, updater, runtimeOptions) as any
    expect(provider.configuration.url).toBe(`https://${options.accountId}.${jurisdiction}.r2.cloudflarestorage.com/${options.bucket}`)
  })

  test("fallback S3 API endpoint has no jurisdiction subdomain when jurisdiction is omitted", () => {
    const options = r2({ publicUrl: null, jurisdiction: null })
    const provider = createClient(options, updater, runtimeOptions) as any
    expect(provider.configuration.url).toBe(`https://${options.accountId}.r2.cloudflarestorage.com/${options.bucket}`)
  })

  test("propagates the channel", () => {
    const provider = createClient(r2({ channel: "beta" }), updater, runtimeOptions) as any
    expect(provider.configuration.channel).toBe("beta")
  })

  test("defaults channel to null when unset", () => {
    const provider = createClient(r2(), updater, runtimeOptions) as any
    expect(provider.configuration.channel).toBeNull()
  })

  test("forces isUseMultipleRangeRequest=false (R2/minio incompatibility)", () => {
    // The s3-like branch overrides the incoming runtimeOptions to disable multi-range requests.
    const provider = createClient(r2(), updater, { ...runtimeOptions, isUseMultipleRangeRequest: true }) as any
    expect(provider.runtimeOptions.isUseMultipleRangeRequest).toBe(false)
  })
})

describe("createClient — s3/spaces share the r2 fall-through", () => {
  test("routes s3 to a GenericProvider with the s3 base URL", () => {
    const options: S3Options = { provider: "s3", bucket: "my-bucket" }
    const provider = createClient(options, updater, runtimeOptions) as any
    expect(provider).toBeInstanceOf(GenericProvider)
    expect(provider.configuration.url).toBe(getS3LikeProviderBaseUrl(options))
  })

  test("routes spaces to a GenericProvider with the spaces base URL", () => {
    const options: SpacesOptions = { provider: "spaces", name: "my-space", region: "nyc3" }
    const provider = createClient(options, updater, runtimeOptions) as any
    expect(provider).toBeInstanceOf(GenericProvider)
    expect(provider.configuration.url).toBe(getS3LikeProviderBaseUrl(options))
  })
})

// Download URLs chosen by the update manifest get the credential-bearing request headers only on the feedBaseUrl origin.
describe("createClient — feedBaseUrl", () => {
  const cases: Array<{ name: string; options: AllPublishOptions; expected: string | null }> = [
    { name: "generic", options: { provider: "generic", url: "https://feed.example.com/updates?token=s" }, expected: "https://feed.example.com/updates/?token=s" },
    { name: "s3", options: { provider: "s3", bucket: "my-bucket" }, expected: "https://my-bucket.s3.amazonaws.com/" },
    { name: "keygen", options: { provider: "keygen", account: "acc", product: "prod" }, expected: "https://api.keygen.sh/v1/accounts/acc/artifacts/?product=prod" },
    { name: "bitbucket", options: { provider: "bitbucket", owner: "owner", slug: "repo" }, expected: "https://api.bitbucket.org/2.0/repositories/owner/repo/downloads/" },
    { name: "github", options: { provider: "github", owner: "owner", repo: "repo" }, expected: "https://github.com/" },
    { name: "gitlab", options: { provider: "gitlab", projectId: 1, host: "gitlab.example.com" }, expected: "https://gitlab.example.com/api/v4/" },
    // private GitHub asset downloads are API URLs that need the token on the first request: an explicit null, not undeclared
    { name: "private github", options: { provider: "github", owner: "owner", repo: "repo", token: "t" }, expected: null },
  ]

  test.each(cases)("$name", ({ options, expected }) => {
    const feedBaseUrl = createClient(options, updater, runtimeOptions).feedBaseUrl
    expect(expected == null ? feedBaseUrl : feedBaseUrl?.href).toBe(expected)
  })
})

// The update info (channel file, release feed or API response) is read into memory and parsed before anything verifies it: its size is limited.
describe("createClient — update info response size", () => {
  const MAX_UPDATE_INFO_RESPONSE_SIZE = 10 * 1024 * 1024
  const tooLarge = { statusCode: 200, body: Buffer.alloc(MAX_UPDATE_INFO_RESPONSE_SIZE + 1, "a") }

  test("a channel file larger than the limit fails the check", async () => {
    const executor = new FakeElectronHttpExecutor(() => tooLarge)
    const provider = createClient({ provider: "generic", url: "https://feed.example.com/updates" }, updater, { ...runtimeOptions, executor })
    await expect(provider.getLatestVersion()).rejects.toMatchObject({ code: "ERR_HTTP_RESPONSE_TOO_LARGE" })
  })

  test("so does one behind a redirect", async () => {
    const executor = new FakeElectronHttpExecutor(url => (url.startsWith("https://feed.example.com/") ? { location: "https://cdn.example.com/latest-mac.yml" } : tooLarge))
    const provider = createClient({ provider: "generic", url: "https://feed.example.com/updates" }, updater, { ...runtimeOptions, executor })
    await expect(provider.getLatestVersion()).rejects.toMatchObject({ code: "ERR_HTTP_RESPONSE_TOO_LARGE" })
    expect(executor.sent.map(it => it.url)).toEqual(["https://feed.example.com/updates/latest-mac.yml", "https://cdn.example.com/latest-mac.yml"])
  })

  // the API answers with a response over the limit: its code is kept, not wrapped in a "latest version not found" error
  test("a GitHub /releases/latest response larger than the limit fails the check", async () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><link href="https://github.com/owner/repo/releases/tag/v1.1.0"/><title>1.1.0</title></entry></feed>`
    const executor = new FakeElectronHttpExecutor(url => (url.endsWith(".atom") ? { statusCode: 200, body: Buffer.from(feed) } : tooLarge))
    const provider = createClient({ provider: "github", owner: "owner", repo: "repo" }, updater, { ...runtimeOptions, executor })
    await expect(provider.getLatestVersion()).rejects.toMatchObject({ code: "ERR_HTTP_RESPONSE_TOO_LARGE" })
    expect(executor.sent.map(it => it.url)).toEqual(["https://github.com/owner/repo/releases.atom", "https://github.com/owner/repo/releases/latest"])
  })

  test("a private GitHub release response larger than the limit fails the check", async () => {
    const executor = new FakeElectronHttpExecutor(() => tooLarge)
    const provider = createClient({ provider: "github", owner: "owner", repo: "repo", token: "t" }, updater, { ...runtimeOptions, executor })
    await expect(provider.getLatestVersion()).rejects.toMatchObject({ code: "ERR_HTTP_RESPONSE_TOO_LARGE" })
    expect(executor.sent.map(it => it.url)).toEqual(["https://api.github.com/repos/owner/repo/releases/latest"])
  })

  const providers: Array<{ name: string; options: AllPublishOptions }> = [
    { name: "generic", options: { provider: "generic", url: "https://feed.example.com/updates" } },
    { name: "github", options: { provider: "github", owner: "owner", repo: "repo" } },
    { name: "private github", options: { provider: "github", owner: "owner", repo: "repo", token: "t" } },
    { name: "gitlab", options: { provider: "gitlab", projectId: 1 } },
    { name: "bitbucket", options: { provider: "bitbucket", owner: "owner", slug: "repo" } },
    { name: "keygen", options: { provider: "keygen", account: "acc", product: "prod" } },
  ]

  test.each(providers)("$name requests carry the limit", ({ options }) => {
    const provider = createClient(options, updater, runtimeOptions) as any
    expect(provider.createRequestOptions(new URL("https://example.com/latest.yml")).maxResponseSize).toBe(MAX_UPDATE_INFO_RESPONSE_SIZE)
  })
})
