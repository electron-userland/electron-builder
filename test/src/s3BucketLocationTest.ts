import { EventEmitter } from "events"
import * as os from "os"
import * as path from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Must be hoisted before the module under test is imported so vitest intercepts the require.
vi.mock("https")
vi.mock("electron-publish/src/s3/awsCredentials", () => ({
  resolveAwsCredentials: vi.fn().mockReturnValue({ accessKeyId: "test-key", secretAccessKey: "test-secret" }),
}))

// Import after mock is in place.
import * as https from "https"
import { resolveAwsCredentials } from "electron-publish/internal"
import { getBucketLocation } from "electron-publish/internal"

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
        ;(callback as (arg: unknown) => void)(res)
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

// ─── Credential chain: getBucketLocation forwards resolved credentials ────────

describe("getBucketLocation — credential chain", () => {
  beforeEach(() => {
    vi.mocked(https.request).mockClear()
    vi.mocked(resolveAwsCredentials).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("calls resolveAwsCredentials() and uses the result for signing", async () => {
    vi.mocked(resolveAwsCredentials).mockReturnValueOnce({ accessKeyId: "AKIATEST", secretAccessKey: "secret" })
    mockHttpResponse(200, "<LocationConstraint>us-west-2</LocationConstraint>")

    await getBucketLocation("my.bucket")

    expect(resolveAwsCredentials).toHaveBeenCalledOnce()
    // The Authorization header in the request should reference the access key
    const callArgs = vi.mocked(https.request).mock.calls[0][0] as any
    const authHeader = callArgs?.headers?.Authorization ?? callArgs?.headers?.authorization ?? ""
    expect(authHeader).toMatch(/AKIATEST/)
  })

  it("still makes the request when no credentials are found (anonymous request)", async () => {
    vi.mocked(resolveAwsCredentials).mockReturnValueOnce(undefined)
    mockHttpResponse(200, "<LocationConstraint>eu-central-1</LocationConstraint>")

    const region = await getBucketLocation("public-bucket")
    expect(region).toBe("eu-central-1")
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

// ─── Credential resolution unit tests ────────────────────────────────────────

describe("resolveAwsCredentials", () => {
  // These tests unshim the module mock and test the real implementation.
  // We exercise the env var path only (the ~/.aws/credentials path is tested via
  // file I/O which would require temp-file setup).

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.mocked(resolveAwsCredentials).mockRestore?.()
  })

  it("returns env-var credentials when AWS_ACCESS_KEY_ID is set", async () => {
    const { resolveAwsCredentials: realResolve } = await vi.importActual<typeof import("electron-publish/internal")>("electron-publish/internal")
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIAENV")
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "env-secret")
    vi.stubEnv("AWS_SESSION_TOKEN", "env-token")

    const creds = realResolve()
    expect(creds).toEqual({ accessKeyId: "AKIAENV", secretAccessKey: "env-secret", sessionToken: "env-token" })
  })

  it("includes sessionToken only when AWS_SESSION_TOKEN is set", async () => {
    const { resolveAwsCredentials: realResolve } = await vi.importActual<typeof import("electron-publish/internal")>("electron-publish/internal")
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIAENV")
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "env-secret")
    vi.stubEnv("AWS_SESSION_TOKEN", "")

    const creds = realResolve()
    expect(creds?.sessionToken).toBeUndefined()
  })

  it("returns undefined when no credentials are configured", async () => {
    const { resolveAwsCredentials: realResolve } = await vi.importActual<typeof import("electron-publish/internal")>("electron-publish/internal")
    vi.stubEnv("AWS_ACCESS_KEY_ID", "")
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "")
    // Point HOME to a non-existent dir so there's no ~/.aws/credentials
    vi.stubEnv("HOME", path.join(os.tmpdir(), "no-such-home-" + Date.now()))

    const creds = realResolve()
    expect(creds).toBeUndefined()
  })
})
