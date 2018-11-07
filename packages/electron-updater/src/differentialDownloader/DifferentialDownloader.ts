import BluebirdPromise from "bluebird-lst"
import { BlockMapDataHolder, configureRequestOptionsFromUrl, createHttpError, DigestTransform, HttpExecutor } from "builder-util-runtime"
import { BlockMap } from "builder-util-runtime/out/blockMapApi"
import { close, createWriteStream, open } from "fs-extra-p"
import { OutgoingHttpHeaders, RequestOptions } from "http"
import { Logger } from "../main"
import { copyData } from "./DataSplitter"
import { computeOperations, Operation, OperationKind } from "./downloadPlanBuilder"
import { checkIsRangesSupported, executeTasks } from "./multipleRangeDownloader"

export interface DifferentialDownloaderOptions {
  readonly oldFile: string
  readonly newUrl: string
  readonly logger: Logger
  readonly newFile: string

  readonly requestHeaders: OutgoingHttpHeaders | null

  readonly useMultipleRangeRequest?: boolean
}

export abstract class DifferentialDownloader {
  private readonly baseRequestOptions: RequestOptions

  fileMetadataBuffer: Buffer | null = null

  private readonly logger: Logger

  // noinspection TypeScriptAbstractClassConstructorCanBeMadeProtected
  constructor(protected readonly blockAwareFileInfo: BlockMapDataHolder, readonly httpExecutor: HttpExecutor<any>, readonly options: DifferentialDownloaderOptions) {
    this.logger = options.logger
    this.baseRequestOptions = configureRequestOptionsFromUrl(options.newUrl, {})
  }

