/**
 * Unit tests for R2Publisher and its supporting functions in publishOptions.ts.
 *
 * Each describe block is annotated with the Cloudflare R2 API documentation
 * section that the behaviour under test is derived from, so the relationship
 * between the implementation and the upstream spec is always traceable.
 *
 * API references used in this file:
 *   [CF-S3-API]      https://developers.cloudflare.com/r2/api/s3/api/
 *   [CF-S3-TOKENS]   https://developers.cloudflare.com/r2/api/s3/tokens/
 *   [CF-PUBLIC]      https://developers.cloudflare.com/r2/buckets/public-buckets/
 *   [CF-ACCT-ID]     https://developers.cloudflare.com/fundamentals/setup/find-account-and-zone-ids/
 */

import { createPublisher } from "app-builder-lib/internal"
import { log } from "builder-util"
import { CancellationToken, getS3LikeProviderBaseUrl, R2Options } from "builder-util-runtime"
import { R2Publisher, PublishContext } from "electron-publish"
import { deleteS3Object } from "electron-publish/src/s3/s3UploadHelper"
import * as path from "path"
import { beforeEach, expect, vi } from "vitest"
import { R2TestFixtures } from "./R2TestFixtures"

// ---------------------------------------------------------------------------
// Shared context
// ---------------------------------------------------------------------------

function makeContext(): PublishContext {
  return { cancellationToken: new CancellationToken(), progress: null }
}

// ---------------------------------------------------------------------------
// Helper: resolve the S3 upload config under known credentials, restoring env after.
// ---------------------------------------------------------------------------
function resolveUploadConfig(publisher: R2Publisher, envSetup?: () => { restore(): void }): ReturnType<R2Publisher["getS3UploadConfig"]> {
  const env = envSetup ? envSetup() : R2TestFixtures.setupCredentials()
  try {
    return publisher.getS3UploadConfig()
  } finally {
    env.restore()
  }
}

// ============================================================================
// R2Publisher — checkAndResolveOptions
// ============================================================================

