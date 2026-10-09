import { newError } from "builder-util-runtime"
import { Logger } from "../types.js"
import { createReadStream } from "fs"
import { Writable } from "stream"
import { Operation, OperationKind } from "./downloadPlanBuilder.js"
import { ProgressInfo } from "./ProgressDifferentialDownloadCallbackTransform.js"

const CRLF_HEADER_LIST_END = Buffer.from("\r\n\r\n")
// RFC 2046 requires CRLF, but some CDNs (e.g. Qiniu's "web cache") emit bare LF in multipart/byteranges responses.
const LF_HEADER_LIST_END = Buffer.from("\n\n")
// A terminator may be split across two chunks: keep this many trailing bytes of an unfinished header list.
const HEADER_LIST_END_CARRY = CRLF_HEADER_LIST_END.length - 1
// Parts are separated by "<EOL>--boundary"; these are the sizes of the "<EOL>--" prefix.
const CRLF_DELIMITER_PREFIX_LENGTH = "\r\n--".length
const LF_DELIMITER_PREFIX_LENGTH = "\n--".length

interface HeaderListEnd {
  // offset just past the terminator
  readonly end: number
  readonly lineFeedOnly: boolean
}

function findHeaderListEnd(data: Buffer): HeaderListEnd | null {
  const crlf = data.indexOf(CRLF_HEADER_LIST_END)
  // "\r\n\r\n" never contains "\n\n", so whichever terminator comes first tells the line ending in use
  const lf = data.indexOf(LF_HEADER_LIST_END)
  if (lf !== -1 && (crlf === -1 || lf < crlf)) {
    return { end: lf + LF_HEADER_LIST_END.length, lineFeedOnly: true }
  }
  if (crlf !== -1) {
    return { end: crlf + CRLF_HEADER_LIST_END.length, lineFeedOnly: false }
  }
  return null
}

enum ReadState {
  INIT,
  HEADER,
  BODY,
}

export interface PartListDataTask {
  readonly oldFileFd: number
  readonly tasks: Array<Operation>
  readonly start: number
  readonly end: number
}

export function copyData(task: Operation, out: Writable, oldFileFd: number, reject: (error: Error) => void, resolve: () => void): void {
  const readStream = createReadStream("", {
    fd: oldFileFd,
    autoClose: false,
    start: task.start,
    // end is inclusive
    end: task.end - 1,
  })
  const onOutError = (err: Error): void => reject(err)
  readStream.on("error", reject)
  readStream.once("end", () => {
    out.removeListener("error", onOutError)
    resolve()
  })
  out.once("error", onOutError)
  readStream.pipe(out, { end: false })
}

export class DataSplitter extends Writable {
  // properties for progress update calculations
  private start = Date.now() // download start time used to calculate average rate
  private nextUpdate = this.start + 1000 // timestamp of next update to prevent updates more often than once per second
  private transferred = 0 // total number of bytes transferred
  private delta = 0 // number of bytes transferred since last update, reset after each update

  partIndex = -1

  // Trailing bytes (at most HEADER_LIST_END_CARRY) of a header list that is not complete yet. Header lists are ignored,
  // so nothing more needs to be kept — only enough to find a terminator that straddles two chunks.
  private headerListTail: Buffer | null = null
  private readState = ReadState.INIT
  private ignoreByteCount = 0
  private remainingPartDataCount = 0

  private readonly boundaryTextLength: number
  // size of "<EOL>--boundary" between parts; corrected once the line ending used by the server is known
  private boundaryLength: number

  constructor(
    private readonly out: Writable,
    private readonly options: PartListDataTask,
    private readonly partIndexToTaskIndex: Map<number, number>,
    boundary: string,
    private readonly partIndexToLength: Array<number>,
    private readonly finishHandler: () => any,
    private readonly grandTotalBytes: number,
    private readonly onProgress?: (info: ProgressInfo) => any,
    private readonly logger?: Logger
  ) {
    super()

    this.boundaryTextLength = boundary.length
    this.boundaryLength = boundary.length + 4 /* size of \r\n-- */
    // first chunk doesn't start with \r\n
    this.ignoreByteCount = this.boundaryLength - 2
  }

  get isFinished(): boolean {
    return this.partIndex === this.partIndexToLength.length
  }

  // noinspection JSUnusedGlobalSymbols
  _write(data: Buffer, encoding: string, callback: (error?: Error) => void): void {
    if (this.isFinished) {
      this.logger?.error?.(`Trailing ignored data: ${data.length} bytes`)
      return
    }

    this.handleData(data)
      .then(() => {
        if (this.onProgress) {
          const now = Date.now()
          if ((now >= this.nextUpdate || this.transferred === this.grandTotalBytes) && this.grandTotalBytes && (now - this.start) / 1000) {
            this.nextUpdate = now + 1000

            this.onProgress({
              total: this.grandTotalBytes,
              delta: this.delta,
              transferred: this.transferred,
              percent: (this.transferred / this.grandTotalBytes) * 100,
              bytesPerSecond: Math.round(this.transferred / ((now - this.start) / 1000)),
            })
            this.delta = 0
          }
        }

        callback()
      })
      .catch(callback)
  }

