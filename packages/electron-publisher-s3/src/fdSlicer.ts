import BluebirdPromise from "bluebird-lst"
import { EventEmitter } from "events"
import * as fs from "fs"
import { close } from "fs-extra-p"
import { Readable } from "stream"

export class FdSlicer extends EventEmitter {
  constructor(public fd: any) {
    super()
  }

  read(buffer: any, offset: any, length: number, position: number, callback: any) {
    fs.read(this.fd, buffer, offset, length, position, callback)
  }

  close() {
    const fd = this.fd
    return fd == null ? BluebirdPromise.resolve() : close(fd)
  }
}

export class SlicedReadStream extends Readable {
  destroyed = false

  constructor(private readonly context: FdSlicer, private pos: number, private readonly end: number = -1) {
    super()

    this.destroyed = false
  }

  _read(n: number) {
    if (this.destroyed) {
      return
    }

    const toRead = Math.min((<any>this)._readableState.highWaterMark, n, this.end === -1 ? 0 : this.end - this.pos)
    if (toRead <= 0) {
      this.destroyed = true
      this.push(null)
      return
    }

    if (this.destroyed) {
      return
    }

    const buffer = new Buffer(toRead)
    fs.read(this.context.fd, buffer, 0, toRead, this.pos, (error: Error, bytesRead: number) => {
      if (error != null) {
        this.destroy(error)
      }
      else if (bytesRead === 0) {
        this.destroyed = true
        this.push(null)
      }
      else {
        this.pos += bytesRead
        this.push(buffer.slice(0, bytesRead))
      }
    })
  }

  private destroy(error: Error) {
    if (this.destroyed) {
      return
    }

    this.destroyed = true
    this.emit("error", error)
  }
}