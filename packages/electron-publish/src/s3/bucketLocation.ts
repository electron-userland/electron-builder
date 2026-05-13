import { GetBucketLocationCommand, S3Client } from "@aws-sdk/client-s3"

/**
 * Resolves the AWS region for a bucket by calling the S3 GetBucketLocation API.
 * AWS returns null for buckets in us-east-1 (the implicit default region).
 */
export async function getBucketLocation(bucket: string): Promise<string> {
  const client = new S3Client({})
  const response = await client.send(new GetBucketLocationCommand({ Bucket: bucket }))
  return response.LocationConstraint ?? "us-east-1"
}