describe("R2Publisher.checkAndResolveOptions", () => {
  /**
   * [CF-S3-API] The S3-compatible API endpoint is:
   *   https://<accountId>.r2.cloudflarestorage.com
   * where <accountId> is a 32-character hexadecimal string.
   * [CF-ACCT-ID] Account IDs are always 32 lowercase hex characters.
   */
  describe("accountId validation", () => {
    // checkAndResolveOptions throws synchronously for invalid input before
    // returning the Promise, so we use expect(() => ...).toThrow() here.

    test("accepts a valid 32-char lowercase hex accountId", async () => {
      const opts = R2TestFixtures.createOptions({ accountId: R2TestFixtures.ACCOUNT_IDS.valid })
      await expect(R2Publisher.checkAndResolveOptions(opts, null, true)).resolves.toBeUndefined()
    })

    test("accepts a valid 32-char uppercase hex accountId (case-insensitive)", async () => {
      const opts = R2TestFixtures.createOptions({ accountId: R2TestFixtures.ACCOUNT_IDS.validUpperCase })
      await expect(R2Publisher.checkAndResolveOptions(opts, null, true)).resolves.toBeUndefined()
    })

    test("accepts a valid 32-char mixed-case hex accountId", async () => {
      const opts = R2TestFixtures.createOptions({ accountId: R2TestFixtures.ACCOUNT_IDS.validMixedCase })
      await expect(R2Publisher.checkAndResolveOptions(opts, null, true)).resolves.toBeUndefined()
    })

    test("rejects an empty accountId", () => {
      const opts = R2TestFixtures.createOptions({ accountId: R2TestFixtures.ACCOUNT_IDS.empty })
      expect(() => R2Publisher.checkAndResolveOptions(opts, null, true)).toThrow(/accountId/)
    })

    test("rejects a whitespace-only accountId", () => {
      const opts = R2TestFixtures.createOptions({ accountId: R2TestFixtures.ACCOUNT_IDS.whitespace })
      expect(() => R2Publisher.checkAndResolveOptions(opts, null, true)).toThrow(/accountId/)
    })

    test("rejects an accountId that is too short (16 chars)", () => {
      const opts = R2TestFixtures.createOptions({ accountId: R2TestFixtures.ACCOUNT_IDS.tooShort })
      expect(() => R2Publisher.checkAndResolveOptions(opts, null, true)).toThrow(/32-character/)
    })

    test("rejects an accountId that is too long (33 chars)", () => {
      const opts = R2TestFixtures.createOptions({ accountId: R2TestFixtures.ACCOUNT_IDS.tooLong })
      expect(() => R2Publisher.checkAndResolveOptions(opts, null, true)).toThrow(/32-character/)
    })

    test("rejects an accountId containing non-hex characters", () => {
      const opts = R2TestFixtures.createOptions({ accountId: R2TestFixtures.ACCOUNT_IDS.nonHex })
      expect(() => R2Publisher.checkAndResolveOptions(opts, null, true)).toThrow(/32-character/)
    })

    /**
     * Security: accountId is interpolated into a hostname for the upload endpoint.
     * A foreign domain suffix (.evil.com) would silently redirect all uploads to
     * an attacker-controlled server, leaking the signed Authorization header.
     */
    test("rejects an accountId with an injected domain suffix (security: SSRF-style redirect)", () => {
      const opts = R2TestFixtures.createOptions({ accountId: R2TestFixtures.ACCOUNT_IDS.withDomainSuffix })
      expect(() => R2Publisher.checkAndResolveOptions(opts, null, true)).toThrow(/32-character/)
    })

    test("rejects an accountId with a '#' fragment character (security: hostname truncation)", () => {
      const opts = R2TestFixtures.createOptions({ accountId: R2TestFixtures.ACCOUNT_IDS.withFragment })
      expect(() => R2Publisher.checkAndResolveOptions(opts, null, true)).toThrow(/32-character/)
    })
  })

  describe("bucket validation", () => {
    test("accepts a valid bucket name", async () => {
      const opts = R2TestFixtures.createOptions({ bucket: R2TestFixtures.BUCKETS.valid })
      await expect(R2Publisher.checkAndResolveOptions(opts, null, true)).resolves.toBeUndefined()
    })

    test("rejects an empty bucket name", () => {
      const opts = R2TestFixtures.createOptions({ bucket: R2TestFixtures.BUCKETS.empty })
      expect(() => R2Publisher.checkAndResolveOptions(opts, null, true)).toThrow(/bucket/)
    })

    test("rejects a whitespace-only bucket name", () => {
      const opts = R2TestFixtures.createOptions({ bucket: R2TestFixtures.BUCKETS.whitespace })
      expect(() => R2Publisher.checkAndResolveOptions(opts, null, true)).toThrow(/bucket/)
    })
  })

  /**
   * Security: publicUrl is baked into app-update.yml and consumed by electron-updater on
   * end-user machines. A plaintext-http or malformed value would downgrade update transport
   * (MITM exposure) for every client. Unlike s3/spaces the host is operator-supplied, so it
   * must be validated at build time. [CF-PUBLIC]
   */
  describe("publicUrl validation (security: end-user download transport)", () => {
    test("accepts a valid https custom-domain publicUrl", async () => {
      const opts = R2TestFixtures.createOptions({ publicUrl: R2TestFixtures.PUBLIC_URLS.customDomain })
      await expect(R2Publisher.checkAndResolveOptions(opts, null, true)).resolves.toBeUndefined()
    })

    test("accepts a valid https r2.dev publicUrl", async () => {
      const opts = R2TestFixtures.createOptions({ publicUrl: R2TestFixtures.PUBLIC_URLS.r2dev })
      await expect(R2Publisher.checkAndResolveOptions(opts, null, true)).resolves.toBeUndefined()
    })

    test("accepts a null/omitted publicUrl when auto-update publishing is disabled", async () => {
      const opts = R2TestFixtures.createOptions({ publicUrl: null, publishAutoUpdate: false })
      await expect(R2Publisher.checkAndResolveOptions(opts, null, true)).resolves.toBeUndefined()
    })

    test("rejects a plaintext http publicUrl (transport downgrade)", () => {
      const opts = R2TestFixtures.createOptions({ publicUrl: "http://releases.example.com" })
      expect(() => R2Publisher.checkAndResolveOptions(opts, null, true)).toThrow(/https/)
    })

    test("rejects a malformed publicUrl", () => {
      const opts = R2TestFixtures.createOptions({ publicUrl: "not a url" })
      expect(() => R2Publisher.checkAndResolveOptions(opts, null, true)).toThrow(/valid URL/)
    })

    test("rejects a non-http(s) scheme publicUrl (e.g. file://)", () => {
      const opts = R2TestFixtures.createOptions({ publicUrl: "file:///etc/passwd" })
      expect(() => R2Publisher.checkAndResolveOptions(opts, null, true)).toThrow(/https/)
    })
  })

  /**
   * [CF-JURISDICTION] Buckets created with a jurisdictional restriction live on
   * https://<accountId>.<jurisdiction>.r2.cloudflarestorage.com. The value is interpolated
   * into the endpoint hostname, so unknown values must be rejected at build time.
   * Reference: https://developers.cloudflare.com/r2/reference/data-location/#jurisdictional-restrictions
   */
  describe("jurisdiction validation — [CF-JURISDICTION]", () => {
    test.each(["eu", "fedramp-moderate"] as const)("accepts the '%s' jurisdiction", async jurisdiction => {
      const opts = R2TestFixtures.createOptions({ jurisdiction })
      await expect(R2Publisher.checkAndResolveOptions(opts, null, true)).resolves.toBeUndefined()
    })

    test("accepts an omitted jurisdiction (regular bucket)", async () => {
      const opts = R2TestFixtures.createOptions({ jurisdiction: null })
      await expect(R2Publisher.checkAndResolveOptions(opts, null, true)).resolves.toBeUndefined()
    })

    test("rejects an unknown jurisdiction", () => {
      const opts = R2TestFixtures.createOptions({ jurisdiction: "mars" as any })
      expect(() => R2Publisher.checkAndResolveOptions(opts, null, true)).toThrow(/jurisdiction/)
    })

    test("rejects a jurisdiction with an injected domain suffix (security: hostname injection)", () => {
      const opts = R2TestFixtures.createOptions({ jurisdiction: "eu.evil.com" as any })
      expect(() => R2Publisher.checkAndResolveOptions(opts, null, true)).toThrow(/jurisdiction/)
    })
  })

  /**
   * [CF-PUBLIC] The S3 API endpoint always requires SigV4 authentication; R2 public access is
   * exclusively r2.dev subdomains or custom domains. If app-update.yml were generated without a
   * publicUrl, electron-updater on end-user machines would hit the API endpoint unauthenticated
   * and fail with 401 at runtime — so the build must fail (or at least warn) instead.
   */
  describe("publicUrl requirement for auto-update — [CF-PUBLIC]", () => {
    test("throws when publicUrl is missing and publishAutoUpdate is not false (errorIfCannot=true)", () => {
      const opts = R2TestFixtures.createOptions({ publicUrl: null })
      expect(() => R2Publisher.checkAndResolveOptions(opts, null, true)).toThrow(/publicUrl/)
    })

    test("throws when publicUrl is whitespace-only and publishAutoUpdate is not false (errorIfCannot=true)", () => {
      const opts = R2TestFixtures.createOptions({ publicUrl: "   " })
      expect(() => R2Publisher.checkAndResolveOptions(opts, null, true)).toThrow(/publicUrl/)
    })

    test("throws when publicUrl is missing and publishAutoUpdate is explicitly true (errorIfCannot=true)", () => {
      const opts = R2TestFixtures.createOptions({ publicUrl: null, publishAutoUpdate: true })
      expect(() => R2Publisher.checkAndResolveOptions(opts, null, true)).toThrow(/publicUrl/)
    })

    test("error message explains that R2 public access requires r2.dev or a custom domain", () => {
      const opts = R2TestFixtures.createOptions({ publicUrl: null })
      expect(() => R2Publisher.checkAndResolveOptions(opts, null, true)).toThrow(/r2\.dev|custom domain/)
    })

    test("warns instead of throwing when errorIfCannot=false", async () => {
      const warnSpy = vi.spyOn(log, "warn").mockImplementation(() => {})
      try {
        const opts = R2TestFixtures.createOptions({ publicUrl: null })
        await expect(R2Publisher.checkAndResolveOptions(opts, null, false)).resolves.toBeUndefined()
        expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/publicUrl/))
      } finally {
        warnSpy.mockRestore()
      }
    })

    test("passes without publicUrl when publishAutoUpdate is false (errorIfCannot=true)", async () => {
      const opts = R2TestFixtures.createOptions({ publicUrl: null, publishAutoUpdate: false })
      await expect(R2Publisher.checkAndResolveOptions(opts, null, true)).resolves.toBeUndefined()
    })
  })

  describe("channel propagation", () => {
    test("copies channelFromAppVersion into options.channel when options.channel is null", async () => {
      const opts = R2TestFixtures.createOptions({ channel: null })
      await R2Publisher.checkAndResolveOptions(opts, "beta", true)
      expect((opts as any).channel).toBe("beta")
    })

    test("preserves an already-set options.channel", async () => {
      const opts = R2TestFixtures.createOptions({ channel: "nightly" })
      await R2Publisher.checkAndResolveOptions(opts, "beta", true)
      expect((opts as any).channel).toBe("nightly")
    })

    test("leaves channel unchanged when channelFromAppVersion is null", async () => {
      const opts = R2TestFixtures.createOptions({ channel: null })
      await R2Publisher.checkAndResolveOptions(opts, null, true)
      expect((opts as any).channel).toBeNull()
    })
  })
})

