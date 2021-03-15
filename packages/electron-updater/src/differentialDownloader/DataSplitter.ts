import { newError } from "builder-util-runtime"
import { createReadStream } from "fs"
import { Writable } from "stream"
import { Operation, OperationKind } from "./downloadPlanBuilder"

const DOUBLE_CRLF = Buffer.from("\r\n\r\n")

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
  readStream.on("error", reject)
  readStream.once("end", resolve)
  readStream.pipe(out, {
    end: false,
  })
}

export class DataSplitter extends Writable {
  partIndex = -1

  private headerListBuffer: Buffer | null = null
  private readState = ReadState.INIT
  private ignoreByteCount = 0
  private remainingPartDataCount = 0

  private readonly boundaryLength: number

  constructor(
    private readonly out: Writable,
    private readonly options: PartListDataTask,
    private readonly partIndexToTaskIndex: Map<number, number>,
    boundary: string,
    private readonly partIndexToLength: Array<number>,
    private readonly finishHandler: () => any
  ) {
    super()

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
      console.error(`Trailing ignored data: ${data.length} bytes`)
      return
    }

    this.handleData(data).then(callback).catch(callback)
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
      // header list is ignored, we don't need it
      this.headerListBuffer = null
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
    const headerListEnd = chunk.indexOf(DOUBLE_CRLF, readOffset)
    if (headerListEnd !== -1) {
      return headerListEnd + DOUBLE_CRLF.length
    }

    // not all headers data were received, save to buffer
    const partialChunk = readOffset === 0 ? chunk : chunk.slice(readOffset)
    if (this.headerListBuffer == null) {
      this.headerListBuffer = partialChunk
    } else {
      this.headerListBuffer = Buffer.concat([this.headerListBuffer, partialChunk])
    }
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
