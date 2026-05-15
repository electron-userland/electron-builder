import { EventEmitter } from "events"
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest"

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
    mockHttpResponse(403, "<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>")
    await expect(getBucketLocation("my.dotted.bucket")).rejects.toThrow("HTTP 403")
  })

  it("rejects on a 400 error response", async () => {
    mockHttpResponse(400, "<Error><Code>NoSuchBucket</Code></Error>")
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

  it("maps the legacy 'EU' token to 'eu-west-1'", async () => {
    // AWS returns "EU" for eu-west-1 buckets created before 2014
    mockHttpResponse(200, '<?xml version="1.0" encoding="UTF-8"?><LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">EU</LocationConstraint>')
    expect(await getBucketLocation("my.dotted.bucket")).toBe("eu-west-1")
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
    const region = await getBucketLocation("my.dotted.bucket")
    expect(region).toBe("us-west-2")
    expect(region).not.toMatch(/[{"\n\r]/)
  })

  it("returns bare 'us-east-1' for the default region, matching binary contract", async () => {
    mockHttpResponse(200, '<?xml version="1.0" encoding="UTF-8"?><LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/"/>')
    const region = await getBucketLocation("my.dotted.bucket")
    expect(region).toBe("us-east-1")
    expect(region).not.toMatch(/[{"\n\r]/)
  })
})
