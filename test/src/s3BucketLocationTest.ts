import { EventEmitter } from "events"
import { InvalidConfigurationError } from "builder-util"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Must be hoisted before the module under test is imported so vitest intercepts the require.
vi.mock("https")
vi.mock("electron-publish/src/s3/awsCredentials", async importOriginal => ({
  ...(await importOriginal<typeof import("electron-publish/src/s3/awsCredentials")>()),
  resolveS3Credentials: vi.fn().mockResolvedValue({ accessKeyId: "test-key", secretAccessKey: "test-secret" }),
}))

// Import after mock is in place.
import * as https from "https"
import { AwsCredentials, resolveS3Credentials } from "electron-publish/src/s3/awsCredentials"
import { getBucketLocation } from "electron-publish/src/s3/bucketLocation"
import { S3Publisher } from "electron-publish/internal"

const TEST_CREDENTIALS: AwsCredentials = { accessKeyId: "test-key", secretAccessKey: "test-secret" }

// ─── Mock helper ─────────────────────────────────────────────────────────────

/**
 * Sets up https.request to return a single mock HTTP response.
 * Mimics the EventEmitter contract used inside getBucketLocation:
 *   const req = request(opts, res => { ... res.on("data", ...) res.on("end", ...) })
 *   req.on("error", ...)
 *   req.end()
 */
