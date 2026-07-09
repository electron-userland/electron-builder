import { getS3LikeProviderBaseUrl, R2Options, S3Options, SpacesOptions } from "builder-util-runtime"
import { createClient } from "electron-updater/src/providerFactory"
import { GenericProvider } from "electron-updater/src/providers/GenericProvider"
import type { AppUpdater } from "electron-updater/src/AppUpdater"
import type { ProviderRuntimeOptions } from "electron-updater/src/providers/Provider"
import { describe, expect, test } from "vitest"

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
