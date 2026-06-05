import { EventEmitter } from "events"
import * as os from "os"
import * as path from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ─── Hoist mocks before any module imports ────────────────────────────────────

vi.mock("https")
vi.mock("electron-publish/src/s3/awsCredentials", () => ({
  resolveAwsCredentials: vi.fn().mockReturnValue({ accessKeyId: "test-key", secretAccessKey: "test-secret" }),
}))

// ─── Imports after mocks ──────────────────────────────────────────────────────

import * as https from "https"
import { Arch } from "builder-util"
import { CancellationToken, S3Options, SpacesOptions } from "builder-util-runtime"
import { PublishContext, UploadTask } from "electron-publish"
import { resolveAwsCredentials } from "electron-publish/src/s3/awsCredentials"
import { S3Publisher } from "electron-publish/src/s3/s3Publisher"
import { SpacesPublisher } from "electron-publish/src/s3/spacesPublisher"
import { getS3ContentType } from "electron-publish/src/s3/s3UploadHelper"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(): PublishContext {
  return { cancellationToken: new CancellationToken(), progress: null }
}

function makeTask(file: string): UploadTask {
  return { file, arch: Arch.x64 }
}

function makeS3Publisher(options: Partial<S3Options> = {}): S3Publisher {
  return new S3Publisher(makeContext(), {
    provider: "s3",
    bucket: "test-bucket",
    region: "us-east-1",
    ...options,
  })
}

function makeSpacesPublisher(options: Partial<SpacesOptions> = {}): SpacesPublisher {
  return new SpacesPublisher(makeContext(), {
    provider: "spaces",
    name: "my-space",
    region: "nyc3",
    ...options,
  })
}

/**
 * Sets up https.request to return a 200 OK immediately (for upload tests).
 * Returns the captured request options so tests can assert on URL/headers.
 */
function mockSuccessfulUpload(): { capturedOpts: () => any } {
  let opts: any = null
  vi.mocked(https.request).mockImplementationOnce((requestOpts: unknown, callback: unknown) => {
    opts = requestOpts
    const req = new EventEmitter() as ReturnType<typeof https.request>
    ;(req as any).end = vi.fn()
    ;(req as any).destroy = vi.fn()
    // Simulate a 200 response
    setImmediate(() => {
      const res = new EventEmitter() as any
      res.statusCode = 200
      res.resume = vi.fn()
      ;(callback as (res: unknown) => void)(res)
      setImmediate(() => res.emit("end"))
    })
    // Handle piped stream
    ;(req as any).write = vi.fn()
    return req
  })
  return { capturedOpts: () => opts }
}

// ─── getS3ContentType ─────────────────────────────────────────────────────────

describe("getS3ContentType — mirrors Go binary getContentType()", () => {
  it.each([
    ["app.AppImage", "application/vnd.appimage"],
    ["app.appimage", "application/vnd.appimage"],
    ["app.APPIMAGE", "application/vnd.appimage"],
    ["update.blockmap", "application/gzip"],
    ["app.snap", "application/vnd.snap"],
    ["setup.exe", "application/octet-stream"],
    ["archive.zip", "application/zip"],
    ["disk.dmg", "application/octet-stream"],
    ["file.unknownxyz", "application/octet-stream"],
  ])("%s → %s", (filename, expected) => {
    expect(getS3ContentType(filename)).toBe(expected)
  })
})

// ─── S3Publisher — getS3UploadConfig ─────────────────────────────────────────

