import BluebirdPromise from "bluebird-lst"
import { configureRequestOptionsFromUrl, DigestTransform, HttpError, HttpExecutor, PackageFileInfo, safeGetHeader } from "builder-util-runtime"
import { BlockMap, BlockMapFile, SIGNATURE_HEADER_SIZE } from "builder-util-runtime/out/blockMapApi"
import { close, createReadStream, createWriteStream, open, readFile } from "fs-extra-p"
import { OutgoingHttpHeaders, RequestOptions } from "http"
import { safeLoad } from "js-yaml"
import { Logger } from "./main"

const inflateRaw: any = BluebirdPromise.promisify(require("zlib").inflateRaw)

export class DifferentialDownloaderOptions {
  readonly oldBlockMapFile: string
  readonly oldPackageFile: string
  readonly logger: Logger
  readonly packagePath: string

  readonly requestHeaders: OutgoingHttpHeaders | null
}

function buildChecksumToOffsetMap(file: BlockMapFile, fileOffset: number) {
  const result = new Map<string, number>()
  let offset = fileOffset
  for (let i = 0; i < file.checksums.length; i++) {
    result.set(file.checksums[i], offset)
    offset += file.sizes[i]
  }
  return result
}

export class DifferentialDownloader {
  private readonly baseRequestOptions: RequestOptions

  private fileMetadataBuffer: Buffer

  private readonly logger: Logger

  constructor(private readonly packageInfo: PackageFileInfo, private readonly httpExecutor: HttpExecutor<any>, private readonly options: DifferentialDownloaderOptions) {
    this.logger = options.logger
    this.baseRequestOptions = configureRequestOptionsFromUrl(packageInfo.file, {})
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

  async download() {
    const packageInfo = this.packageInfo
    const offset = packageInfo.size - packageInfo.headerSize!! - packageInfo.blockMapSize!!
    this.fileMetadataBuffer = await this.readRemoteBytes(offset, packageInfo.size - 1)

    const oldBlockMap = safeLoad(await readFile(this.options.oldBlockMapFile, "utf-8"))
    const newBlockMap = await readBlockMap(this.fileMetadataBuffer.slice(this.packageInfo.headerSize!!))

    // we don't check other metadata like compressionMethod - generic check that it is make sense to differentially update is suitable for it
    if (oldBlockMap.version !== newBlockMap.version) {
      throw new Error(`version is different (${oldBlockMap.version} - ${newBlockMap.version}), full download is required`)
    }

    const operations = this.computeOperations(oldBlockMap, newBlockMap)
    if (this.logger.debug != null) {
      this.logger.debug(JSON.stringify(operations, null, 2))
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

    const newPackageSize = this.packageInfo.size
    if ((downloadSize + copySize + this.fileMetadataBuffer.length + 32) !== newPackageSize) {
      throw new Error(`Internal error, size mismatch: downloadSize: ${downloadSize}, copySize: ${copySize}, newPackageSize: ${newPackageSize}`)
    }

    this.logger.info(`Full: ${formatBytes(newPackageSize)}, To download: ${formatBytes(downloadSize)} (${Math.round(downloadSize / (newPackageSize / 100))}%)`)

    await this.downloadFile(operations)
  }

  private async downloadFile(operations: Array<Operation>) {
    // todo we can avoid download remote and construct manually
    const signature = await this.readRemoteBytes(0, SIGNATURE_HEADER_SIZE - 1)

    const oldFileFd = await open(this.options.oldPackageFile, "r")
    await new BluebirdPromise((resolve, reject) => {
      const streams: Array<any> = []
      const digestTransform = new DigestTransform(this.packageInfo.sha512)
      // to simply debug, do manual validation to allow file to be fully written
      digestTransform.isValidateOnEnd = false
      streams.push(digestTransform)

      const fileOut = createWriteStream(this.options.packagePath)
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

      firstStream.write(signature, () => w(0))
    })
      .finally(() => close(oldFileFd))
  }

  private computeOperations(oldBlockMap: BlockMap, newBlockMap: BlockMap) {
    // const oldEntryMap: Map<string, Entry>
    const nameToOldBlocks = buildBlockFileMap(oldBlockMap.files)
    const nameToNewBlocks = buildBlockFileMap(newBlockMap.files)

    const oldEntryMap = buildEntryMap(oldBlockMap.files)

    const operations: Array<Operation> = []
    for (const blockMapFile of newBlockMap.files) {
      const name = blockMapFile.name
      const oldEntry = blockMapFile.size === 0 ? null : oldEntryMap.get(name)
      // block map doesn't contain empty files, but we check this case just to be sure
      if (oldEntry == null) {
        // new file
        operations.push({
          kind: OperationKind.DOWNLOAD,
          start: blockMapFile.offset,
          end: blockMapFile.size - blockMapFile.offset,
        })
        continue
      }

      let lastOperation: Operation | null = null

      const newFile = nameToNewBlocks.get(name)!!
      const oldFile = nameToOldBlocks.get(name)!!

      let changedBlockCount = 0

      const checksumToOldOffset = buildChecksumToOffsetMap(oldFile, oldEntry.offset)

      let newOffset = 0
      blockMapLoop:
      for (let i = 0; i < newFile.checksums.length; newOffset += newFile.sizes[i], i++) {
        const currentBlockSize = newFile.sizes[i]

        const oldOffset = checksumToOldOffset.get(newFile.checksums[i])
        if (oldOffset == null) {
          changedBlockCount++

          const start = blockMapFile.offset + newOffset
          const end = start + currentBlockSize
          if (lastOperation == null || lastOperation.kind !== OperationKind.DOWNLOAD) {
            lastOperation = {
              kind: OperationKind.DOWNLOAD,
              start,
              end,
            }
            operations.push(lastOperation)
          }
          else {
            lastOperation.end += currentBlockSize
          }
        }
        else {
          if (lastOperation == null || lastOperation.kind !== OperationKind.COPY || lastOperation.end !== oldOffset) {
            const end: number = oldOffset + currentBlockSize
            if (i === 0 && operations.length > 0) {
              const prevOperation = operations[operations.length - 1]
              if (prevOperation.kind === OperationKind.COPY && prevOperation.end === oldOffset) {
                lastOperation = prevOperation
                prevOperation.end = end
                continue blockMapLoop
              }
            }

            lastOperation = {
              kind: OperationKind.COPY,
              start: oldOffset,
              end,
            }
            operations.push(lastOperation)
          }
          else {
            lastOperation.end += currentBlockSize
          }
        }
      }

      if (changedBlockCount > 0) {
        this.logger.info(`File ${blockMapFile.name} has ${changedBlockCount} changed blocks`)
      }
    }
    return operations
  }

  private async readRemoteBytes(start: number, endInclusive: number) {
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

enum OperationKind {
  COPY, DOWNLOAD
}

interface Operation {
  kind: OperationKind

  start: number
  end: number
}

function buildEntryMap(list: Array<BlockMapFile>) {
  const result = new Map<string, BlockMapFile>()
  for (const item of list) {
    result.set(item.name, item)
  }
  return result
}

function buildBlockFileMap(list: Array<BlockMapFile>) {
  const result = new Map<string, BlockMapFile>()
  for (const item of list) {
    result.set(item.name, item)
  }
  return result
}

async function readBlockMap(data: Buffer): Promise<BlockMap> {
  return safeLoad((await inflateRaw(data)).toString())
}

function formatBytes(value: number, symbol = " KB") {
  return new Intl.NumberFormat("en").format((value / 1024).toFixed(2) as any) + symbol
}