import { BlockMapDataHolder, DigestTransform, HttpExecutor, configureRequestUrl, configureRequestOptions } from "builder-util-runtime"
import { BlockMap } from "builder-util-runtime"
import { detectSha512Encoding } from "builder-util-runtime/internal"
import fsExtra from "fs-extra"
import { createWriteStream, WriteStream } from "fs"
import { IncomingMessage, OutgoingHttpHeaders, RequestOptions } from "http"
import { ProgressInfo, CancellationError, CancellationToken } from "builder-util-runtime"
import { Logger } from "../types.js"
import { nonThrowingLogger, throwIfCancelled } from "../util.js"
import { copyData, stopCopies } from "./DataSplitter.js"
import { URL } from "url"
import { computeOperations, Operation, OperationKind } from "./downloadPlanBuilder.js"
import {
  AbortableRequest,
  checkIsPartialContent,
  ERR_MULTIPLE_RANGES_NOT_SUPPORTED,
  executeTasksUsingMultipleRangeRequests,
  RangeRequestTarget,
  requestRange,
} from "./multipleRangeDownloader.js"
import { ProgressDifferentialDownloadCallbackTransform, ProgressDifferentialDownloadInfo } from "./ProgressDifferentialDownloadCallbackTransform.js"

export interface DifferentialDownloaderOptions {
  readonly oldFile: string
  readonly newUrl: URL
  readonly logger: Logger
  readonly newFile: string

  readonly requestHeaders: OutgoingHttpHeaders | null

  readonly isUseMultipleRangeRequest?: boolean

  readonly cancellationToken: CancellationToken
  onProgress?: (progress: ProgressInfo) => void
}

export abstract class DifferentialDownloader {
  fileMetadataBuffer: Buffer | null = null

  readonly logger: Logger

  // range requests that have not closed yet, aborted when the download is cancelled or fails
  private readonly requestsInFlight = new Set<AbortableRequest>()

  // starts from the provider's choice; turned off for the rest of this download when the server rejects multi-range requests
  private isUseMultipleRangeRequest: boolean

  // noinspection TypeScriptAbstractClassConstructorCanBeMadeProtected
  constructor(
    protected readonly blockAwareFileInfo: BlockMapDataHolder,
    readonly httpExecutor: HttpExecutor<any>,
    readonly options: DifferentialDownloaderOptions
  ) {
    // logging runs in stream and response callbacks, where a throwing logger would escape as an uncaught exception
    this.logger = nonThrowingLogger(options.logger)
    this.isUseMultipleRangeRequest = options.isUseMultipleRangeRequest === true
  }

  createRequestOptions(): RequestOptions {
    // requestRange follows a redirect itself, without the credential headers when the target is on another origin
    const result: RequestOptions & { redirect: "manual" } = {
      headers: {
        ...this.options.requestHeaders,
        accept: "*/*",
      },
      redirect: "manual",
    }
    configureRequestUrl(this.options.newUrl, result)
    // user-agent, cache-control and other common options
    configureRequestOptions(result)
    return result
  }

  /**
   * Creates a request for a part of the new file, tracked so that a cancel or a failure aborts it even when no data flows.
   * @internal
   */
  createRangeRequest(requestOptions: RequestOptions, callback: (response: IncomingMessage) => void): any {
    const request = this.httpExecutor.createRequest(requestOptions, callback)
    this.requestsInFlight.add(request)
    request.on("close", () => this.requestsInFlight.delete(request))
    return request
  }

  private abortRequestsInFlight(): void {
    for (const request of this.requestsInFlight) {
      try {
        request.abort()
      } catch (e: unknown) {
        // runs inside CancellationToken.cancel(), which must not throw
        this.logger.warn(`Cannot abort request: ${e}`)
      }
    }
    this.requestsInFlight.clear()
  }