  createRequestOptions(method: "get" | "head" = "get", newUrl?: string | null): RequestOptions {
    return {
      ...(newUrl == null ? this.baseRequestOptions : configureRequestOptionsFromUrl(newUrl, {})),
      method,
      headers: {
        ...this.options.requestHeaders,
        accept: "*/*",
      } as any,
    }
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
      }
      else {
        copySize += length
      }
    }

    const newPackageSize = this.blockAwareFileInfo.size
    if ((downloadSize + copySize + (this.fileMetadataBuffer == null ? 0 : this.fileMetadataBuffer.length)) !== newPackageSize) {
      throw new Error(`Internal error, size mismatch: downloadSize: ${downloadSize}, copySize: ${copySize}, newPackageSize: ${newPackageSize}`)
    }

    logger.info(`Full: ${formatBytes(newPackageSize)}, To download: ${formatBytes(downloadSize)} (${Math.round(downloadSize / (newPackageSize / 100))}%)`)

    return this.downloadFile(operations)
  }

  private downloadFile(tasks: Array<Operation>): Promise<any> {
    const fdList: Array<OpenedFile> = []
    const closeFiles = () => {
      return BluebirdPromise.map(fdList, openedFile => {
        return close(openedFile.descriptor)
          .catch(e => {
            this.logger.error(`cannot close file "${openedFile.path}": ${e}`)
          })
      })
    }
    return this.doDownloadFile(tasks, fdList)
      .then(closeFiles)
      .catch(e => {
        // then must be after catch here (since then always throws error)
        return closeFiles()
          .catch(closeFilesError => {
            // closeFiles never throw error, but just to be sure
            try {
              this.logger.error(`cannot close files: ${closeFilesError}`)
            }
            catch (errorOnLog) {
              try {
                console.error(errorOnLog)
              }
              catch (ignored) {
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
    const oldFileFd = await open(this.options.oldFile, "r")
    fdList.push({descriptor: oldFileFd, path: this.options.oldFile})
    const newFileFd = await open(this.options.newFile, "w")
    fdList.push({descriptor: newFileFd, path: this.options.newFile})
    const fileOut = createWriteStream(this.options.newFile, {fd: newFileFd})
    await new Promise((resolve, reject) => {
      const streams: Array<any> = []
      const digestTransform = new DigestTransform(this.blockAwareFileInfo.sha512)
      // to simply debug, do manual validation to allow file to be fully written
      digestTransform.isValidateOnEnd = false
      streams.push(digestTransform)

      // noinspection JSArrowFunctionCanBeReplacedWithShorthand
      fileOut.on("finish", () => {
        (fileOut.close as any)(() => {
          try {
            digestTransform.validate()
          }
          catch (e) {
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
        }
        else {
          lastStream = lastStream.pipe(stream)
        }
      }

      const firstStream = streams[0]

      let w: any
      if (this.options.useMultipleRangeRequest) {
        w = executeTasks(this, tasks, firstStream, oldFileFd, reject)
      }
      else {
        let downloadOperationCount = 0
        let actualUrl: string | null = null
        this.logger.info(`Differential download: ${this.options.newUrl}`)
        w = (index: number) => {
          if (index >= tasks.length) {
            if (this.fileMetadataBuffer != null) {
              firstStream.write(this.fileMetadataBuffer)
            }
            firstStream.end()
            return
          }

          const operation = tasks[index++]
          if (operation.kind === OperationKind.COPY) {
            copyData(operation, firstStream, oldFileFd, reject, () => w(index))
            return
          }

          const requestOptions = this.createRequestOptions("get", actualUrl)
          const range = `bytes=${operation.start}-${operation.end - 1}`
          requestOptions.headers!!.Range = range;
          (requestOptions as any).redirect = "manual"

          const debug = this.logger.debug
          if (debug != null) {
            debug(`download range: ${range}`)
          }

          const request = this.httpExecutor.createRequest(requestOptions, response => {
            // Electron net handles redirects automatically, our NodeJS test server doesn't use redirects - so, we don't check 3xx codes.
            if (response.statusCode >= 400) {
              reject(createHttpError(response))
            }

            response.pipe(firstStream, {
              end: false
            })
            response.once("end", () => {
              if (++downloadOperationCount === 100) {
                downloadOperationCount = 0
                setTimeout(() => w(index), 1000)
              }
              else {
                w(index)
              }
            })
          })
          request.on("redirect", (statusCode: number, method: string, redirectUrl: string) => {
            this.logger.info(`Redirect to ${removeQuery(redirectUrl)}`)
            actualUrl = redirectUrl
            request.followRedirect()
          })
          this.httpExecutor.addErrorAndTimeoutHandlers(request, reject)
          request.end()
        }
      }

      w(0)
    })
  }

  protected async readRemoteBytes(start: number, endInclusive: number) {
    const buffer = Buffer.allocUnsafe((endInclusive + 1) - start)
    const requestOptions = this.createRequestOptions()
    requestOptions.headers!!.Range = `bytes=${start}-${endInclusive}`
    let position = 0
    await this.request(requestOptions, chunk => {
      chunk.copy(buffer, position)
      position += chunk.length
    })

    if (position !== buffer.length) {
      throw new Error(`Received data length ${position} is not equal to expected ${buffer.length}`)
    }
    return buffer
  }

  private request(requestOptions: RequestOptions, dataHandler: (chunk: Buffer) => void) {
    return new Promise((resolve, reject) => {
      const request = this.httpExecutor.createRequest(requestOptions, response => {
        if (!checkIsRangesSupported(response, reject)) {
          return
        }

        response.on("data", dataHandler)
        response.on("end", () => resolve())
      })
      this.httpExecutor.addErrorAndTimeoutHandlers(request, reject)
      request.end()
    })
  }
}

function formatBytes(value: number, symbol = " KB") {
  return new Intl.NumberFormat("en").format((value / 1024).toFixed(2) as any) + symbol
}

// safety
function removeQuery(url: string) {
  const index = url.indexOf("?")
  return index < 0 ? url : url.substring(0, index)
}

interface OpenedFile {
  readonly descriptor: number
  readonly path: string
}