function mockHttpResponse(statusCode: number, body: string): void {
  vi.mocked(https.request).mockImplementationOnce((_opts: unknown, callback: unknown) => {
    const req = new EventEmitter() as ReturnType<typeof https.request>
    ;(req as any).end = vi.fn(() => {
      setImmediate(() => {
        const res = new EventEmitter() as any
        res.statusCode = statusCode
        ;(callback as (res: unknown) => void)(res)
        setImmediate(() => {
          res.emit("data", body)
          res.emit("end")
        })
      })
    })
    ;(req as any).destroy = vi.fn()
    return req
  })
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe("getBucketLocation — XML response parsing", () => {
  beforeEach(() => {
    vi.mocked(https.request).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("extracts the region from a populated LocationConstraint element", async () => {
    mockHttpResponse(200, '<?xml version="1.0" encoding="UTF-8"?><LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">us-west-2</LocationConstraint>')
    expect(await getBucketLocation("my.dotted.bucket", TEST_CREDENTIALS)).toBe("us-west-2")
  })

  it("returns 'us-east-1' for a self-closing (empty) LocationConstraint element", async () => {
    // AWS returns an empty element for buckets in the default region (us-east-1)
    mockHttpResponse(200, '<?xml version="1.0" encoding="UTF-8"?><LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/"/>')
    expect(await getBucketLocation("my.dotted.bucket", TEST_CREDENTIALS)).toBe("us-east-1")
  })

  it("returns 'us-east-1' for an explicitly empty LocationConstraint element", async () => {
    mockHttpResponse(200, '<?xml version="1.0"?><LocationConstraint></LocationConstraint>')
    expect(await getBucketLocation("my.dotted.bucket", TEST_CREDENTIALS)).toBe("us-east-1")
  })

  it("rejects on a non-200 HTTP status", async () => {
    mockHttpResponse(403, "<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>")
    await expect(getBucketLocation("my.dotted.bucket", TEST_CREDENTIALS)).rejects.toThrow("HTTP 403")
  })

  it("rejects on a 400 error response", async () => {
    mockHttpResponse(400, "<Error><Code>NoSuchBucket</Code></Error>")
    await expect(getBucketLocation("my.dotted.bucket", TEST_CREDENTIALS)).rejects.toThrow("HTTP 400")
  })

  it("rejects when the request emits a network error", async () => {
    vi.mocked(https.request).mockImplementationOnce((_opts: unknown, _callback: unknown) => {
      const req = new EventEmitter() as ReturnType<typeof https.request>
      ;(req as any).end = vi.fn(() => {
        setImmediate(() => req.emit("error", new Error("ECONNREFUSED")))
      })
      return req
    })
    await expect(getBucketLocation("my.dotted.bucket", TEST_CREDENTIALS)).rejects.toThrow("ECONNREFUSED")
  })

  it("rejects when the response body exceeds 64 KB", async () => {
    // Guard against memory exhaustion from a malicious/unexpected S3 response
    mockHttpResponse(200, "x".repeat(65537))
    await expect(getBucketLocation("my.dotted.bucket", TEST_CREDENTIALS)).rejects.toThrow("response too large")
  })

  it("rejects when the extracted region contains unexpected characters", async () => {
    // Guard against a tampered response injecting an invalid region string
    mockHttpResponse(200, "<LocationConstraint>../evil\ninjection</LocationConstraint>")
    await expect(getBucketLocation("my.dotted.bucket", TEST_CREDENTIALS)).rejects.toThrow("unexpected region")
  })

  it("maps the legacy 'EU' token to 'eu-west-1'", async () => {
    // AWS returns "EU" for eu-west-1 buckets created before 2014
    mockHttpResponse(200, '<?xml version="1.0" encoding="UTF-8"?><LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
    expect(await getBucketLocation("my.dotted.bucket", TEST_CREDENTIALS)).toBe("eu-west-1")
  })
})

// ─── Credentials: getBucketLocation signs with exactly the given credentials ───

describe("getBucketLocation — credentials", { concurrent: false }, () => {
  beforeEach(() => {
    vi.mocked(https.request).mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("signs the request with the given credentials", async () => {
    mockHttpResponse(200, "<LocationConstraint>us-west-2</LocationConstraint>")

    await getBucketLocation("my.bucket", { accessKeyId: "AKIATEST", secretAccessKey: "secret", sessionToken: "session" })

    const callArgs = vi.mocked(https.request).mock.calls.at(-1)?.[0] as any
    expect(callArgs?.headers?.Authorization).toMatch(/Credential=AKIATEST\//)
    expect(callArgs?.headers?.["X-Amz-Security-Token"]).toBe("session")
  })

  it("refuses to sign without credentials instead of letting aws4 read env or send Credential=undefined", async () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AMBIENT_KEY")
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "ambient-secret")
    vi.stubEnv("AWS_ACCESS_KEY", "LEGACY_KEY")
    await expect(getBucketLocation("public-bucket", undefined as unknown as AwsCredentials)).rejects.toThrow(/AWS credentials are required/)
    await expect(getBucketLocation("public-bucket", { accessKeyId: "", secretAccessKey: "" })).rejects.toThrow(/AWS credentials are required/)
    expect(https.request).not.toHaveBeenCalled()
  })
})

// ─── S3Publisher.checkAndResolveOptions: dotted bucket region lookup ─────────

describe("S3Publisher.checkAndResolveOptions — dotted bucket region", { concurrent: false }, () => {
  let bucketCounter = 0
  // the region cache is per process, so each test uses its own bucket
  const uniqueBucket = () => `releases.example.${Date.now()}.${bucketCounter++}`

  beforeEach(() => {
    vi.mocked(https.request).mockClear()
    vi.mocked(resolveS3Credentials).mockClear()
  })

  it("does not resolve credentials or call AWS when not publishing (errorIfCannot=false)", async () => {
    const options: any = { provider: "s3", bucket: uniqueBucket(), awsCredentials: { source: "profile", profile: "sso" } }
    await S3Publisher.checkAndResolveOptions(options, null, false)
    expect(resolveS3Credentials).not.toHaveBeenCalled()
    expect(https.request).not.toHaveBeenCalled()
    expect(options.region).toBeUndefined()
  })

  it("resolves credentials from the configured source when publishing, once per bucket", async () => {
    const bucket = uniqueBucket()
    const awsCredentials = { source: "profile", profile: "sso" }
    vi.mocked(resolveS3Credentials).mockResolvedValueOnce({ accessKeyId: "AKIAPROFILE", secretAccessKey: "s" })
    mockHttpResponse(200, "<LocationConstraint>eu-west-2</LocationConstraint>")

    const first: any = { provider: "s3", bucket, awsCredentials }
    const second: any = { provider: "s3", bucket, awsCredentials }
    const notPublishing: any = { provider: "s3", bucket, awsCredentials }
    await S3Publisher.checkAndResolveOptions(first, null, true)
    await S3Publisher.checkAndResolveOptions(second, null, true)
    // a later non-publish resolution (e.g. AppImage app-update.yml) reuses the looked-up region without credentials
    await S3Publisher.checkAndResolveOptions(notPublishing, null, false)

    expect([first.region, second.region, notPublishing.region]).toEqual(["eu-west-2", "eu-west-2", "eu-west-2"])
    expect(resolveS3Credentials).toHaveBeenCalledTimes(1)
    expect(resolveS3Credentials).toHaveBeenCalledWith(awsCredentials)
    expect(https.request).toHaveBeenCalledTimes(1)
    expect((vi.mocked(https.request).mock.calls[0][0] as any).headers.Authorization).toMatch(/Credential=AKIAPROFILE\//)
  })

  it("propagates credential errors when publishing and does not cache them", async () => {
    const bucket = uniqueBucket()
    const awsCredentials = { source: "env" }
    vi.mocked(resolveS3Credentials).mockRejectedValueOnce(new Error("SSO session expired"))
    await expect(S3Publisher.checkAndResolveOptions({ provider: "s3", bucket, awsCredentials } as any, null, true)).rejects.toThrow("SSO session expired")
    expect(https.request).not.toHaveBeenCalled()

    mockHttpResponse(200, "<LocationConstraint>ap-south-1</LocationConstraint>")
    const options: any = { provider: "s3", bucket, awsCredentials }
    await S3Publisher.checkAndResolveOptions(options, null, true)
    expect(options.region).toBe("ap-south-1")
  })

  it("skips the lookup when region or endpoint is set", async () => {
    const awsCredentials = { source: "env" }
    await S3Publisher.checkAndResolveOptions({ provider: "s3", bucket: uniqueBucket(), region: "us-west-1", awsCredentials } as any, null, true)
    await S3Publisher.checkAndResolveOptions({ provider: "s3", bucket: uniqueBucket(), endpoint: "https://minio.local", awsCredentials } as any, null, true)
    expect(resolveS3Credentials).not.toHaveBeenCalled()
  })

  it("requires an explicit awsCredentials.source when publishing, before any credential resolution", async () => {
    for (const awsCredentials of [undefined, null, {}]) {
      const promise = S3Publisher.checkAndResolveOptions({ provider: "s3", bucket: uniqueBucket(), awsCredentials } as any, null, true)
      await expect(promise).rejects.toBeInstanceOf(InvalidConfigurationError)
      await expect(promise).rejects.toThrow(/requires an explicit credential source/)
    }
    // also for a non-dotted bucket, where no region lookup is needed
    await expect(S3Publisher.checkAndResolveOptions({ provider: "s3", bucket: "plain-bucket" } as any, null, true)).rejects.toThrow(/requires an explicit credential source/)
    expect(resolveS3Credentials).not.toHaveBeenCalled()
    expect(https.request).not.toHaveBeenCalled()
  })

  it("does not require awsCredentials when not publishing", async () => {
    await expect(S3Publisher.checkAndResolveOptions({ provider: "s3", bucket: uniqueBucket() } as any, null, false)).resolves.toBeUndefined()
    await expect(S3Publisher.checkAndResolveOptions({ provider: "s3", bucket: "plain-bucket" } as any, null, false)).resolves.toBeUndefined()
    expect(resolveS3Credentials).not.toHaveBeenCalled()
  })
})

// ─── Output-format contract: JS implementation vs app-builder-bin binary ─────

describe("getBucketLocation — output format matches binary contract", () => {
  // The app-builder-bin binary writes a bare region string to stdout with no JSON wrapper
  // and no extra whitespace beyond a potential trailing newline (which callers strip with
  // .trim()). These tests verify the JS implementation produces the same bare-string format.

  beforeEach(() => {
    vi.mocked(https.request).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns a bare region string with no JSON wrapping or trailing whitespace", async () => {
    mockHttpResponse(200, '<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">us-west-2</LocationConstraint>')
    const region = await getBucketLocation("my.dotted.bucket", TEST_CREDENTIALS)
    expect(region).toBe("us-west-2")
    expect(region).not.toMatch(/[{"\n\r]/)
  })

  it("returns bare 'us-east-1' for the default region, matching binary contract", async () => {
    mockHttpResponse(200, '<?xml version="1.0" encoding="UTF-8"?><LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/"/>')
    const region = await getBucketLocation("my.dotted.bucket", TEST_CREDENTIALS)
    expect(region).toBe("us-east-1")
    expect(region).not.toMatch(/[{"\n\r]/)
  })
})