  protected doDownload(oldBlockMap: BlockMap, newBlockMap: BlockMap): Promise<any> {
    // we don't check other metadata like compressionMethod - generic check that it is make sense to differentially update is suitable for it
    if (oldBlockMap.version !== newBlockMap.version) {
      throw new Error(`version is different (${oldBlockMap.version} - ${newBlockMap.version}), full download is required`)
    }

    const logger = this.logger
    const operations = computeOperations(oldBlockMap, newBlockMap, logger)
    if (logger.debug != null) {
      logger.debug(JSON.stringify(operations, null, 2))
    }

    let downloadSize = 0
    let copySize = 0
    for (const operation of operations) {
      const length = operation.end - operation.start
      if (operation.kind === OperationKind.DOWNLOAD) {
        downloadSize += length
      } else {
        copySize += length
      }
    }

    const newSize = this.blockAwareFileInfo.size
    if (downloadSize + copySize + (this.fileMetadataBuffer == null ? 0 : this.fileMetadataBuffer.length) !== newSize) {
      throw new Error(`Internal error, size mismatch: downloadSize: ${downloadSize}, copySize: ${copySize}, newSize: ${newSize}`)
    }

    logger.info(`Full: ${formatBytes(newSize)}, To download: ${formatBytes(downloadSize)} (${Math.round(downloadSize / (newSize / 100))}%)`)

    return this.downloadFile(operations).catch((e: unknown) => {
      // a cancel (or a failure caused by one, such as an aborted request) ends the download instead of starting the retry
      throwIfCancelled(e, this.options.cancellationToken)
      // anything but our own rejection (including a non-Error throw) is rethrown as is
      if (!(e instanceof Error) || !("code" in e) || e.code !== ERR_MULTIPLE_RANGES_NOT_SUPPORTED || !this.isUseMultipleRangeRequest) {
        throw e
      }
      // The new file is rewritten from the start, and each single-range answer is checked, so a host that ignores ranges
      // fails on its first request instead of streaming the whole file per range.
      logger.warn(`${e.message}: retrying with one range per request`)
      this.isUseMultipleRangeRequest = false
      return this.downloadFile(operations)
    })
  }

  private async downloadFile(tasks: Array<Operation>): Promise<void> {
    if (this.options.cancellationToken.cancelled) {
      throw new CancellationError()
    }
    const oldFileFd = await fsExtra.open(this.options.oldFile, "r")
    try {
      await this.doDownloadFile(tasks, oldFileFd)
    } finally {
      // after a failure, a copy may still read the old file: closing the descriptor under it would fail the read or, worse,
      // let it read whatever file reuses the descriptor number
      await stopCopies(oldFileFd)
      await fsExtra.close(oldFileFd).catch((e: unknown) => this.logger.error(`cannot close file "${this.options.oldFile}": ${e}`))
    }
  }

  private async doDownloadFile(tasks: Array<Operation>, oldFileFd: number): Promise<void> {
    // fileOut owns the descriptor of the new file: it closes it when it finishes, fails or is destroyed
    const fileOut = createWriteStream(this.options.newFile, { fd: await fsExtra.open(this.options.newFile, "w") })
    const fileOutClosed = new Promise<void>(resolve => fileOut.once("close", () => resolve()))
    const streams: Array<any> = []
    try {
      await this.writeNewFile(tasks, oldFileFd, fileOut, streams)
    } catch (e: unknown) {
      // stop everything that may still write the new file or start another copy from the old one
      this.abortRequestsInFlight()
      for (const stream of streams) {
        stream.destroy()
      }
      fileOut.destroy()
      await fileOutClosed
      throw e
    }
  }

