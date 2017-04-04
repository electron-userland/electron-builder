const Transform = require('stream').Transform
const util = require('util')
const crypto = require('crypto')

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
const commonUploadSize1 = 10 * 1024 * 1024
const commonUploadSize2 = 15 * 1024 * 1024
const minimumUploadSize = 5 * 1024 * 1024

module.exports = MultipartETag;

util.inherits(MultipartETag, Transform);
function MultipartETag(options) {
  options = options || {};
  Transform.call(this, options);
  let sizes = [
    maximumUploadSize,
    minimumUploadSize,
    commonUploadSize1,
    commonUploadSize2,
  ]
  if (options.size != null && options.count != null) {
    if (options.count === 1) {
      sizes = [maximumUploadSize];
    } else {
      sizes.push(guessPartSizeFromSizeAndCount(options.size, options.count));
    }
  }
  this.sums = [];
  this.bytes = 0;
  this.digest = null; // if it is less than maximumUploadSize
  this.done = false;
  for (let i = 0; i < sizes.length; i += 1) {
    this.sums.push({
      size: sizes[i],
      hash: crypto.createHash('md5'),
      amtWritten: 0,
      digests: [],
      eTag: null,
    });
  }
}

MultipartETag.prototype._transform = function(chunk, encoding, callback) {
  this.bytes += chunk.length;
  for (let i = 0; i < this.sums.length; i += 1) {
    const sumObj = this.sums[i]
    const newAmtWritten = sumObj.amtWritten + chunk.length
    if (newAmtWritten <= sumObj.size) {
      sumObj.amtWritten = newAmtWritten;
      sumObj.hash.update(chunk, encoding);
    } else {
      const finalBytes = sumObj.size - sumObj.amtWritten
      sumObj.hash.update(chunk.slice(0, finalBytes), encoding);
      sumObj.digests.push(sumObj.hash.digest());
      sumObj.hash = crypto.createHash('md5');
      sumObj.hash.update(chunk.slice(finalBytes), encoding);
      sumObj.amtWritten = chunk.length - finalBytes;
    }
  }
  this.emit('progress');
  callback(null, chunk);
};

MultipartETag.prototype._flush = function(callback) {
  for (let i = 0; i < this.sums.length; i += 1) {
    const sumObj = this.sums[i]
    let digest = sumObj.hash.digest()
    sumObj.digests.push(digest);
    const finalHash = crypto.createHash('md5')
    for (let partIndex = 0; partIndex < sumObj.digests.length; partIndex += 1) {
      digest = sumObj.digests[partIndex];
      finalHash.update(digest);
    }
    sumObj.eTag = finalHash.digest('hex') + '-' + sumObj.digests.length;
    if (i === 0 && sumObj.digests.length === 1) {
      this.digest = digest;
    }
  }
  this.done = true;
  this.push(null);
  callback();
};

MultipartETag.prototype.anyMatch = function(eTag) {
  if (this.digest && this.digest.toString('hex') === eTag) {
    return true;
  }
  for (let i = 0; i < this.sums.length; i += 1) {
    if (this.sums[i].eTag === eTag) {
      return true;
    }
  }
  return false;
};

function guessPartSizeFromSizeAndCount(size, count) {
  const divided = size / count
  const floored = Math.floor(divided)
  return (divided === floored) ? divided : (floored + 1);
}