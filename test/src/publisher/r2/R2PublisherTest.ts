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

import { CancellationToken, getS3LikeProviderBaseUrl, R2Options } from "builder-util-runtime"
import { R2Publisher, PublishContext } from "electron-publish"
import { beforeEach, expect } from "vitest"
import { R2TestFixtures } from "./R2TestFixtures"

// ---------------------------------------------------------------------------
// Shared context
// ---------------------------------------------------------------------------

function makeContext(): PublishContext {
  return { cancellationToken: new CancellationToken(), progress: null }
}

// ---------------------------------------------------------------------------
// Helper: call the protected configureS3Options and capture the args array
// ---------------------------------------------------------------------------
function captureArgs(publisher: R2Publisher, envSetup?: () => { restore(): void }): string[] {
  const env = envSetup ? envSetup() : R2TestFixtures.setupCredentials()
  try {
    const args: string[] = []
    ;(publisher as any).configureS3Options(args)
    return args
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
// R2Publisher — configureS3Options (S3 arg construction)
// ============================================================================

describe("R2Publisher.configureS3Options", () => {
  let ctx: PublishContext

  beforeEach(() => {
    ctx = makeContext()
  })

  /**
   * [CF-S3-API] Endpoint format: https://<accountId>.r2.cloudflarestorage.com
   * The upload endpoint is the S3-compatible API endpoint.  The protocol is
   * NOT included in the --endpoint arg because app-builder normalises it (as
   * evidenced by SpacesPublisher, which has always passed a bare hostname).
   */
  describe("endpoint — [CF-S3-API]", () => {
    test("passes --endpoint as bare hostname (no https:// prefix)", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const args = captureArgs(publisher)
      const endpointIdx = args.indexOf("--endpoint")
      expect(endpointIdx).toBeGreaterThanOrEqual(0)
      const endpointValue = args[endpointIdx + 1]
      expect(endpointValue).not.toMatch(/^https?:\/\//)
    })

    test("endpoint hostname contains the configured accountId", () => {
      const accountId = R2TestFixtures.ACCOUNT_IDS.valid
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions({ accountId }))
      const args = captureArgs(publisher)
      const endpointValue = args[args.indexOf("--endpoint") + 1]
      expect(endpointValue).toContain(accountId)
    })

    test("endpoint hostname ends with .r2.cloudflarestorage.com", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const args = captureArgs(publisher)
      const endpointValue = args[args.indexOf("--endpoint") + 1]
      expect(endpointValue).toMatch(/\.r2\.cloudflarestorage\.com$/)
    })

    test("full endpoint is <accountId>.r2.cloudflarestorage.com", () => {
      const accountId = R2TestFixtures.ACCOUNT_IDS.valid
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions({ accountId }))
      const args = captureArgs(publisher)
      const endpointValue = args[args.indexOf("--endpoint") + 1]
      expect(endpointValue).toBe(`${accountId}.r2.cloudflarestorage.com`)
    })
  })

  /**
   * [CF-S3-API] "R2 uses 'auto' as its region designation."
   * Reference: https://developers.cloudflare.com/r2/api/s3/api/#bucket-region
   * Using any other region value will cause Cloudflare to reject the request.
   */
  describe("region — [CF-S3-API]", () => {
    test("passes --region auto", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const args = captureArgs(publisher)
      const regionIdx = args.indexOf("--region")
      expect(regionIdx).toBeGreaterThanOrEqual(0)
      expect(args[regionIdx + 1]).toBe("auto")
    })
  })

  /**
   * [CF-S3-API] "Unsupported S3 features" explicitly lists "ACL controls and
   * permissions" as absent from R2.  Sending an --acl arg causes Cloudflare
   * to return a NotImplemented error.  The publisher must NOT call
   * super.configureS3Options(), which would inject --acl public-read.
   * Reference: https://developers.cloudflare.com/r2/api/s3/api/#unsupported-s3-features
   */
  describe("ACL omission — [CF-S3-API]", () => {
    test("does not pass an --acl argument (R2 does not support S3 ACLs)", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const args = captureArgs(publisher)
      expect(args).not.toContain("--acl")
    })

    test("does not pass --acl even when BaseS3Options.acl is omitted from config", () => {
      const opts = R2TestFixtures.createOptions()
      // R2Options.acl is typed as `never`, but even if someone passes an
      // object literal without the override, no --acl arg should appear.
      const publisher = new R2Publisher(ctx, opts)
      const args = captureArgs(publisher)
      expect(args).not.toContain("--acl")
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
      const args = captureArgs(publisher)
      const keyIdx = args.indexOf("--accessKey")
      expect(keyIdx).toBeGreaterThanOrEqual(0)
      expect(args[keyIdx + 1]).toBe(R2TestFixtures.CREDENTIALS.accessKey)
    })

    test("reads secret key from CF_R2_SECRET_ACCESS_KEY env var", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const args = captureArgs(publisher)
      const secretIdx = args.indexOf("--secretKey")
      expect(secretIdx).toBeGreaterThanOrEqual(0)
      expect(args[secretIdx + 1]).toBe(R2TestFixtures.CREDENTIALS.secretKey)
    })

    test("throws a clear error when CF_R2_ACCESS_KEY_ID is absent", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const env = R2TestFixtures.setupCredentials()
      delete process.env.CF_R2_ACCESS_KEY_ID
      try {
        expect(() => {
          const args: string[] = []
          ;(publisher as any).configureS3Options(args)
        }).toThrow(/CF_R2_ACCESS_KEY_ID/)
      } finally {
        env.restore()
      }
    })

    test("throws a clear error when CF_R2_SECRET_ACCESS_KEY is absent", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const env = R2TestFixtures.setupCredentials()
      delete process.env.CF_R2_SECRET_ACCESS_KEY
      try {
        expect(() => {
          const args: string[] = []
          ;(publisher as any).configureS3Options(args)
        }).toThrow(/CF_R2_SECRET_ACCESS_KEY/)
      } finally {
        env.restore()
      }
    })

    test("throws a clear error when CF_R2_ACCESS_KEY_ID is empty string", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const env = R2TestFixtures.setupCredentials("", R2TestFixtures.CREDENTIALS.secretKey)
      try {
        expect(() => {
          const args: string[] = []
          ;(publisher as any).configureS3Options(args)
        }).toThrow(/CF_R2_ACCESS_KEY_ID/)
      } finally {
        env.restore()
      }
    })

    test("throws a clear error when CF_R2_SECRET_ACCESS_KEY is empty string", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const env = R2TestFixtures.setupCredentials(R2TestFixtures.CREDENTIALS.accessKey, "")
      try {
        expect(() => {
          const args: string[] = []
          ;(publisher as any).configureS3Options(args)
        }).toThrow(/CF_R2_SECRET_ACCESS_KEY/)
      } finally {
        env.restore()
      }
    })

    test("error message references the CF R2 token documentation URL", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const env = R2TestFixtures.setupCredentials()
      delete process.env.CF_R2_ACCESS_KEY_ID
      try {
        expect(() => {
          const args: string[] = []
          ;(publisher as any).configureS3Options(args)
        }).toThrow(/developers\.cloudflare\.com/)
      } finally {
        env.restore()
      }
    })
  })

  describe("full args shape", () => {
    test("args contain --endpoint, --region, --accessKey, --secretKey in that order", () => {
      const publisher = new R2Publisher(ctx, R2TestFixtures.createOptions())
      const args = captureArgs(publisher)
      const keys = args.filter(a => a.startsWith("--"))
      expect(keys).toEqual(["--endpoint", "--region", "--accessKey", "--secretKey"])
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
   * This URL requires authentication; the fallback is preserved for configurations
   * where the operator knows the bucket's CORS / public-read policy allows
   * unauthenticated access via the API endpoint (non-default setup).
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
 * Run with:
 *   CF_R2_ACCESS_KEY_ID=<key> CF_R2_SECRET_ACCESS_KEY=<secret> \
 *   CF_R2_BUCKET=<bucket>    CF_R2_ACCOUNT_ID=<accountId>      \
 *   TEST_FILES=R2PublisherTest pnpm ci:test
 */
test.ifEnv(process.env.CF_R2_ACCESS_KEY_ID != null && process.env.CF_R2_SECRET_ACCESS_KEY != null && process.env.CF_R2_BUCKET != null && process.env.CF_R2_ACCOUNT_ID != null)(
  "R2 live upload smoke test",
  async () => {
    const { createPublisher } = await import("app-builder-lib/out/publish/PublishManager")
    const publishContext = makeContext()
    const options: R2Options = {
      provider: "r2",
      bucket: process.env.CF_R2_BUCKET!,
      accountId: process.env.CF_R2_ACCOUNT_ID!,
      publicUrl: process.env.CF_R2_PUBLIC_URL ?? null,
    }
    const publisher = await createPublisher(publishContext, "0.0.1", options, {}, {} as any)
    await publisher!.upload({ file: R2TestFixtures.ICON_PATH, arch: 0 })
    // Upload again to verify overwrite does not fail
    await publisher!.upload({ file: R2TestFixtures.ICON_PATH, arch: 0 })
  }
)
