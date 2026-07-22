import * as path from "path"
import { R2Options } from "builder-util-runtime"

/**
 * Shared fixtures for R2Publisher tests.
 *
 * Account ID format reference:
 *   https://developers.cloudflare.com/fundamentals/setup/find-account-and-zone-ids/
 *   Cloudflare account IDs are 32-character lowercase hexadecimal strings.
 *
 * R2 API token reference:
 *   https://developers.cloudflare.com/r2/api/s3/tokens/
 *   Credentials are an Access Key ID + Secret Access Key derived from an R2 API token.
 *
 * R2 endpoint reference:
 *   https://developers.cloudflare.com/r2/api/s3/api/
 *   S3-compatible endpoint: https://<accountId>.r2.cloudflarestorage.com
 *
 * Public bucket access reference:
 *   https://developers.cloudflare.com/r2/buckets/public-buckets/
 *   Public access requires a custom domain or r2.dev subdomain — not the S3 API endpoint.
 */
export class R2TestFixtures {
  // ---------------------------------------------------------------------------
  // File paths
  // ---------------------------------------------------------------------------
  static readonly ICON_PATH = path.join(__dirname, "..", "..", "..", "fixtures", "test-app", "build", "icon.icns")
  static readonly ICO_PATH = path.join(__dirname, "..", "..", "..", "fixtures", "test-app", "build", "icon.ico")

  // ---------------------------------------------------------------------------
  // Account IDs — Cloudflare account IDs are 32-character hex strings.
  // See: https://developers.cloudflare.com/fundamentals/setup/find-account-and-zone-ids/
  // ---------------------------------------------------------------------------
  static readonly ACCOUNT_IDS = {
    /** Canonical valid 32-char lowercase hex account ID */
    valid: "abcdef1234567890abcdef1234567890",
    /** Uppercase hex must also be accepted (case-insensitive) */
    validUpperCase: "ABCDEF1234567890ABCDEF1234567890",
    /** Mixed case — real Cloudflare IDs may appear this way in dashboards */
    validMixedCase: "AbCdEf1234567890AbCdEf1234567890",
    /** Too short — only 16 characters */
    tooShort: "abcdef1234567890",
    /** Too long — 33 characters */
    tooLong: "abcdef1234567890abcdef1234567890a",
    /** Contains non-hex characters */
    nonHex: "xxxxxx1234567890xxxxxx1234567890",
    /** Injection attempt: appends a foreign domain suffix */
    withDomainSuffix: "abcdef1234567890abcdef1234567890.evil.com",
    /** Injection attempt: contains a '#' to truncate the hostname */
    withFragment: "abcdef1234567890abcdef12345678#x",
    /** Empty string */
    empty: "",
    /** Whitespace only */
    whitespace: "   ",
  } as const

  // ---------------------------------------------------------------------------
  // Bucket names
  // ---------------------------------------------------------------------------
  static readonly BUCKETS = {
    valid: "my-releases",
    withHyphens: "electron-app-releases",
    /** Empty string — must be rejected */
    empty: "",
    /** Whitespace only — must be rejected */
    whitespace: "   ",
  } as const

  // ---------------------------------------------------------------------------
  // R2 API token credentials
  // See: https://developers.cloudflare.com/r2/api/s3/tokens/
  //   Access Key ID and Secret Access Key are generated from an R2 API token.
  //   They are passed as CF_R2_ACCESS_KEY_ID and CF_R2_SECRET_ACCESS_KEY.
  // ---------------------------------------------------------------------------
  static readonly CREDENTIALS = {
    accessKey: "test-r2-access-key-id",
    secretKey: "test-r2-secret-access-key",
  } as const

  // ---------------------------------------------------------------------------
  // Public URLs for electron-updater
  // R2 buckets are private by default; public access requires a custom domain
  // or r2.dev subdomain — the S3 API endpoint cannot serve public requests.
  // See: https://developers.cloudflare.com/r2/buckets/public-buckets/
  // ---------------------------------------------------------------------------
  static readonly PUBLIC_URLS = {
    /** r2.dev development subdomain (rate-limited, non-production) */
    r2dev: "https://pub-abcdef1234567890abcdef1234567890.r2.dev",
    /** Production custom domain */
    customDomain: "https://releases.example.com",
    /** Trailing slash must be stripped to avoid double-slash in paths */
    withTrailingSlash: "https://releases.example.com/",
    /** Sub-path on a custom domain */
    withSubPath: "https://releases.example.com/downloads",
  } as const

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Build a fully valid R2Options object, optionally overriding fields. */
  static createOptions(overrides: Partial<R2Options> = {}): R2Options {
    return {
      provider: "r2",
      bucket: R2TestFixtures.BUCKETS.valid,
      accountId: R2TestFixtures.ACCOUNT_IDS.valid,
      publicUrl: R2TestFixtures.PUBLIC_URLS.r2dev,
      ...overrides,
    }
  }

  /**
   * Set CF_R2_ACCESS_KEY_ID and CF_R2_SECRET_ACCESS_KEY to known test values,
   * returning a restore() function for use in afterEach / finally blocks.
   */
  static setupCredentials(accessKey: string = R2TestFixtures.CREDENTIALS.accessKey, secretKey: string = R2TestFixtures.CREDENTIALS.secretKey) {
    const saved = {
      CF_R2_ACCESS_KEY_ID: process.env.CF_R2_ACCESS_KEY_ID,
      CF_R2_SECRET_ACCESS_KEY: process.env.CF_R2_SECRET_ACCESS_KEY,
    }
    process.env.CF_R2_ACCESS_KEY_ID = accessKey
    process.env.CF_R2_SECRET_ACCESS_KEY = secretKey
    return {
      restore(): void {
        if (saved.CF_R2_ACCESS_KEY_ID === undefined) {
          delete process.env.CF_R2_ACCESS_KEY_ID
        } else {
          process.env.CF_R2_ACCESS_KEY_ID = saved.CF_R2_ACCESS_KEY_ID
        }
        if (saved.CF_R2_SECRET_ACCESS_KEY === undefined) {
          delete process.env.CF_R2_SECRET_ACCESS_KEY
        } else {
          process.env.CF_R2_SECRET_ACCESS_KEY = saved.CF_R2_SECRET_ACCESS_KEY
        }
      },
    }
  }

  /** Remove both credential env vars and return a restore() function. */
  static clearCredentials() {
    const saved = {
      CF_R2_ACCESS_KEY_ID: process.env.CF_R2_ACCESS_KEY_ID,
      CF_R2_SECRET_ACCESS_KEY: process.env.CF_R2_SECRET_ACCESS_KEY,
    }
    // Note: assigning `undefined` to a process.env key coerces it to the string "undefined" —
    // the vars must actually be deleted.
    delete process.env.CF_R2_ACCESS_KEY_ID
    delete process.env.CF_R2_SECRET_ACCESS_KEY
    return {
      restore(): void {
        if (saved.CF_R2_ACCESS_KEY_ID === undefined) {
          delete process.env.CF_R2_ACCESS_KEY_ID
        } else {
          process.env.CF_R2_ACCESS_KEY_ID = saved.CF_R2_ACCESS_KEY_ID
        }
        if (saved.CF_R2_SECRET_ACCESS_KEY === undefined) {
          delete process.env.CF_R2_SECRET_ACCESS_KEY
        } else {
          process.env.CF_R2_SECRET_ACCESS_KEY = saved.CF_R2_SECRET_ACCESS_KEY
        }
      },
    }
  }
}
