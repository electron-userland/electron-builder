import { EventEmitter } from "events"
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest"
import { executeAppBuilder } from "builder-util"

// Must be hoisted before the module under test is imported so vitest intercepts the require.
vi.mock("https")

// Import after mock is in place.
import * as https from "https"
import { getBucketLocation } from "electron-publish/src/s3/bucketLocation"

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
        ;(callback as Function)(res)
        setImmediate(() => {
          res.emit("data", body)
          res.emit("end")
        })
      })
    })
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
    expect(await getBucketLocation("my.dotted.bucket")).toBe("us-west-2")
  })

  it("returns 'us-east-1' for a self-closing (empty) LocationConstraint element", async () => {
    // AWS returns an empty element for buckets in the default region (us-east-1)
    mockHttpResponse(200, '<?xml version="1.0" encoding="UTF-8"?><LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/"/>')
    expect(await getBucketLocation("my.dotted.bucket")).toBe("us-east-1")
  })

  it("returns 'us-east-1' for an explicitly empty LocationConstraint element", async () => {
    mockHttpResponse(200, '<?xml version="1.0"?><LocationConstraint></LocationConstraint>')
    expect(await getBucketLocation("my.dotted.bucket")).toBe("us-east-1")
  })

  it("rejects on a non-200 HTTP status", async () => {
    mockHttpResponse(403, '<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>')
    await expect(getBucketLocation("my.dotted.bucket")).rejects.toThrow("HTTP 403")
  })

  it("rejects on a 400 error response", async () => {
    mockHttpResponse(400, '<Error><Code>NoSuchBucket</Code></Error>')
    await expect(getBucketLocation("my.dotted.bucket")).rejects.toThrow("HTTP 400")
  })

  it("rejects when the request emits a network error", async () => {
    vi.mocked(https.request).mockImplementationOnce((_opts: unknown, _callback: unknown) => {
      const req = new EventEmitter() as ReturnType<typeof https.request>
      ;(req as any).end = vi.fn(() => {
        setImmediate(() => req.emit("error", new Error("ECONNREFUSED")))
      })
      return req
    })
    await expect(getBucketLocation("my.dotted.bucket")).rejects.toThrow("ECONNREFUSED")
  })

  it("rejects when the response body exceeds 64 KB", async () => {
    // Guard against memory exhaustion from a malicious/unexpected S3 response
    mockHttpResponse(200, "x".repeat(65537))
    await expect(getBucketLocation("my.dotted.bucket")).rejects.toThrow("response too large")
  })

  it("rejects when the extracted region contains unexpected characters", async () => {
    // Guard against a tampered response injecting an invalid region string
    mockHttpResponse(200, "<LocationConstraint>../evil\ninjection</LocationConstraint>")
    await expect(getBucketLocation("my.dotted.bucket")).rejects.toThrow("unexpected region")
  })
})

// ─── Parity test: JS implementation vs app-builder-bin binary ────────────────

describe("getBucketLocation — parity with app-builder-bin", () => {
  // Requires real AWS credentials and a dotted bucket name in the environment.
  // Skipped automatically in CI unless both env vars are present.
  const bucket = process.env.TEST_S3_DOTTED_BUCKET
  const hasCredentials = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && bucket)

  it.skipIf(!hasCredentials)("returns the same region as the binary for a real dotted bucket", async () => {
    const [binaryRegion, jsRegion] = await Promise.all([executeAppBuilder(["get-bucket-location", "--bucket", bucket!]), getBucketLocation(bucket!)])

    // Binary returns the region as a plain string (no trailing newline stripped here for clarity)
    expect(jsRegion).toBe(binaryRegion.trim())
  })
})
