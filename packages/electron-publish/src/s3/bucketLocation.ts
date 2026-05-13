import { sign } from "aws4"
import { request } from "https"

/**
 * Resolves the AWS region for a bucket via the S3 GetBucketLocation API (SigV4-signed).
 * AWS returns an empty LocationConstraint element for us-east-1 (the implicit default region).
 * Mirrors the behaviour of the `get-bucket-location` app-builder subcommand.
 */
export function getBucketLocation(bucket: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const opts = sign(
      {
        service: "s3",
        region: "us-east-1",
        method: "GET",
        host: `${bucket}.s3.amazonaws.com`,
        path: "/?location",
      },
      {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      }
    )

    const req = request(
      {
        hostname: opts.host,
        path: opts.path,
        method: opts.method,
        headers: opts.headers,
      },
      res => {
        let body = ""
        res.on("data", (chunk: string) => (body += chunk))
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`GetBucketLocation failed (HTTP ${res.statusCode}): ${body}`))
            return
          }
          // Response: <LocationConstraint>us-west-2</LocationConstraint> or empty element for us-east-1
          const match = body.match(/<LocationConstraint[^>]*>([^<]*)<\/LocationConstraint>/)
          resolve(match?.[1] || "us-east-1")
        })
      }
    )

    req.on("error", reject)
    req.end()
  })
}
