import { BlockMapDataHolder, DigestTransform, HttpExecutor, configureRequestUrl, configureRequestOptions } from "builder-util-runtime"
import { BlockMap } from "builder-util-runtime"
import fsExtra from "fs-extra"
import { createWriteStream } from "fs"
import { OutgoingHttpHeaders, RequestOptions } from "http"
import { ProgressInfo, CancellationToken } from "builder-util-runtime"
import { Logger } from "../types.js"
import { copyData } from "./DataSplitter.js"
import { URL } from "url"
import { computeOperations, Operation, OperationKind } from "./downloadPlanBuilder.js"
import { checkIsPartialContent, ERR_MULTIPLE_RANGES_NOT_SUPPORTED, executeTasksUsingMultipleRangeRequests } from "./multipleRangeDownloader.js"
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

  // starts from the provider's choice; turned off for the rest of this download when the server rejects multi-range requests
  private isUseMultipleRangeRequest: boolean

  // noinspection TypeScriptAbstractClassConstructorCanBeMadeProtected
  constructor(
    protected readonly blockAwareFileInfo: BlockMapDataHolder,
    readonly httpExecutor: HttpExecutor<any>,
    readonly options: DifferentialDownloaderOptions
  ) {
    this.logger = options.logger
    this.isUseMultipleRangeRequest = options.isUseMultipleRangeRequest === true
  }

  createRequestOptions(): RequestOptions {
    const result = {
      headers: {
        ...this.options.requestHeaders,
        accept: "*/*",
      },
    }
    configureRequestUrl(this.options.newUrl, result)
    // user-agent, cache-control and other common options
    configureRequestOptions(result)
    return result
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

    return this.downloadFile(operations).catch((e: any) => {
      if (e.code !== ERR_MULTIPLE_RANGES_NOT_SUPPORTED || !this.isUseMultipleRangeRequest) {
        throw e
      }
      // The new file is rewritten from the start, and each single-range answer is checked, so a host that ignores ranges
      // fails on its first request instead of streaming the whole file per range.
      logger.warn(`${e.message}: retrying with one range per request`)
      this.isUseMultipleRangeRequest = false
      return this.downloadFile(operations)
    })
  }

  private downloadFile(tasks: Array<Operation>): Promise<any> {
    const fdList: Array<OpenedFile> = []
    const closeFiles = (): Promise<Array<void>> => {
      return Promise.all(
        fdList.map(openedFile => {
          return fsExtra.close(openedFile.descriptor).catch((e: any) => {
            this.logger.error(`cannot close file "${openedFile.path}": ${e}`)
          })
        })
      )
    }
    return this.doDownloadFile(tasks, fdList)
      .then(closeFiles)
      .catch((e: any) => {
        // then must be after catch here (since then always throws error)
        return closeFiles()
          .catch(closeFilesError => {
            // closeFiles never throw error, but just to be sure
            try {
              this.logger.error(`cannot close files: ${closeFilesError}`)
            } catch (errorOnLog) {
              try {
                console.error(errorOnLog)
              } catch (_ignored) {
                // ok, give up and ignore error
              }
            }
            throw e
          })
          .then(() => {
            throw e
          })
      })
  }

  private async doDownloadFile(tasks: Array<Operation>, fdList: Array<OpenedFile>): Promise<any> {
    const oldFileFd = await fsExtra.open(this.options.oldFile, "r")
    fdList.push({ descriptor: oldFileFd, path: this.options.oldFile })
    const newFileFd = await fsExtra.open(this.options.newFile, "w")
    fdList.push({ descriptor: newFileFd, path: this.options.newFile })
    const fileOut = createWriteStream(this.options.newFile, { fd: newFileFd })
    await new Promise((resolve, reject) => {
      const streams: Array<any> = []

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

      const digestTransform = new DigestTransform(this.blockAwareFileInfo.sha512)
      // to simply debug, do manual validation to allow file to be fully written
      digestTransform.isValidateOnEnd = false
      streams.push(digestTransform)

      // noinspection JSArrowFunctionCanBeReplacedWithShorthand
      fileOut.on("finish", () => {
        ;(fileOut.close as any)(() => {
          // remove from fd list because closed successfully
          fdList.splice(1, 1)
          try {
            digestTransform.validate()
          } catch (e: any) {
            reject(e)
            return
          }

          resolve(undefined)
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
      let actualUrl: string | null = null
      this.logger.info(`Differential download: ${this.options.newUrl}`)

      const requestOptions = this.createRequestOptions()
      ;(requestOptions as any).redirect = "manual"

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
        requestOptions.headers!.range = range

        this.logger?.debug?.(`download range: ${range}`)

        // We are starting to download
        if (downloadInfoTransform) {
          downloadInfoTransform.beginRangeDownload()
        }

        const request = this.httpExecutor.createRequest(requestOptions, response => {
          // before the abort listeners: rejecting a response destroys it, which would otherwise report a server abort
          if (!checkIsPartialContent(response, operation.start, operation.end - 1, reject)) {
            return
          }
          response.on("error", reject)
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
        })
        request.on("redirect", (statusCode: number, method: string, redirectUrl: string) => {
          this.logger.info(`Redirect to ${removeQuery(redirectUrl)}`)
          actualUrl = redirectUrl
          configureRequestUrl(new URL(actualUrl), requestOptions)
          request.followRedirect()
        })
        this.httpExecutor.addErrorAndTimeoutHandlers(request, reject)
        request.end()
      }

      w(0)
    })
  }

  protected async readRemoteBytes(start: number, endInclusive: number): Promise<Buffer> {
    const buffer = Buffer.allocUnsafe(endInclusive + 1 - start)
    const requestOptions = this.createRequestOptions()
    requestOptions.headers!.range = `bytes=${start}-${endInclusive}`
    let position = 0
    await this.request(requestOptions, start, endInclusive, chunk => {
      chunk.copy(buffer, position)
      position += chunk.length
    })

    if (position !== buffer.length) {
      throw new Error(`Received data length ${position} is not equal to expected ${buffer.length}`)
    }
    return buffer
  }

  private request(requestOptions: RequestOptions, start: number, endInclusive: number, dataHandler: (chunk: Buffer) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = this.httpExecutor.createRequest(requestOptions, response => {
        if (!checkIsPartialContent(response, start, endInclusive, reject)) {
          return
        }

        response.on("error", reject)
        response.on("aborted", () => {
          reject(new Error("response has been aborted by the server"))
        })

        response.on("data", dataHandler)
        response.on("end", () => resolve())
      })
      this.httpExecutor.addErrorAndTimeoutHandlers(request, reject)
      request.end()
    })
  }
}

function formatBytes(value: number, symbol = " KB"): string {
  return new Intl.NumberFormat("en").format((value / 1024).toFixed(2) as any) + symbol
}

// safety
function removeQuery(url: string): string {
  const index = url.indexOf("?")
  return index < 0 ? url : url.substring(0, index)
}

interface OpenedFile {
  readonly descriptor: number
  readonly path: string
}
