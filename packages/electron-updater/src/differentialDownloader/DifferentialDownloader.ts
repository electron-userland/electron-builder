import BluebirdPromise from "bluebird-lst"
import { BlockMapDataHolder, configureRequestOptionsFromUrl, createHttpError, DigestTransform, HttpExecutor, safeGetHeader } from "builder-util-runtime"
import { BlockMap } from "builder-util-runtime/out/blockMapApi"
import { close, closeSync, createWriteStream, open } from "fs-extra-p"
import { IncomingMessage, OutgoingHttpHeaders, RequestOptions } from "http"
import { Writable } from "stream"
import { Logger } from "../main"
import { copyData, DataSplitter, PartListDataTask } from "./DataSplitter"
import { computeOperations, Operation, OperationKind } from "./downloadPlanBuilder"

const inflateRaw: any = BluebirdPromise.promisify(require("zlib").inflateRaw)

export class DifferentialDownloaderOptions {
  readonly oldFile: string
  readonly newUrl: string
  readonly logger: Logger
  readonly newFile: string

  readonly requestHeaders: OutgoingHttpHeaders | null

  readonly useMultipleRangeRequest?: boolean
}

export abstract class DifferentialDownloader {
  private readonly baseRequestOptions: RequestOptions

  protected fileMetadataBuffer: Buffer | null

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

  protected doDownload(oldBlockMap: BlockMap, newBlockMap: BlockMap) {
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
    if ((downloadSize + copySize + (this.fileMetadataBuffer == null ? 0 : this.fileMetadataBuffer.length) + this.signatureSize) !== newPackageSize) {
      throw new Error(`Internal error, size mismatch: downloadSize: ${downloadSize}, copySize: ${copySize}, newPackageSize: ${newPackageSize}`)
    }

    logger.info(`Full: ${formatBytes(newPackageSize)}, To download: ${formatBytes(downloadSize)} (${Math.round(downloadSize / (newPackageSize / 100))}%)`)

    return this.downloadFile(operations)
  }

  private async downloadFile(tasks: Array<Operation>): Promise<any> {
    const signature = this.signatureSize === 0 ? null : await this.readRemoteBytes(0, this.signatureSize - 1)

    const oldFileFd = await open(this.options.oldFile, "r")
    const newFileFd = await open(this.options.newFile, "w")
    const fileOut = createWriteStream(this.options.newFile, {fd: newFileFd})
    await new BluebirdPromise((resolve, reject) => {
      const streams: Array<any> = []
      const digestTransform = new DigestTransform(this.blockAwareFileInfo.sha512)
      // to simply debug, do manual validation to allow file to be fully written
      digestTransform.isValidateOnEnd = false
      streams.push(digestTransform)

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

      const w = (taskOffset: number) => {
        if (taskOffset >= tasks.length) {
          if (this.fileMetadataBuffer != null) {
            firstStream.write(this.fileMetadataBuffer)
          }
          firstStream.end()
          return
        }

        const nextOffset = taskOffset + (this.options.useMultipleRangeRequest === false ? 1 : 1000)
        this.executeTasks({
          tasks,
          start: taskOffset,
          end: Math.min(tasks.length, nextOffset),
          oldFileFd,
        }, firstStream, () => w(nextOffset), reject)
      }

      if (signature == null) {
        w(0)
      }
      else {
        firstStream.write(signature, () => w(0))
      }
    })
      .then(() => {
        return close(oldFileFd)
      })
      .catch(error => {
        closeSync(oldFileFd)
        closeSync(newFileFd)
        throw error
      })
  }

  private executeTasks(options: PartListDataTask, out: Writable, resolve: () => void, reject: (error: Error) => void) {
    let ranges = "bytes="
    let partCount = 0
    const partIndexToTaskIndex = new Map<number, number>()
    const partIndexToLength: Array<number> = []
    for (let i = options.start; i < options.end; i++) {
      const task = options.tasks[i]
      if (task.kind === OperationKind.DOWNLOAD) {
        ranges += `${task.start}-${task.end - 1}, `
        partIndexToTaskIndex.set(partCount, i)
        partCount++
        partIndexToLength.push(task.end - task.start)
      }
    }

    if (partCount <= 1) {
      // the only remote range - copy
      const w = (index: number) => {
        if (index >= options.end) {
          resolve()
          return
        }

        const task = options.tasks[index++]

        if (task.kind === OperationKind.COPY) {
          copyData(task, out, options.oldFileFd, reject, () => w(index))
        }
        else {
          const requestOptions = this.createRequestOptions("get")
          requestOptions.headers!!.Range = `bytes=${task.start}-${task.end - 1}`
          const request = this.httpExecutor.doRequest(requestOptions, response => {
            if (!checkIsRangesSupported(response, reject)) {
              return
            }

            response.pipe(out, {
              end: false
            })
            response.once("end", () => w(index))
          })
          this.httpExecutor.addErrorAndTimeoutHandlers(request, reject)
          request.end()
        }
      }

      w(options.start)
      return
    }

    const requestOptions = this.createRequestOptions("get")
    requestOptions.headers!!.Range = ranges.substring(0, ranges.length - 2)
    const request = this.httpExecutor.doRequest(requestOptions, response => {
      if (!checkIsRangesSupported(response, reject)) {
        return
      }

      const contentType = safeGetHeader(response, "content-type")
      const m = /^multipart\/.+?(?:; boundary=(?:(?:"(.+)")|(?:([^\s]+))))$/i.exec(contentType)
      if (m == null) {
        reject(new Error(`Content-Type "multipart/byteranges" is expected, but got "${contentType}"`))
        return
      }

      const dicer = new DataSplitter(out, options, partIndexToTaskIndex, m[1] || m[2], partIndexToLength, resolve)
      dicer.on("error", reject)
      response.pipe(dicer)
    })
    this.httpExecutor.addErrorAndTimeoutHandlers(request, reject)
    request.end()
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
        if (!checkIsRangesSupported(response, reject)) {
          return
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

function checkIsRangesSupported(response: IncomingMessage, reject: (error: Error) => void): boolean {
  // Electron net handles redirects automatically, our NodeJS test server doesn't use redirects - so, we don't check 3xx codes.
  if (response.statusCode!! >= 400) {
    reject(createHttpError(response))
    return false
  }

  if (response.statusCode !== 206) {
    const acceptRanges = safeGetHeader(response, "accept-ranges")
    if (acceptRanges == null || acceptRanges === "none") {
      reject(new Error("Server doesn't support Accept-Ranges"))
      return false
    }
  }
  return true
}