// ============================================================================
// R2Publisher — getS3UploadConfig (native S3 SDK upload config)
// ============================================================================

describe("R2Publisher.getS3UploadConfig", () => {
  let ctx: PublishContext

  beforeEach(() => {
    ctx = makeContext()
  })

  /**
   * [CF-S3-API] Endpoint format: https://<accountId>.r2.cloudflarestorage.com
   * The upload endpoint is the S3-compatible API endpoint. The native uploader
   * (s3UploadHelper) builds a path-style request from this full URL, so the
   * scheme (https://) must be included.
   */
  describe("endpoint — [CF-S3-API]", () => {
    test("endpoint is a fully-qualified https URL", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const config = resolveUploadConfig(publisher)
      expect(config.endpoint).toMatch(/^https:\/\//)
    })

    test("endpoint contains the configured accountId", () => {
      const accountId = R2TestFixtures.ACCOUNT_IDS.valid
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions({ accountId }))
      const config = resolveUploadConfig(publisher)
      expect(config.endpoint).toContain(accountId)
    })

    test("endpoint host ends with .r2.cloudflarestorage.com", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const config = resolveUploadConfig(publisher)
      expect(new URL(config.endpoint!).hostname).toMatch(/\.r2\.cloudflarestorage\.com$/)
    })

    test("full endpoint is https://<accountId>.r2.cloudflarestorage.com", () => {
      const accountId = R2TestFixtures.ACCOUNT_IDS.valid
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions({ accountId }))
      const config = resolveUploadConfig(publisher)
      expect(config.endpoint).toBe(`https://${accountId}.r2.cloudflarestorage.com`)
    })

    /**
     * [CF-JURISDICTION] Jurisdictional buckets are only reachable via
     * https://<accountId>.<jurisdiction>.r2.cloudflarestorage.com
     * Reference: https://developers.cloudflare.com/r2/reference/data-location/#jurisdictional-restrictions
     */
    test.each(["eu", "fedramp-moderate"] as const)("endpoint includes the '%s' jurisdiction subdomain", jurisdiction => {
      const accountId = R2TestFixtures.ACCOUNT_IDS.valid
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions({ accountId, jurisdiction }))
      const config = resolveUploadConfig(publisher)
      expect(config.endpoint).toBe(`https://${accountId}.${jurisdiction}.r2.cloudflarestorage.com`)
    })

    test("endpoint has no jurisdiction subdomain when jurisdiction is omitted", () => {
      const accountId = R2TestFixtures.ACCOUNT_IDS.valid
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions({ accountId, jurisdiction: null }))
      const config = resolveUploadConfig(publisher)
      expect(config.endpoint).toBe(`https://${accountId}.r2.cloudflarestorage.com`)
    })
  })

  /**
   * [CF-S3-API] "R2 uses 'auto' as its region designation."
   * Reference: https://developers.cloudflare.com/r2/api/s3/api/#bucket-region
   * Using any other region value will cause Cloudflare to reject the request.
   */
  describe("region — [CF-S3-API]", () => {
    test("region is 'auto'", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const config = resolveUploadConfig(publisher)
      expect(config.region).toBe("auto")
    })
  })

  /**
   * [CF-S3-TOKENS] R2 API tokens produce an S3-compatible credential pair:
   *   - Access Key ID  → CF_R2_ACCESS_KEY_ID
   *   - Secret Access Key → CF_R2_SECRET_ACCESS_KEY
   * Reference: https://developers.cloudflare.com/r2/api/s3/tokens/
   */
  describe("credentials — [CF-S3-TOKENS]", () => {
    test("reads access key from CF_R2_ACCESS_KEY_ID env var", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const config = resolveUploadConfig(publisher)
      expect(config.credentials?.accessKeyId).toBe(R2TestFixtures.CREDENTIALS.accessKey)
    })

    test("reads secret key from CF_R2_SECRET_ACCESS_KEY env var", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const config = resolveUploadConfig(publisher)
      expect(config.credentials?.secretAccessKey).toBe(R2TestFixtures.CREDENTIALS.secretKey)
    })

    test("does not fall back to AWS_* credentials (R2 uses CF_R2_* only)", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const env = R2TestFixtures.setupCredentials()
      const savedAws = process.env.AWS_ACCESS_KEY_ID
      process.env.AWS_ACCESS_KEY_ID = "aws-should-not-be-used"
      try {
        const config = publisher.getS3UploadConfig()
        expect(config.credentials?.accessKeyId).toBe(R2TestFixtures.CREDENTIALS.accessKey)
      } finally {
        if (savedAws === undefined) {
          delete process.env.AWS_ACCESS_KEY_ID
        } else {
          process.env.AWS_ACCESS_KEY_ID = savedAws
        }
        env.restore()
      }
    })

    test("throws a clear error when CF_R2_ACCESS_KEY_ID is absent", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const env = R2TestFixtures.clearCredentials()
      try {
        expect(() => publisher.getS3UploadConfig()).toThrow(/CF_R2_ACCESS_KEY_ID/)
      } finally {
        env.restore()
      }
    })

    test("throws a clear error when CF_R2_SECRET_ACCESS_KEY is absent", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const env = R2TestFixtures.setupCredentials()
      delete process.env.CF_R2_SECRET_ACCESS_KEY
      try {
        expect(() => publisher.getS3UploadConfig()).toThrow(/CF_R2_SECRET_ACCESS_KEY/)
      } finally {
        env.restore()
      }
    })

    test("throws a clear error when CF_R2_ACCESS_KEY_ID is empty string", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const env = R2TestFixtures.setupCredentials("", R2TestFixtures.CREDENTIALS.secretKey)
      try {
        expect(() => publisher.getS3UploadConfig()).toThrow(/CF_R2_ACCESS_KEY_ID/)
      } finally {
        env.restore()
      }
    })

    test("throws a clear error when CF_R2_SECRET_ACCESS_KEY is empty string", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const env = R2TestFixtures.setupCredentials(R2TestFixtures.CREDENTIALS.accessKey, "")
      try {
        expect(() => publisher.getS3UploadConfig()).toThrow(/CF_R2_SECRET_ACCESS_KEY/)
      } finally {
        env.restore()
      }
    })

    test("error message references the CF R2 token documentation URL", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const env = R2TestFixtures.clearCredentials()
      try {
        expect(() => publisher.getS3UploadConfig()).toThrow(/developers\.cloudflare\.com/)
      } finally {
        env.restore()
      }
    })
  })
})