describe("S3Publisher — getS3UploadConfig", () => {
  it("forwards region from options", () => {
    expect(makeS3Publisher({ region: "eu-west-1" }).getS3UploadConfig()).toMatchObject({ region: "eu-west-1" })
  })

  it("defaults region to us-east-1 when not set", () => {
    expect(makeS3Publisher({ region: null }).getS3UploadConfig()).toMatchObject({ region: "us-east-1" })
  })

  it("forwards endpoint when set", () => {
    expect(makeS3Publisher({ endpoint: "https://minio.example.com" }).getS3UploadConfig()).toMatchObject({ endpoint: "https://minio.example.com" })
  })

  it("endpoint is undefined when not set", () => {
    const config = makeS3Publisher({ endpoint: null }).getS3UploadConfig()
    expect(config.endpoint).toBeUndefined()
  })

  it("forwards forcePathStyle: true", () => {
    expect(makeS3Publisher({ forcePathStyle: true }).getS3UploadConfig()).toMatchObject({ forcePathStyle: true })
  })

  it("forcePathStyle is undefined when not set", () => {
    const config = makeS3Publisher({ forcePathStyle: undefined }).getS3UploadConfig()
    expect(config.forcePathStyle).toBeUndefined()
  })

  it("uses credentials from resolveAwsCredentials()", () => {
    vi.mocked(resolveAwsCredentials).mockReturnValueOnce({ accessKeyId: "AKIAchain", secretAccessKey: "chain-secret" })
    const config = makeS3Publisher().getS3UploadConfig()
    expect(config.credentials).toEqual({ accessKeyId: "AKIAchain", secretAccessKey: "chain-secret" })
  })
})

// ─── S3Publisher — getUploadExtraParams ──────────────────────────────────────

describe("S3Publisher — getUploadExtraParams", () => {
  it("ACL defaults to public-read", () => {
    expect(makeS3Publisher().getUploadExtraParams()).toMatchObject({ acl: "public-read" })
  })

  it("ACL: private passes through", () => {
    expect(makeS3Publisher({ acl: "private" }).getUploadExtraParams()).toMatchObject({ acl: "private" })
  })

  it("ACL: null → acl is undefined (bucket owner enforced)", () => {
    const params = makeS3Publisher({ acl: null }).getUploadExtraParams()
    expect(params.acl).toBeUndefined()
  })

  it("storageClass is included when set", () => {
    expect(makeS3Publisher({ storageClass: "STANDARD_IA" }).getUploadExtraParams()).toMatchObject({ storageClass: "STANDARD_IA" })
  })

  it("storageClass is undefined when null", () => {
    expect(makeS3Publisher({ storageClass: null }).getUploadExtraParams().storageClass).toBeUndefined()
  })

  it("serverSideEncryption is included when encryption is AES256", () => {
    expect(makeS3Publisher({ encryption: "AES256" }).getUploadExtraParams()).toMatchObject({ serverSideEncryption: "AES256" })
  })

  it("serverSideEncryption is included when encryption is aws:kms", () => {
    expect(makeS3Publisher({ encryption: "aws:kms" }).getUploadExtraParams()).toMatchObject({ serverSideEncryption: "aws:kms" })
  })

  it("serverSideEncryption is undefined when encryption is null", () => {
    expect(makeS3Publisher({ encryption: null }).getUploadExtraParams().serverSideEncryption).toBeUndefined()
  })
})

// ─── SpacesPublisher — getS3UploadConfig ─────────────────────────────────────

describe("SpacesPublisher — getS3UploadConfig", () => {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    savedEnv.DO_KEY_ID = process.env.DO_KEY_ID
    savedEnv.DO_SECRET_KEY = process.env.DO_SECRET_KEY
    process.env.DO_KEY_ID = "do-test-key"
    process.env.DO_SECRET_KEY = "do-test-secret"
  })

  afterEach(() => {
    process.env.DO_KEY_ID = savedEnv.DO_KEY_ID
    process.env.DO_SECRET_KEY = savedEnv.DO_SECRET_KEY
  })

  it("uses DO_KEY_ID / DO_SECRET_KEY as explicit credentials", () => {
    const config = makeSpacesPublisher().getS3UploadConfig()
    expect(config.credentials).toEqual({ accessKeyId: "do-test-key", secretAccessKey: "do-test-secret" })
  })

  it("constructs endpoint as https://${region}.digitaloceanspaces.com", () => {
    const config = makeSpacesPublisher({ region: "ams3" }).getS3UploadConfig()
    expect(config.endpoint).toBe("https://ams3.digitaloceanspaces.com")
  })

  it("forwards region to config", () => {
    const config = makeSpacesPublisher({ region: "fra1" }).getS3UploadConfig()
    expect(config.region).toBe("fra1")
  })

  it("throws with DO_KEY_ID mention when DO_KEY_ID is missing", () => {
    delete process.env.DO_KEY_ID
    expect(() => makeSpacesPublisher().getS3UploadConfig()).toThrow(/DO_KEY_ID/)
  })

  it("throws with DO_SECRET_KEY mention when DO_SECRET_KEY is missing", () => {
    delete process.env.DO_SECRET_KEY
    expect(() => makeSpacesPublisher().getS3UploadConfig()).toThrow(/DO_SECRET_KEY/)
  })

  it("throws when DO_KEY_ID is an empty string", () => {
    process.env.DO_KEY_ID = ""
    expect(() => makeSpacesPublisher().getS3UploadConfig()).toThrow(/DO_KEY_ID/)
  })
})

