import { Transform } from "stream"
import { CancellationToken } from "builder-util-runtime"

enum OperationKind {
  COPY,
  DOWNLOAD,
}

export interface ProgressInfo {
  total: number
  delta: number
  transferred: number
  percent: number
  bytesPerSecond: number
}

export interface ProgressDifferentialDownloadInfo {
  expectedByteCounts: Array<number>
  grandTotal: number
}

export class ProgressDifferentialDownloadCallbackTransform extends Transform {
  private start = Date.now()
  private transferred = 0
  private delta = 0
  private expectedBytes = 0
  private index = 0
  private operationType = OperationKind.COPY

  private nextUpdate = this.start + 1000

  constructor(
    private readonly progressDifferentialDownloadInfo: ProgressDifferentialDownloadInfo,
    private readonly cancellationToken: CancellationToken,
    private readonly onProgress: (info: ProgressInfo) => any
  ) {
    super()
  }

  _transform(chunk: any, encoding: string, callback: any) {
    if (this.cancellationToken.cancelled) {
      callback(new Error("cancelled"), null)
      return
    }

    // Don't send progress update when copying from disk
    if (this.operationType == OperationKind.COPY) {
      callback(null, chunk)
      return
    }

    this.transferred += chunk.length
    this.delta += chunk.length

    const now = Date.now()
    if (
      now >= this.nextUpdate &&
      this.transferred !== this.expectedBytes /* will be emitted by endRangeDownload() */ &&
      this.transferred !== this.progressDifferentialDownloadInfo.grandTotal /* will be emitted on _flush */
    ) {
      this.nextUpdate = now + 1000

      this.onProgress({
        total: this.progressDifferentialDownloadInfo.grandTotal,
        delta: this.delta,
        transferred: this.transferred,
        percent: (this.transferred / this.progressDifferentialDownloadInfo.grandTotal) * 100,
        bytesPerSecond: Math.round(this.transferred / ((now - this.start) / 1000)),
      })
      this.delta = 0
    }

    callback(null, chunk)
  }

  beginFileCopy(): void {
    this.operationType = OperationKind.COPY
  }

  beginRangeDownload(): void {
    this.operationType = OperationKind.DOWNLOAD

    this.expectedBytes += this.progressDifferentialDownloadInfo.expectedByteCounts[this.index++]
  }

  endRangeDownload(): void {
    // _flush() will doour final 100%
    if (this.transferred !== this.progressDifferentialDownloadInfo.grandTotal) {
      this.onProgress({
        total: this.progressDifferentialDownloadInfo.grandTotal,
        delta: this.delta,
        transferred: this.transferred,
        percent: (this.transferred / this.progressDifferentialDownloadInfo.grandTotal) * 100,
        bytesPerSecond: Math.round(this.transferred / ((Date.now() - this.start) / 1000)),
      })
    }
  }

  // Called when we are 100% done with the connection/download
  _flush(callback: any): void {
    if (this.cancellationToken.cancelled) {
      callback(new Error("cancelled"))
      return
    }

    this.onProgress({
      total: this.progressDifferentialDownloadInfo.grandTotal,
      delta: this.delta,
      transferred: this.transferred,
      percent: 100,
      bytesPerSecond: Math.round(this.transferred / ((Date.now() - this.start) / 1000)),
    })
    this.delta = 0
    this.transferred = 0

    callback(null)
  }
}