  private writeNewFile(tasks: Array<Operation>, oldFileFd: number, fileOut: WriteStream, streams: Array<any>): Promise<void> {
    // A cancel is otherwise only noticed by the progress transform when data flows, so a stalled range request would never
    // settle: createPromise rejects on cancel (and unsubscribes once settled), and the requests in flight are aborted.
    return this.options.cancellationToken.createPromise<void>((resolve, reject, onCancel) => {
      onCancel(() => this.abortRequestsInFlight())

      // Create our download info transformer if we have one
      let downloadInfoTransform: ProgressDifferentialDownloadCallbackTransform | undefined = undefined
      if (!this.isUseMultipleRangeRequest && this.options.onProgress) {
        const expectedByteCounts: Array<number> = []
        let grandTotalBytes = 0

        for (const task of tasks) {
          if (task.kind === OperationKind.DOWNLOAD) {
            expectedByteCounts.push(task.end - task.start)
            grandTotalBytes += task.end - task.start
          }
        }

        const progressDifferentialDownloadInfo: ProgressDifferentialDownloadInfo = {
          expectedByteCounts: expectedByteCounts,
          grandTotal: grandTotalBytes,
        }

        downloadInfoTransform = new ProgressDifferentialDownloadCallbackTransform(progressDifferentialDownloadInfo, this.options.cancellationToken, this.options.onProgress)
        streams.push(downloadInfoTransform)
      }

      // like the full download, accept the legacy hex encoding of the manifest's sha512
      const sha512 = this.blockAwareFileInfo.sha512
      const digestTransform = new DigestTransform(sha512, "sha512", detectSha512Encoding(sha512))
      // to simply debug, do manual validation to allow file to be fully written
      digestTransform.isValidateOnEnd = false
      streams.push(digestTransform)

      // noinspection JSArrowFunctionCanBeReplacedWithShorthand
      fileOut.on("finish", () => {
        ;(fileOut.close as any)(() => {
          try {
            digestTransform.validate()
          } catch (e: any) {
            reject(e)
            return
          }

          resolve()
        })
      })

      streams.push(fileOut)

      let lastStream = null
      for (const stream of streams) {
        stream.on("error", reject)
        if (lastStream == null) {
          lastStream = stream
        } else {
          lastStream = lastStream.pipe(stream)
        }
      }

      const firstStream = streams[0]

      let w: any
      if (this.isUseMultipleRangeRequest) {
        w = executeTasksUsingMultipleRangeRequests(this, tasks, firstStream, oldFileFd, reject)
        w(0)
        return
      }

      let downloadOperationCount = 0
      this.logger.info(`Differential download: ${this.options.newUrl}`)

      // once a request is redirected, the remaining ranges are requested from the redirect target
      const target: RangeRequestTarget = { options: this.createRequestOptions() }

      w = (index: number): void => {
        if (index >= tasks.length) {
          if (this.fileMetadataBuffer != null) {
            firstStream.write(this.fileMetadataBuffer)
          }
          firstStream.end()
          return
        }

        const operation = tasks[index++]
        if (operation.kind === OperationKind.COPY) {
          // We are copying, let's not send status updates to the UI
          if (downloadInfoTransform) {
            downloadInfoTransform.beginFileCopy()
          }

          copyData(operation, firstStream, oldFileFd, reject, () => w(index))
          return
        }

        const range = `bytes=${operation.start}-${operation.end - 1}`

        this.logger?.debug?.(`download range: ${range}`)

        // We are starting to download
        if (downloadInfoTransform) {
          downloadInfoTransform.beginRangeDownload()
        }

        requestRange(
          this,
          target,
          range,
          response => {
            response.on("error", reject)
            // before the abort listener: rejecting a response destroys it, which would otherwise report a server abort
            if (!checkIsPartialContent(response, operation.start, operation.end - 1, reject)) {
              return
            }
            response.on("aborted", () => {
              reject(new Error("response has been aborted by the server"))
            })

            response.pipe(firstStream, {
              end: false,
            })
            response.once("end", () => {
              // Pass on that we are downloading a segment
              if (downloadInfoTransform) {
                downloadInfoTransform.endRangeDownload()
              }

              if (++downloadOperationCount === 100) {
                downloadOperationCount = 0
                setTimeout(() => w(index), 1000)
              } else {
                w(index)
              }
            })
          },
          reject,
          firstStream
        )
      }

      w(0)
    })
  }

  protected async readRemoteBytes(start: number, endInclusive: number): Promise<Buffer> {
    const buffer = Buffer.allocUnsafe(endInclusive + 1 - start)
    let position = 0
    await this.request(start, endInclusive, chunk => {
      chunk.copy(buffer, position)
      position += chunk.length
    })

    if (position !== buffer.length) {
      throw new Error(`Received data length ${position} is not equal to expected ${buffer.length}`)
    }
    return buffer
  }

  private request(start: number, endInclusive: number, dataHandler: (chunk: Buffer) => void): Promise<void> {
    return this.options.cancellationToken.createPromise<void>((resolve, reject, onCancel) => {
      onCancel(() => this.abortRequestsInFlight())
      requestRange(
        this,
        { options: this.createRequestOptions() },
        `bytes=${start}-${endInclusive}`,
        response => {
          response.on("error", reject)
          // before the abort listener: rejecting a response destroys it, which would otherwise report a server abort
          if (!checkIsPartialContent(response, start, endInclusive, reject)) {
            return
          }

          response.on("aborted", () => {
            reject(new Error("response has been aborted by the server"))
          })

          response.on("data", dataHandler)
          response.on("end", () => resolve())
        },
        reject
      )
    })
  }
}

function formatBytes(value: number, symbol = " KB"): string {
  return new Intl.NumberFormat("en").format((value / 1024).toFixed(2) as any) + symbol
}
