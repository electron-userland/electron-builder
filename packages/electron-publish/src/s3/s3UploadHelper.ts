import _aws4 from "aws4"
const { sign } = _aws4
import * as fs from "fs"
import * as http from "http"
import * as https from "https"
import mime from "mime"
import * as path from "path"
import type { AwsCredentials } from "./awsCredentials.js"

export interface S3PutObjectParams {
  bucket: string
  key: string
  file: string
  region: string
  endpoint?: string
  forcePathStyle?: boolean
  contentType: string
  acl?: string
  storageClass?: string
  serverSideEncryption?: string
  credentials?: AwsCredentials
}

interface S3RequestTarget {
  bucket: string
  key: string
  region: string
  endpoint?: string
  forcePathStyle?: boolean
}

function resolveS3Request(params: S3RequestTarget): { hostname: string; urlPath: string; isHttp: boolean } {
  const region = params.region

  let hostname: string
  let rawPath: string
  let isHttp = false

  if (params.endpoint != null) {
    const u = new URL(params.endpoint)
    isHttp = u.protocol === "http:"
    hostname = u.port ? `${u.hostname}:${u.port}` : u.hostname
    // path-style for custom endpoints (handles buckets whose names contain dots)
    rawPath = `/${params.bucket}/${params.key}`
  } else if (params.forcePathStyle) {
    hostname = `s3.${region}.amazonaws.com`
    rawPath = `/${params.bucket}/${params.key}`
  } else {
    hostname = `${params.bucket}.s3.${region}.amazonaws.com`
    rawPath = `/${params.key}`
  }

  // URL-encode each path segment individually so forward-slashes in keys are preserved
  const urlPath = "/" + rawPath.slice(1).split("/").map(encodeURIComponent).join("/")
  return { hostname, urlPath, isHttp }
}

/**
 * Uploads a file to S3 (or S3-compatible storage) using a single PutObject request.
 * Suitable for files up to 5 GB — the S3 single-part upload limit.
 * Returns the underlying ClientRequest so callers can abort mid-flight.
 * Mirrors the behaviour of the `publish-s3` app-builder subcommand.
 */
export function startS3PutObject(params: S3PutObjectParams): { req: http.ClientRequest; done: Promise<void> } {
  const stat = fs.statSync(params.file)
  const region = params.region
  const { hostname, urlPath, isHttp } = resolveS3Request(params)

  const headers: Record<string, string> = {
    "Content-Type": params.contentType,
    "Content-Length": String(stat.size),
    // Declare the payload as unsigned so aws4 signs over this literal string
    // rather than defaulting to SHA256("") — which would not match the streamed body.
    "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
  }
  if (params.acl != null) {
    headers["x-amz-acl"] = params.acl
  }
  if (params.storageClass != null) {
    headers["x-amz-storage-class"] = params.storageClass
  }
  if (params.serverSideEncryption != null) {
    headers["x-amz-server-side-encryption"] = params.serverSideEncryption
  }

  const signed = sign(
    {
      service: "s3",
      region,
      method: "PUT",
      host: hostname,
      path: urlPath,
      headers,
    },
    params.credentials
  )

  const transport = isHttp ? http : https

  let resolvePromise!: () => void
  let rejectPromise!: (err: Error) => void
  const done = new Promise<void>((res, rej) => {
    resolvePromise = res
    rejectPromise = rej
  })

  const req = transport.request(
    {
      hostname: hostname.split(":")[0],
      port: hostname.includes(":") ? Number(hostname.split(":")[1]) : undefined,
      path: urlPath,
      method: "PUT",
      headers: signed.headers,
    },
    res => {
      if (res.statusCode === 200) {
        res.resume()
        res.on("end", resolvePromise)
      } else {
        let body = ""
        let bodySize = 0
        const MAX_ERROR_BODY = 65536
        res.on("data", (chunk: string) => {
          bodySize += chunk.length
          if (bodySize <= MAX_ERROR_BODY) {
            body += chunk
          }
        })
        res.on("end", () => rejectPromise(new Error(`S3 PutObject failed (HTTP ${res.statusCode}): ${body.slice(0, 512)}`)))
      }
    }
  )

  req.on("error", rejectPromise)
  const fileStream = fs.createReadStream(params.file)
  fileStream.on("error", rejectPromise)
  req.on("close", () => fileStream.destroy())
  fileStream.pipe(req)

  return { req, done }
}

export interface S3DeleteObjectParams extends S3RequestTarget {
  credentials?: AwsCredentials
}

/**
 * Deletes an object from S3 (or S3-compatible storage) using a single DeleteObject request.
 * Primarily used by credential-gated live tests to clean up uploaded artifacts.
 */
export function deleteS3Object(params: S3DeleteObjectParams): Promise<void> {
  const { hostname, urlPath, isHttp } = resolveS3Request(params)

  const signed = sign(
    {
      service: "s3",
      region: params.region,
      method: "DELETE",
      host: hostname,
      path: urlPath,
      headers: {
        "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
      },
    },
    params.credentials
  )

  const transport = isHttp ? http : https

  return new Promise<void>((resolve, reject) => {
    const req = transport.request(
      {
        hostname: hostname.split(":")[0],
        port: hostname.includes(":") ? Number(hostname.split(":")[1]) : undefined,
        path: urlPath,
        method: "DELETE",
        headers: signed.headers,
      },
      res => {
        // S3 DeleteObject returns 204 No Content (also for keys that do not exist)
        if (res.statusCode === 204 || res.statusCode === 200) {
          res.resume()
          res.on("end", () => resolve())
        } else {
          let body = ""
          res.on("data", (chunk: string) => {
            if (body.length < 4096) {
              body += chunk
            }
          })
          res.on("end", () => reject(new Error(`S3 DeleteObject failed (HTTP ${res.statusCode}): ${body.slice(0, 512)}`)))
        }
      }
    )
    req.on("error", reject)
    req.end()
  })
}

/**
 * Returns the MIME content-type for an S3 upload key, using explicit overrides
 * for formats that mime databases commonly misidentify. Mirrors the Go binary's
 * getContentType() function in pkg/publisher/s3.go.
 */
export function getS3ContentType(file: string): string {
  const ext = path.extname(file).toLowerCase()
  const overrides: Record<string, string> = {
    ".appimage": "application/vnd.appimage",
    ".blockmap": "application/gzip",
    ".snap": "application/vnd.snap",
  }
  return overrides[ext] ?? mime.getType(file) ?? "application/octet-stream"
}