// ─── Upload — key construction and request params ────────────────────────────

describe("BaseS3Publisher.upload — key construction and S3 request", () => {
  let tmpDir: string
  let testFile: string

  beforeEach(async () => {
    vi.mocked(https.request).mockClear()
    const { mkdtemp, writeFile } = await import("fs/promises")
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "s3-upload-test-"))
    testFile = path.join(tmpDir, "MyApp-1.0.0.exe")
    await writeFile(testFile, "fake exe content")
    delete process.env.__TEST_S3_PUBLISHER__
  })

  afterEach(async () => {
    delete process.env.__TEST_S3_PUBLISHER__
    const { rm } = await import("fs/promises")
    await rm(tmpDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it("uses just the filename as key when path is null", async () => {
    const { capturedOpts } = mockSuccessfulUpload()
    const publisher = makeS3Publisher({ path: null })
    await publisher.upload(makeTask(testFile))
    // Virtual-hosted style: path is just /key
    expect(capturedOpts()?.path).toBe("/MyApp-1.0.0.exe")
  })

  it("prepends options.path to the key when path is set", async () => {
    const { capturedOpts } = mockSuccessfulUpload()
    const publisher = makeS3Publisher({ path: "releases/stable", forcePathStyle: true })
    await publisher.upload(makeTask(testFile))
    // Path-style with options.path: /{bucket}/{path}/{filename}
    expect(capturedOpts()?.path).toBe("/test-bucket/releases/stable/MyApp-1.0.0.exe")
  })

  it("uses virtual-hosted style URL by default", async () => {
    const { capturedOpts } = mockSuccessfulUpload()
    const publisher = makeS3Publisher({ region: "us-west-2" })
    await publisher.upload(makeTask(testFile))
    expect(capturedOpts()?.hostname).toBe("test-bucket.s3.us-west-2.amazonaws.com")
  })

  it("uses path-style URL when forcePathStyle is true", async () => {
    const { capturedOpts } = mockSuccessfulUpload()
    const publisher = makeS3Publisher({ region: "us-west-2", forcePathStyle: true })
    await publisher.upload(makeTask(testFile))
    expect(capturedOpts()?.hostname).toBe("s3.us-west-2.amazonaws.com")
    expect(capturedOpts()?.path).toMatch(/^\/test-bucket\//)
  })

  it("uses custom endpoint hostname when endpoint is set", async () => {
    const { capturedOpts } = mockSuccessfulUpload()
    const publisher = makeS3Publisher({ endpoint: "https://minio.example.com" })
    await publisher.upload(makeTask(testFile))
    expect(capturedOpts()?.hostname).toBe("minio.example.com")
  })

  it("sets x-amz-acl header when ACL is public-read", async () => {
    const { capturedOpts } = mockSuccessfulUpload()
    await makeS3Publisher({ acl: "public-read" }).upload(makeTask(testFile))
    expect(capturedOpts()?.headers?.["x-amz-acl"]).toBe("public-read")
  })

  it("omits x-amz-acl header when ACL is null", async () => {
    const { capturedOpts } = mockSuccessfulUpload()
    await makeS3Publisher({ acl: null }).upload(makeTask(testFile))
    expect(capturedOpts()?.headers?.["x-amz-acl"]).toBeUndefined()
  })

  it("sets x-amz-storage-class header when storageClass is set", async () => {
    const { capturedOpts } = mockSuccessfulUpload()
    await makeS3Publisher({ storageClass: "STANDARD_IA" }).upload(makeTask(testFile))
    expect(capturedOpts()?.headers?.["x-amz-storage-class"]).toBe("STANDARD_IA")
  })

  it("sets x-amz-server-side-encryption header when encryption is set", async () => {
    const { capturedOpts } = mockSuccessfulUpload()
    await makeS3Publisher({ encryption: "AES256" }).upload(makeTask(testFile))
    expect(capturedOpts()?.headers?.["x-amz-server-side-encryption"]).toBe("AES256")
  })

  it("sets Content-Length to the file size", async () => {
    const { capturedOpts } = mockSuccessfulUpload()
    const { statSync } = await import("fs")
    await makeS3Publisher().upload(makeTask(testFile))
    const size = statSync(testFile).size
    expect(capturedOpts()?.headers?.["Content-Length"]).toBe(String(size))
  })

  it("sets Content-Type based on file extension", async () => {
    const appImageFile = path.join(tmpDir, "app.AppImage")
    const { writeFile } = await import("fs/promises")
    await writeFile(appImageFile, "fake appimage")
    const { capturedOpts } = mockSuccessfulUpload()
    await makeS3Publisher().upload(makeTask(appImageFile))
    expect(capturedOpts()?.headers?.["Content-Type"]).toBe("application/vnd.appimage")
  })

  it("includes an Authorization header (SigV4 signed)", async () => {
    const { capturedOpts } = mockSuccessfulUpload()
    await makeS3Publisher().upload(makeTask(testFile))
    expect(capturedOpts()?.headers?.Authorization).toMatch(/^AWS4-HMAC-SHA256/)
  })

  it("cancellation destroys the request", async () => {
    let destroyCalled = false
    vi.mocked(https.request).mockImplementationOnce((_opts: unknown, _cb: unknown) => {
      const req = new EventEmitter() as ReturnType<typeof https.request>
      ;(req as any).end = vi.fn()
      ;(req as any).destroy = vi.fn(() => {
        destroyCalled = true
      })
      ;(req as any).write = vi.fn()
      // Never call the response callback — upload hangs until cancel
      return req
    })

    const context = makeContext()
    const publisher = new S3Publisher(context, { provider: "s3", bucket: "b", region: "us-east-1" })
    const uploadPromise = publisher.upload(makeTask(testFile))
    context.cancellationToken.cancel()
    await uploadPromise.catch(() => null)
    expect(destroyCalled).toBe(true)
  })
})

// ─── Upload — test mode bypass ────────────────────────────────────────────────

describe("BaseS3Publisher.upload — __TEST_S3_PUBLISHER__ bypass", () => {
  let testPublisherDir: string
  let srcDir: string
  let srcFile: string

  beforeEach(async () => {
    vi.mocked(https.request).mockClear()
    const { mkdtemp, writeFile } = await import("fs/promises")
    // Keep source file and destination dir separate so symlink(src, dest) doesn't collide
    testPublisherDir = await mkdtemp(path.join(os.tmpdir(), "s3-test-publisher-"))
    srcDir = await mkdtemp(path.join(os.tmpdir(), "s3-src-"))
    srcFile = path.join(srcDir, "source.exe")
    await writeFile(srcFile, "fake content")
    process.env.__TEST_S3_PUBLISHER__ = testPublisherDir
  })

  afterEach(async () => {
    delete process.env.__TEST_S3_PUBLISHER__
    const { rm } = await import("fs/promises")
    await rm(testPublisherDir, { recursive: true, force: true })
    await rm(srcDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it("creates a symlink instead of making an HTTPS request", async () => {
    const { readlink } = await import("fs/promises")
    await makeS3Publisher().upload(makeTask(srcFile))

    expect(vi.mocked(https.request)).not.toHaveBeenCalled()
    const link = await readlink(path.join(testPublisherDir, "source.exe"))
    expect(link).toBe(srcFile)
  })
})

// ─── Parity contract: Go binary publish-s3 flag → TS header/URL mapping ──────

describe("publish-s3 parity — Go binary flag mapping to HTTP request", () => {
  // The Go binary accepted:
  //   --acl         → x-amz-acl header
  //   --storageClass → x-amz-storage-class header
  //   --encryption  → x-amz-server-side-encryption header
  //   --bucket      → Bucket in URL (path or virtual-hosted)
  //   --key         → Object key in URL path
  //   --endpoint    → custom base URL
  //   --region      → signing region + hostname region segment
  //   --forcePathStyle → path-style vs virtual-hosted URL format
  // This suite verifies each mapping.

  let tmpDir: string
  let testFile: string

  beforeEach(async () => {
    vi.mocked(https.request).mockClear()
    const { mkdtemp, writeFile } = await import("fs/promises")
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "s3-parity-test-"))
    testFile = path.join(tmpDir, "TestApp-1.0.0-setup.exe")
    await writeFile(testFile, "x")
    delete process.env.__TEST_S3_PUBLISHER__
  })

  afterEach(async () => {
    const { rm } = await import("fs/promises")
    await rm(tmpDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it("--acl public-read → x-amz-acl: public-read", async () => {
    const { capturedOpts } = mockSuccessfulUpload()
    await makeS3Publisher({ acl: "public-read" }).upload(makeTask(testFile))
    expect(capturedOpts()?.headers?.["x-amz-acl"]).toBe("public-read")
  })

  it("--acl private → x-amz-acl: private", async () => {
    const { capturedOpts } = mockSuccessfulUpload()
    await makeS3Publisher({ acl: "private" }).upload(makeTask(testFile))
    expect(capturedOpts()?.headers?.["x-amz-acl"]).toBe("private")
  })

  it("--storageClass REDUCED_REDUNDANCY → x-amz-storage-class: REDUCED_REDUNDANCY", async () => {
    const { capturedOpts } = mockSuccessfulUpload()
    await makeS3Publisher({ storageClass: "REDUCED_REDUNDANCY" }).upload(makeTask(testFile))
    expect(capturedOpts()?.headers?.["x-amz-storage-class"]).toBe("REDUCED_REDUNDANCY")
  })

  it("--encryption aws:kms → x-amz-server-side-encryption: aws:kms", async () => {
    const { capturedOpts } = mockSuccessfulUpload()
    await makeS3Publisher({ encryption: "aws:kms" }).upload(makeTask(testFile))
    expect(capturedOpts()?.headers?.["x-amz-server-side-encryption"]).toBe("aws:kms")
  })

  it("--region eu-west-1 → hostname contains eu-west-1", async () => {
    const { capturedOpts } = mockSuccessfulUpload()
    await makeS3Publisher({ region: "eu-west-1" }).upload(makeTask(testFile))
    expect(capturedOpts()?.hostname).toContain("eu-west-1")
  })

  it("--forcePathStyle true → bucket in URL path, not hostname", async () => {
    const { capturedOpts } = mockSuccessfulUpload()
    await makeS3Publisher({ region: "us-west-2", forcePathStyle: true }).upload(makeTask(testFile))
    expect(capturedOpts()?.hostname).not.toContain("test-bucket")
    expect(capturedOpts()?.path).toMatch(/^\/test-bucket\//)
  })

  it("--endpoint https://s3.custom.io → uses custom hostname", async () => {
    const { capturedOpts } = mockSuccessfulUpload()
    await makeS3Publisher({ endpoint: "https://s3.custom.io" }).upload(makeTask(testFile))
    expect(capturedOpts()?.hostname).toBe("s3.custom.io")
  })
})
