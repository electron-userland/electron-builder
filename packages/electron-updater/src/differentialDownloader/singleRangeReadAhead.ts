import { newError } from "builder-util-runtime"
import { IncomingMessage } from "http"
import { Writable } from "stream"
import { DifferentialDownloader } from "./DifferentialDownloader.js"
import { Operation, OperationKind } from "./downloadPlanBuilder.js"
import { checkIsPartialContent, RangeRequestTarget, requestRange } from "./multipleRangeDownloader.js"

/**
 * Single-range requests in flight at the same time on a host without multipart support. Small, so the updater stays polite
 * to the host and within the per-host connection limit of Chromium's network stack (6, shared with the app).
 */
export const SINGLE_RANGE_CONCURRENCY = 4

/**
 * DOWNLOAD ranges up to this size are fetched ahead into memory; a longer one is streamed when the writer reaches it. Its
 * transfer time (≥ 160 ms at 100 Mbit/s) dwarfs a round trip, so fetching it ahead would save little and hold a lot.
 */
export const READ_AHEAD_MAX_RANGE_BYTES = 2 * 1024 * 1024

/** Bytes held in memory by ranges fetched ahead and not written yet (in flight included). */
export const READ_AHEAD_MAX_BYTES = 8 * 1024 * 1024

interface ReadAheadRange {
  readonly length: number
  data: Buffer | null
  onData: ((data: Buffer) => void) | null
}

/**
 * On a single-range host the new file is written in plan order, one DOWNLOAD range per request. Waiting for each answer before
 * requesting the next costs a round trip per range, so the next small ranges of the plan are requested ahead, up to
 * SINGLE_RANGE_CONCURRENCY at a time and READ_AHEAD_MAX_BYTES held, and handed to the writer in order.
 *
 * Until the first answer arrives only one request is in flight: a redirect (e.g. GitHub → its CDN) is then known, and the
 * ranges ahead go straight to its target instead of each being redirected by the origin.
 *
 * Each answer must be a 206 for exactly its range (`checkIsPartialContent`) with as many bytes; any failure is passed to
 * `reject` at once. The requests are created with `DifferentialDownloader.createRangeRequest`, so a failure or a cancel of the
 * download aborts them, and none is sent once `out` is destroyed.
 */
export class SingleRangeReadAhead {
  private readonly ranges = new Map<number, ReadAheadRange>()
  /** index of the next operation to consider */
  private next = 0
  private inFlight = 0
  private heldBytes = 0
  /** the writer streams a range itself, which takes one of the SINGLE_RANGE_CONCURRENCY slots */
  private isStreaming = false
  private isTargetKnown = false

  constructor(
    private readonly downloader: DifferentialDownloader,
    private readonly target: RangeRequestTarget,
    private readonly tasks: Array<Operation>,
    private readonly out: Writable,
    private readonly reject: (error: Error) => void
  ) {}

  /**
   * The writer is at operation `index`: requests the ranges ahead from there (that one included). Returns whether the writer
   * gets the range of operation `index` from `take`; if not (a COPY, or a DOWNLOAD longer than READ_AHEAD_MAX_RANGE_BYTES), the
   * writer streams a DOWNLOAD itself between `beginStreaming` and `endStreaming`.
   */
  advance(index: number): boolean {
    this.next = Math.max(this.next, index)
    this.fill()
    return this.ranges.has(index)
  }

  /** The writer streams the range of operation `index` (a DOWNLOAD that `advance` did not take). */
  beginStreaming(index: number): void {
    this.next = Math.max(this.next, index + 1)
    this.isStreaming = true
    this.fill()
  }

  endStreaming(): void {
    this.isStreaming = false
    this.fill()
  }

  /** A range request (the writer's or one ahead) was answered: a redirect is followed by now, so more can be sent at once. */
  onRangeAnswered(): void {
    if (!this.isTargetKnown) {
      this.isTargetKnown = true
      this.fill()
    }
  }

  /** Calls `onData` with the bytes of operation `index` once they arrived (`advance(index)` returned true). */
  take(index: number, onData: (data: Buffer) => void): void {
    const range = this.ranges.get(index)!
    const deliver = (data: Buffer): void => {
      this.ranges.delete(index)
      this.heldBytes -= range.length
      this.fill()
      onData(data)
    }
    if (range.data == null) {
      range.onData = deliver
    } else {
      deliver(range.data)
    }
  }

  private fill(): void {
    while (this.next < this.tasks.length) {
      const limit = this.isTargetKnown ? SINGLE_RANGE_CONCURRENCY : 1
      if (this.inFlight + (this.isStreaming ? 1 : 0) >= limit) {
        return
      }
      const index = this.next
      const task = this.tasks[index]
      if (task.kind === OperationKind.COPY) {
        this.next++
        continue
      }
      const length = task.end - task.start
      // stops at a long range until the writer streams it, and keeps the plan order: no range is requested before an earlier one
      if (length > READ_AHEAD_MAX_RANGE_BYTES || this.heldBytes + length > READ_AHEAD_MAX_BYTES) {
        return
      }
      this.next++
      this.request(index, task)
    }
  }

  private request(index: number, task: Operation): void {
    const range: ReadAheadRange = { length: task.end - task.start, data: null, onData: null }
    this.ranges.set(index, range)
    this.inFlight++
    this.heldBytes += range.length
    const endInclusive = task.end - 1
    this.downloader.logger.debug?.(`download range ahead: bytes=${task.start}-${endInclusive}`)
    requestRange(
      this.downloader,
      this.target,
      `bytes=${task.start}-${endInclusive}`,
      (response: IncomingMessage) => {
        response.on("error", this.reject)
        // before the abort listener: rejecting a response destroys it, which would otherwise report a server abort
        if (!checkIsPartialContent(response, task.start, endInclusive, this.reject)) {
          return
        }
        response.on("aborted", () => this.reject(new Error("response has been aborted by the server")))
        this.onRangeAnswered()
        const chunks: Array<Buffer> = []
        let received = 0
        response.on("data", (chunk: Buffer) => {
          received += chunk.length
          if (received > range.length) {
            response.destroy()
            this.reject(
              newError(`Received data length exceeds the requested ${range.length} bytes of range bytes=${task.start}-${endInclusive}`, "ERR_UPDATER_RANGE_NOT_SUPPORTED")
            )
            return
          }
          chunks.push(chunk)
        })
        response.on("end", () => {
          if (received !== range.length) {
            this.reject(new Error(`Received data length ${received} is not equal to expected ${range.length}`))
            return
          }
          this.inFlight--
          range.data = Buffer.concat(chunks, received)
          range.onData?.(range.data)
          this.fill()
        })
      },
      this.reject,
      this.out
    )
  }
}