  private async handleData(chunk: Buffer): Promise<undefined> {
    let start = 0

    if (this.ignoreByteCount !== 0 && this.remainingPartDataCount !== 0) {
      throw newError("Internal error", "ERR_DATA_SPLITTER_BYTE_COUNT_MISMATCH")
    }

    if (this.ignoreByteCount > 0) {
      const toIgnore = Math.min(this.ignoreByteCount, chunk.length)
      this.ignoreByteCount -= toIgnore
      start = toIgnore
    } else if (this.remainingPartDataCount > 0) {
      const toRead = Math.min(this.remainingPartDataCount, chunk.length)
      this.remainingPartDataCount -= toRead
      await this.processPartData(chunk, 0, toRead)
      start = toRead
    }

    if (start === chunk.length) {
      return
    }

    if (this.readState === ReadState.HEADER) {
      const headerListEnd = this.searchHeaderListEnd(chunk, start)
      if (headerListEnd === -1) {
        return
      }

      start = headerListEnd
      this.readState = ReadState.BODY
    }

    while (true) {
      if (this.readState === ReadState.BODY) {
        this.readState = ReadState.INIT
      } else {
        this.partIndex++

        let taskIndex = this.partIndexToTaskIndex.get(this.partIndex)
        if (taskIndex == null) {
          if (this.isFinished) {
            taskIndex = this.options.end
          } else {
            throw newError("taskIndex is null", "ERR_DATA_SPLITTER_TASK_INDEX_IS_NULL")
          }
        }

        const prevTaskIndex = this.partIndex === 0 ? this.options.start : this.partIndexToTaskIndex.get(this.partIndex - 1)! + 1 /* prev part is download, next maybe copy */
        if (prevTaskIndex < taskIndex) {
          await this.copyExistingData(prevTaskIndex, taskIndex)
        } else if (prevTaskIndex > taskIndex) {
          throw newError("prevTaskIndex must be < taskIndex", "ERR_DATA_SPLITTER_TASK_INDEX_ASSERT_FAILED")
        }

        if (this.isFinished) {
          this.onPartEnd()
          this.finishHandler()
          return
        }

        start = this.searchHeaderListEnd(chunk, start)

        if (start === -1) {
          this.readState = ReadState.HEADER
          return
        }
      }

      const partLength = this.partIndexToLength[this.partIndex]
      const end = start + partLength
      const effectiveEnd = Math.min(end, chunk.length)
      await this.processPartStarted(chunk, start, effectiveEnd)
      this.remainingPartDataCount = partLength - (effectiveEnd - start)
      if (this.remainingPartDataCount > 0) {
        return
      }

      start = end + this.boundaryLength
      if (start >= chunk.length) {
        this.ignoreByteCount = this.boundaryLength - (chunk.length - end)
        return
      }
    }
  }

  private copyExistingData(index: number, end: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const w = (): void => {
        if (index === end) {
          resolve()
          return
        }

        const task = this.options.tasks[index]
        if (task.kind !== OperationKind.COPY) {
          reject(new Error("Task kind must be COPY"))
          return
        }

        copyData(task, this.out, this.options.oldFileFd, reject, () => {
          index++
          w()
        })
      }
      w()
    })
  }

  private searchHeaderListEnd(chunk: Buffer, readOffset: number): number {
    const tail = this.headerListTail
    const carried = tail == null ? 0 : tail.length
    const data = tail == null ? chunk.subarray(readOffset) : Buffer.concat([tail, chunk.subarray(readOffset)])
    const found = findHeaderListEnd(data)
    if (found != null) {
      this.headerListTail = null
      // the separator size follows the line ending the server actually uses
      this.boundaryLength = this.boundaryTextLength + (found.lineFeedOnly ? LF_DELIMITER_PREFIX_LENGTH : CRLF_DELIMITER_PREFIX_LENGTH)
      // the carried bytes were already searched, so the terminator always ends inside the current chunk
      return readOffset + found.end - carried
    }

    // not all headers data were received; copy the tail so the chunk itself is not retained
    this.headerListTail = Buffer.from(data.subarray(Math.max(0, data.length - HEADER_LIST_END_CARRY)))
    return -1
  }

  private actualPartLength = 0

  private onPartEnd(): void {
    const expectedLength = this.partIndexToLength[this.partIndex - 1]
    if (this.actualPartLength !== expectedLength) {
      throw newError(`Expected length: ${expectedLength} differs from actual: ${this.actualPartLength}`, "ERR_DATA_SPLITTER_LENGTH_MISMATCH")
    }
    this.actualPartLength = 0
  }

  private processPartStarted(data: Buffer, start: number, end: number): Promise<void> {
    if (this.partIndex !== 0) {
      this.onPartEnd()
    }
    return this.processPartData(data, start, end)
  }

  private processPartData(data: Buffer, start: number, end: number): Promise<void> {
    this.actualPartLength += end - start
    this.transferred += end - start
    this.delta += end - start
    const out = this.out
    if (out.write(start === 0 && data.length === end ? data : data.slice(start, end))) {
      return Promise.resolve()
    } else {
      return new Promise((resolve, reject) => {
        out.on("error", reject)
        out.once("drain", () => {
          out.removeListener("error", reject)
          resolve()
        })
      })
    }
  }
}
