import { AllPublishOptions, DEFAULT_MAX_UPDATE_INFO_SIZE, getS3LikeProviderBaseUrl, R2Options, S3Options, SpacesOptions } from "builder-util-runtime"
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

// The channel file (latest*.yml) is read into memory and parsed before anything verifies it: its size is limited. Release feeds and API
// responses (release listings and lookups) grow with the release history and are not limited.
describe("createClient — channel file size", () => {
  const LIMIT = 1024
  const padding = "a".repeat(2 * LIMIT)
  const channelFile =
    "version: 1.1.0\nfiles:\n  - url: TestApp-1.1.0.zip\n    sha512: c2hhNTEy\n    size: 1\npath: TestApp-1.1.0.zip\nsha512: c2hhNTEy\nreleaseDate: '2024-01-01T00:00:00.000Z'\n"
  const largeChannelFile = `${channelFile}#${padding}\n`
  const ok = (body: string) => ({ statusCode: 200, body: Buffer.from(body) })

  // a feed host whose release listings and lookups are larger than LIMIT, answering every channel file with `channel`
  function host(channel: string, feedPadding = padding) {
    return (url: string) => {
      if (url.endsWith("/releases.atom")) {
        return ok(
          `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><link href="https://github.com/owner/repo/releases/tag/v1.1.0"/><title>1.1.0</title><content>${feedPadding}</content></entry></feed>`
        )
      }
      if (url === "https://github.com/owner/repo/releases/latest") {
        return ok(JSON.stringify({ tag_name: "v1.1.0", padding }))
      }
      if (url === "https://api.github.com/repos/owner/repo/releases/latest") {
        const asset = { name: "latest-mac.yml", url: "https://api.github.com/repos/owner/repo/releases/assets/1" }
        return ok(JSON.stringify({ tag_name: "v1.1.0", name: "1.1.0", html_url: "https://github.com/owner/repo/releases/tag/v1.1.0", body: padding, assets: [asset] }))
      }
      if (url === "https://gitlab.com/api/v4/projects/1/releases/permalink/latest") {
        const link = { name: "latest-mac.yml", direct_asset_url: "https://gitlab.com/api/v4/projects/1/packages/generic/app/1.1.0/latest-mac.yml" }
        return ok(JSON.stringify({ tag_name: "v1.1.0", name: "1.1.0", description: padding, upcoming_release: false, assets: { links: [link] } }))
      }
      return ok(channel)
    }
  }

  const providers: Array<{ name: string; options: AllPublishOptions }> = [
    { name: "generic", options: { provider: "generic", url: "https://feed.example.com/updates" } },
    { name: "github", options: { provider: "github", owner: "owner", repo: "repo" } },
    { name: "private github", options: { provider: "github", owner: "owner", repo: "repo", token: "t" } },
    { name: "gitlab", options: { provider: "gitlab", projectId: 1 } },
    { name: "bitbucket", options: { provider: "bitbucket", owner: "owner", slug: "repo" } },
    { name: "keygen", options: { provider: "keygen", account: "acc", product: "prod" } },
  ]

  function createProvider(options: AllPublishOptions, channel: string, maxUpdateInfoSize = LIMIT) {
    const executor = new FakeElectronHttpExecutor(host(channel))
    const provider = createClient(options, updater, { ...runtimeOptions, executor })
    provider.setMaxUpdateInfoSize(maxUpdateInfoSize)
    return { provider, executor }
  }

  test.each(providers)("$name: release listings and lookups larger than the limit are read", async ({ options }) => {
    const { provider } = createProvider(options, channelFile)
    await expect(provider.getLatestVersion()).resolves.toMatchObject({ version: "1.1.0" })
  })

  // Bitbucket, Keygen: the code is kept, not wrapped in a "latest version not found" error
  test.each(providers)("$name: a channel file larger than the limit fails the check with an error naming the options", async ({ options }) => {
    const { provider, executor } = createProvider(options, largeChannelFile)
    await expect(provider.getLatestVersion()).rejects.toMatchObject({
      code: "ERR_HTTP_RESPONSE_TOO_LARGE",
      message: expect.stringContaining(`${LIMIT} bytes: raise the limit with maxUpdateInfoSize in the publish configuration (app-update.yml) or autoUpdater.maxUpdateInfoSize`),
    })
    expect(executor.sent.at(-1)?.url).toMatch(/(latest|stable)-mac\.yml|releases\/assets\/1/)
  })

  test.each(providers)("$name: 0 disables the limit", async ({ options }) => {
    const { provider } = createProvider(options, largeChannelFile, 0)
    await expect(provider.getLatestVersion()).resolves.toMatchObject({ version: "1.1.0" })
  })

  test("a GitHub releases feed larger than the default limit is read", async () => {
    const executor = new FakeElectronHttpExecutor(host(channelFile, "a".repeat(DEFAULT_MAX_UPDATE_INFO_SIZE + 1)))
    const provider = createClient({ provider: "github", owner: "owner", repo: "repo" }, updater, { ...runtimeOptions, executor })
    await expect(provider.getLatestVersion()).resolves.toMatchObject({ version: "1.1.0" })
  })

  test("a channel file larger than the default limit behind a redirect fails the check", async () => {
    const tooLarge = { statusCode: 200, body: Buffer.alloc(DEFAULT_MAX_UPDATE_INFO_SIZE + 1, "a") }
    const executor = new FakeElectronHttpExecutor(url => (url.startsWith("https://feed.example.com/") ? { location: "https://cdn.example.com/latest-mac.yml" } : tooLarge))
    const provider = createClient({ provider: "generic", url: "https://feed.example.com/updates" }, updater, { ...runtimeOptions, executor })
    await expect(provider.getLatestVersion()).rejects.toMatchObject({ code: "ERR_HTTP_RESPONSE_TOO_LARGE" })
    expect(executor.sent.map(it => it.url)).toEqual(["https://feed.example.com/updates/latest-mac.yml", "https://cdn.example.com/latest-mac.yml"])
  })
})
