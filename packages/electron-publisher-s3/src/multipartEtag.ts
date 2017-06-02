import { createHash } from "crypto"
import { Transform } from "stream"

/* For objects uploaded via a single request to S3, the ETag is simply the hex
 * string of the MD5 digest. However for multipart uploads, the ETag is more
 * complicated. It is the MD5 digest of each part concatenated, and then the
 * MD5 digest of *that*, followed by '-', followed by the part count.
 *
 * Sadly, this means there is no way to be sure whether a local file matches a
 * remote object. The best we can do is hope that the software used to upload
 * to S3 used a fixed part size, and that it was one of a few common sizes.
 */

const maximumUploadSize = 5 * 1024 * 1024 * 1024

export class MultipartETag extends Transform {
  private sum: any = {
    size: maximumUploadSize,
    hash: createHash("md5"),
    amtWritten: 0,
    digests: [],
    eTag: null,
  }

  bytes = 0
  private digest: Buffer | null = null

  constructor() {
    super()
  }

  _transform(chunk: any, encoding: string, callback: Function) {
    this.bytes += chunk.length
    const sumObj = this.sum
    const newAmtWritten = sumObj.amtWritten + chunk.length
    if (newAmtWritten <= sumObj.size) {
      sumObj.amtWritten = newAmtWritten
      sumObj.hash.update(chunk, encoding)
    }
    else {
      const finalBytes = sumObj.size - sumObj.amtWritten
      sumObj.hash.update(chunk.slice(0, finalBytes), encoding)
      sumObj.digests.push(sumObj.hash.digest())
      sumObj.hash = createHash("md5")
      sumObj.hash.update(chunk.slice(finalBytes), encoding)
      sumObj.amtWritten = chunk.length - finalBytes
    }
    this.emit("progress")
    callback(null, chunk)
  }

  _flush(callback: any) {
    const sumObj = this.sum
    const digest = sumObj.hash.digest()
    sumObj.digests.push(digest)
    const finalHash = createHash("md5")
    for (const digest of sumObj.digests) {
      finalHash.update(digest)
    }
    sumObj.eTag = `${finalHash.digest("hex")}-${sumObj.digests.length}`
    if (sumObj.digests.length === 1) {
      this.digest = digest
    }
    callback(null)
  }

  anyMatch(eTag: string) {
    if (this.digest != null && this.digest.toString("hex") === eTag) {
      return true
    }
    return this.sum.eTag === eTag
  }
}