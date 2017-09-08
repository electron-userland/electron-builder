import { Int64LE } from "int64-buffer"

export class LittleEndianBuffer {
  constructor(private readonly buffer: Buffer, private index = 0) {
  }

  /**
   * Creates a new byte buffer whose content is a shared subsequence of this buffer's content.
   */
  slice() {
    return this.buffer.slice(this.index)
  }

  readByte() {
    return this.buffer.readInt8(this.index++)
  }

  readUnsignedByte() {
    return this.buffer.readUInt8(this.index++)
  }

  readLong() {
    const value = new Int64LE(this.buffer, this.index).toNumber()
    this.index += 8
    return value
  }

  readInt(): number {
    const value = this.buffer.readInt32LE(this.index)
    this.index += 4
    return value
  }

  readUnsignedInt(): number {
    const value = this.buffer.readUInt32LE(this.index)
    this.index += 4
    return value
  }

  get(dst: Buffer) {
    this.buffer.copy(dst, 0, this.index)
    this.index += dst.length
  }

  skip(count: number) {
    this.index += count
  }

  remaining() {
    return this.buffer.length - this.index
  }
}