// ============================================================================
// R2Publisher — getUploadExtraParams (ACL handling)
// ============================================================================

describe("R2Publisher.getUploadExtraParams", () => {
  let ctx: PublishContext

  beforeEach(() => {
    ctx = makeContext()
  })

  /**
   * [CF-S3-API] "Unsupported S3 features" explicitly lists "ACL controls and
   * permissions" as absent from R2. Sending an x-amz-acl header causes Cloudflare
   * to return a NotImplemented error. The publisher must override the parent's
   * default "public-read" ACL so no ACL header is emitted.
   * Reference: https://developers.cloudflare.com/r2/api/s3/api/#unsupported-s3-features
   */
  describe("ACL omission — [CF-S3-API]", () => {
    test("acl is undefined (R2 does not support S3 ACLs)", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const params = publisher.getUploadExtraParams()
      expect(params.acl).toBeUndefined()
    })

    test("does not inherit the parent's default public-read ACL", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const params = publisher.getUploadExtraParams()
      expect(params.acl).not.toBe("public-read")
    })

    test("emits no storageClass or serverSideEncryption (R2-unsupported)", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const params = publisher.getUploadExtraParams()
      expect(params.storageClass).toBeUndefined()
      expect(params.serverSideEncryption).toBeUndefined()
    })
  })
})

