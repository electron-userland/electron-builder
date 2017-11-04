import BluebirdPromise from "bluebird-lst"
import { BlockMapDataHolder, configureRequestOptionsFromUrl, DigestTransform, HttpError, HttpExecutor, safeGetHeader } from "builder-util-runtime"
import { BlockMap } from "builder-util-runtime/out/blockMapApi"
import { close, createReadStream, createWriteStream, open } from "fs-extra-p"
import { OutgoingHttpHeaders, RequestOptions } from "http"
import { Logger } from "../main"
import { computeOperations, Operation, OperationKind } from "./downloadPlanBuilder"

const inflateRaw: any = BluebirdPromise.promisify(require("zlib").inflateRaw)

export class DifferentialDownloaderOptions {
  readonly oldPackageFile: string
  readonly newUrl: string
  readonly logger: Logger
  readonly newFile: string

  readonly requestHeaders: OutgoingHttpHeaders | null
}

export abstract class DifferentialDownloader {
  private readonly baseRequestOptions: RequestOptions

  protected fileMetadataBuffer: Buffer

  private readonly logger: Logger

  constructor(protected readonly blockAwareFileInfo: BlockMapDataHolder, private readonly httpExecutor: HttpExecutor<any>, private readonly options: DifferentialDownloaderOptions) {
    this.logger = options.logger
    this.baseRequestOptions = configureRequestOptionsFromUrl(options.newUrl, {})
  }

  protected get signatureSize(): number {
    return 0
  }

  private createRequestOptions(method: "head" | "get" = "get"): RequestOptions {
    return {
      ...this.baseRequestOptions,
      method,
      headers: {
        ...this.options.requestHeaders,
        Accept: "*/*",
      } as any,
    }
  }

  protected async doDownload(oldBlockMap: BlockMap, newBlockMap: BlockMap) {
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
    if ((downloadSize + copySize + this.fileMetadataBuffer.length + this.signatureSize) !== newPackageSize) {
      throw new Error(`Internal error, size mismatch: downloadSize: ${downloadSize}, copySize: ${copySize}, newPackageSize: ${newPackageSize}`)
    }

    logger.info(`Full: ${formatBytes(newPackageSize)}, To download: ${formatBytes(downloadSize)} (${Math.round(downloadSize / (newPackageSize / 100))}%)`)

    await this.downloadFile(operations)
  }

  private async downloadFile(operations: Array<Operation>) {
    // todo we can avoid download remote and construct manually
    const signature = this.signatureSize === 0 ? null : await this.readRemoteBytes(0, this.signatureSize - 1)

    const oldFileFd = await open(this.options.oldPackageFile, "r")
    await new BluebirdPromise((resolve, reject) => {
      const streams: Array<any> = []
      const digestTransform = new DigestTransform(this.blockAwareFileInfo.sha512)
      // to simply debug, do manual validation to allow file to be fully written
      digestTransform.isValidateOnEnd = false
      streams.push(digestTransform)

      const fileOut = createWriteStream(this.options.newFile)
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

      const w = (index: number) => {
        if (index >= operations.length) {
          firstStream.end(this.fileMetadataBuffer)
          return
        }

        const operation = operations[index++]

        if (operation.kind === OperationKind.COPY) {
          const readStream = createReadStream(this.options.oldPackageFile, {
            fd: oldFileFd,
            autoClose: false,
            start: operation.start,
            // end is inclusive
            end: operation.end - 1,
          })
          readStream.on("error", reject)
          readStream.once("end", () => w(index))
          readStream.pipe(firstStream, {
            end: false
          })
        }
        else {
          // https://github.com/electron-userland/electron-builder/issues/1523#issuecomment-327084661
          // todo to reduce http requests we need to consolidate non sequential download operations (Multipart ranges)
          const requestOptions = this.createRequestOptions("get")
          requestOptions.headers!!.Range = `bytes=${operation.start}-${operation.end - 1}`
          const request = this.httpExecutor.doRequest(requestOptions, response => {
            // Electron net handles redirects automatically, our NodeJS test server doesn't use redirects - so, we don't check 3xx codes.
            if (response.statusCode >= 400) {
              reject(new HttpError(response))
            }

            response.pipe(firstStream, {
              end: false
            })
            response.once("end", () => w(index))
          })
          this.httpExecutor.addErrorAndTimeoutHandlers(request, reject)
          request.end()
        }
      }

      if (signature == null) {
        w(0)
      }
      else {
        firstStream.write(signature, () => w(0))
      }
    })
      .finally(() => close(oldFileFd))
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
    return buffer
  }

  private request(requestOptions: RequestOptions, dataHandler: (chunk: Buffer) => void) {
    return new BluebirdPromise((resolve, reject) => {
      const request = this.httpExecutor.doRequest(requestOptions, response => {
        // Electron net handles redirects automatically, our NodeJS test server doesn't use redirects - so, we don't check 3xx codes.
        if (response.statusCode >= 400) {
          reject(new HttpError(response))
        }

        if (response.statusCode !== 206) {
          const acceptRanges = safeGetHeader(response, "accept-ranges")
          if (acceptRanges == null || acceptRanges === "none") {
            reject(new Error("Server doesn't support Accept-Ranges"))
          }
        }

        response.on("data", dataHandler)
        response.on("end", () => {
          resolve()
        })
      })
      this.httpExecutor.addErrorAndTimeoutHandlers(request, reject)
      request.end()
    })
  }
}

export async function readBlockMap(data: Buffer): Promise<BlockMap> {
  return JSON.parse((await inflateRaw(data)).toString())
}

function formatBytes(value: number, symbol = " KB") {
  return new Intl.NumberFormat("en").format((value / 1024).toFixed(2) as any) + symbol
}