// ============================================================================
// R2Publisher — identity
// ============================================================================

describe("R2Publisher identity", () => {
  test("providerName is 'r2'", () => {
    const publisher = new R2Publisher(makeContext(), R2TestFixtures.createOptions())
    expect(publisher.providerName).toBe("r2")
  })

  test("getBucketName returns the configured bucket", () => {
    const publisher = new R2Publisher(makeContext(), R2TestFixtures.createOptions({ bucket: "release-bucket" }))
    expect((publisher as any).getBucketName()).toBe("release-bucket")
  })

  test("toString includes the bucket name", () => {
    const publisher = new R2Publisher(makeContext(), R2TestFixtures.createOptions({ bucket: "release-bucket" }))
    expect(publisher.toString()).toContain("release-bucket")
  })
})

// ============================================================================
// r2Url / getS3LikeProviderBaseUrl — URL construction
// ============================================================================

describe("r2Url (via getS3LikeProviderBaseUrl)", () => {
  /**
   * [CF-PUBLIC] R2 buckets are private by default. Public object access requires
   * a custom domain or r2.dev subdomain — not the S3 API endpoint.
   * electron-updater uses getS3LikeProviderBaseUrl() to build the URL from which
   * end-user machines download latest.yml and update binaries.  Those machines
   * have no credentials, so the URL must be the public-facing one.
   *
   * This is the critical architectural difference from S3/Spaces: on AWS/DO the
   * same hostname serves both API and public traffic; on R2 they are separate.
   * Reference: https://developers.cloudflare.com/r2/buckets/public-buckets/
   */
  describe("publicUrl takes precedence over the S3 API endpoint — [CF-PUBLIC]", () => {
    test("returns publicUrl as base when publicUrl is set", () => {
      const url = getS3LikeProviderBaseUrl(R2TestFixtures.createOptions({ publicUrl: R2TestFixtures.PUBLIC_URLS.r2dev }))
      expect(url).toContain("r2.dev")
      expect(url).not.toContain("r2.cloudflarestorage.com")
    })

    test("returns a r2.dev subdomain URL correctly (development public access)", () => {
      const url = getS3LikeProviderBaseUrl(R2TestFixtures.createOptions({ publicUrl: R2TestFixtures.PUBLIC_URLS.r2dev }))
      expect(url).toBe(R2TestFixtures.PUBLIC_URLS.r2dev)
    })

    test("returns a custom domain URL correctly (production public access)", () => {
      const url = getS3LikeProviderBaseUrl(R2TestFixtures.createOptions({ publicUrl: R2TestFixtures.PUBLIC_URLS.customDomain }))
      expect(url).toBe(R2TestFixtures.PUBLIC_URLS.customDomain)
    })

    test("strips a trailing slash from publicUrl to prevent double-slashes", () => {
      const url = getS3LikeProviderBaseUrl(R2TestFixtures.createOptions({ publicUrl: R2TestFixtures.PUBLIC_URLS.withTrailingSlash }))
      expect(url).not.toMatch(/\/$/)
      expect(url).toBe("https://releases.example.com")
    })

    test("appends the path option to the publicUrl", () => {
      const url = getS3LikeProviderBaseUrl(R2TestFixtures.createOptions({ publicUrl: R2TestFixtures.PUBLIC_URLS.customDomain, path: "stable" }))
      expect(url).toBe("https://releases.example.com/stable")
    })

    test("appends path with leading slash without double-slash", () => {
      const url = getS3LikeProviderBaseUrl(R2TestFixtures.createOptions({ publicUrl: R2TestFixtures.PUBLIC_URLS.customDomain, path: "/stable" }))
      expect(url).toBe("https://releases.example.com/stable")
    })
  })

  /**
   * [CF-S3-API] When no publicUrl is provided the function falls back to the S3
   * API endpoint, which is:  https://<accountId>.r2.cloudflarestorage.com/<bucket>
   * This fallback exists only for compatibility: app-update.yml files baked into
   * already-shipped apps may lack publicUrl, and electron-updater must still resolve
   * a URL for them rather than crash. The endpoint always requires SigV4 authentication,
   * so requests to it will fail with 401 on R2 unless the operator fronts the bucket
   * some other way (e.g. an authenticating proxy or CDN on a different host).
   * New builds are prevented from reaching this state: R2Publisher.checkAndResolveOptions
   * requires publicUrl at build time whenever publishAutoUpdate is not false.
   */
  describe("fallback to S3 API endpoint when publicUrl is absent — [CF-S3-API]", () => {
    test("returns the S3 API endpoint when publicUrl is null", () => {
      const url = getS3LikeProviderBaseUrl(R2TestFixtures.createOptions({ publicUrl: null }))
      expect(url).toContain("r2.cloudflarestorage.com")
    })

    test("S3 API endpoint URL contains the accountId subdomain", () => {
      const accountId = R2TestFixtures.ACCOUNT_IDS.valid
      const url = getS3LikeProviderBaseUrl(R2TestFixtures.createOptions({ accountId, publicUrl: null }))
      expect(url).toContain(accountId)
    })

    test("S3 API endpoint URL contains the bucket as a path segment", () => {
      const url = getS3LikeProviderBaseUrl(R2TestFixtures.createOptions({ bucket: "my-releases", publicUrl: null }))
      expect(url).toContain("/my-releases")
    })

    test("S3 API endpoint URL has the expected format", () => {
      const accountId = R2TestFixtures.ACCOUNT_IDS.valid
      const url = getS3LikeProviderBaseUrl(R2TestFixtures.createOptions({ accountId, bucket: "my-releases", publicUrl: null }))
      expect(url).toBe(`https://${accountId}.r2.cloudflarestorage.com/my-releases`)
    })

    test("appends the path option to the S3 API endpoint", () => {
      const accountId = R2TestFixtures.ACCOUNT_IDS.valid
      const url = getS3LikeProviderBaseUrl(R2TestFixtures.createOptions({ accountId, bucket: "my-releases", path: "beta", publicUrl: null }))
      expect(url).toBe(`https://${accountId}.r2.cloudflarestorage.com/my-releases/beta`)
    })

    /**
     * [CF-JURISDICTION] The fallback endpoint must honour the bucket's jurisdiction —
     * a jurisdictional bucket does not exist on the default endpoint at all.
     */
    test.each(["eu", "fedramp-moderate"] as const)("fallback endpoint includes the '%s' jurisdiction subdomain", jurisdiction => {
      const accountId = R2TestFixtures.ACCOUNT_IDS.valid
      const url = getS3LikeProviderBaseUrl(R2TestFixtures.createOptions({ accountId, bucket: "my-releases", publicUrl: null, jurisdiction }))
      expect(url).toBe(`https://${accountId}.${jurisdiction}.r2.cloudflarestorage.com/my-releases`)
    })

    test("fallback endpoint has no jurisdiction subdomain when jurisdiction is omitted", () => {
      const accountId = R2TestFixtures.ACCOUNT_IDS.valid
      const url = getS3LikeProviderBaseUrl(R2TestFixtures.createOptions({ accountId, bucket: "my-releases", publicUrl: null, jurisdiction: null }))
      expect(url).toBe(`https://${accountId}.r2.cloudflarestorage.com/my-releases`)
    })

    test("publicUrl still takes precedence over the jurisdictional endpoint", () => {
      const url = getS3LikeProviderBaseUrl(R2TestFixtures.createOptions({ publicUrl: R2TestFixtures.PUBLIC_URLS.customDomain, jurisdiction: "eu" }))
      expect(url).toBe(R2TestFixtures.PUBLIC_URLS.customDomain)
    })
  })

  describe("input validation", () => {
    test("throws when bucket is empty string", () => {
      expect(() => getS3LikeProviderBaseUrl(R2TestFixtures.createOptions({ bucket: "", publicUrl: null }))).toThrow(/bucket/)
    })

    test("throws when accountId is empty string", () => {
      expect(() => getS3LikeProviderBaseUrl(R2TestFixtures.createOptions({ accountId: "", publicUrl: null }))).toThrow(/accountId/)
    })
  })
})

// ============================================================================
// Live upload test — requires real R2 credentials
// ============================================================================

/**
 * [CF-S3-TOKENS] Live smoke test: upload a real file to R2.
 * The token must have at minimum "Object Read & Write" permission on the bucket.
 * Reference: https://developers.cloudflare.com/r2/api/s3/tokens/#permissions
 *
 * Gated on the CF_R2_* environment variables (in CI these are repository secrets,
 * only available on the upstream repository — the test is skipped everywhere else).
 *
 * Run with:
 *   CF_R2_ACCESS_KEY_ID=<key> CF_R2_SECRET_ACCESS_KEY=<secret> \
 *   CF_R2_BUCKET=<bucket>    CF_R2_ACCOUNT_ID=<accountId>      \
 *   TEST_FILES=R2PublisherTest pnpm ci:test
 */
// Empty strings count as absent: a CI env file may define the vars with empty values
// when the corresponding repository secrets are not configured.
const isSet = (value: string | undefined): boolean => value != null && value.trim() !== ""
const liveEnv = {
  accessKeyId: process.env.CF_R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY,
  bucket: process.env.CF_R2_BUCKET,
  accountId: process.env.CF_R2_ACCOUNT_ID,
  publicUrl: process.env.CF_R2_PUBLIC_URL,
}

test.ifEnv(isSet(liveEnv.accessKeyId) && isSet(liveEnv.secretAccessKey) && isSet(liveEnv.bucket) && isSet(liveEnv.accountId))("R2 live upload smoke test", async () => {
  const publishContext = makeContext()
  const options: R2Options = {
    provider: "r2",
    bucket: liveEnv.bucket!,
    accountId: liveEnv.accountId!,
    publicUrl: isSet(liveEnv.publicUrl) ? liveEnv.publicUrl : null,
    // the smoke test only exercises the upload path; no app-update.yml is generated
    publishAutoUpdate: isSet(liveEnv.publicUrl),
  }
  const publisher = (await createPublisher(publishContext, "0.0.1", options, {}, {} as any)) as R2Publisher
  try {
    await publisher.upload({ file: R2TestFixtures.ICON_PATH, arch: 0 })
    // Upload again to verify overwrite does not fail
    await publisher.upload({ file: R2TestFixtures.ICON_PATH, arch: 0 })
  } finally {
    // Best-effort cleanup: remove the uploaded object so repeated CI runs do not accumulate files.
    const config = publisher.getS3UploadConfig()
    await deleteS3Object({
      bucket: liveEnv.bucket!,
      key: path.basename(R2TestFixtures.ICON_PATH),
      ...config,
    }).catch((error: Error) => console.warn(`R2 smoke test cleanup failed (non-fatal): ${error.message}`))
  }
})
