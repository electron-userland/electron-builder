import BluebirdPromise from "bluebird-lst"
import { BlockMapDataHolder, configureRequestOptionsFromUrl, DigestTransform, HttpError, HttpExecutor, PackageFileInfo, safeGetHeader } from "builder-util-runtime"
import { BlockMap, BlockMapFile, SIGNATURE_HEADER_SIZE } from "builder-util-runtime/out/blockMapApi"
import { close, createReadStream, createWriteStream, open, readFile } from "fs-extra-p"
import { OutgoingHttpHeaders, RequestOptions } from "http"
import { safeLoad } from "js-yaml"
import { Logger } from "./main"

const inflateRaw: any = BluebirdPromise.promisify(require("zlib").inflateRaw)

export class DifferentialDownloaderOptions {
  readonly oldPackageFile: string
  readonly newUrl: string
  readonly logger: Logger
  readonly newFile: string

  readonly requestHeaders: OutgoingHttpHeaders | null
}

function buildChecksumMap(file: BlockMapFile, fileOffset: number) {
  const checksumToOffset = new Map<string, number>()
  const checksumToSize = new Map<string, number>()
  let offset = fileOffset
  for (let i = 0; i < file.checksums.length; i++) {
    const checksum = file.checksums[i]
    const size = file.sizes[i]
    checksumToOffset.set(checksum, offset)
    checksumToSize.set(checksum, size)
    offset += size
  }
  return {checksumToOffset, checksumToOldSize: checksumToSize}
}

export class DifferentialDownloader {
  private readonly baseRequestOptions: RequestOptions

  private fileMetadataBuffer: Buffer

  private readonly logger: Logger

  constructor(private readonly blockAwareFileInfo: BlockMapDataHolder, private readonly httpExecutor: HttpExecutor<any>, private readonly options: DifferentialDownloaderOptions) {
    this.logger = options.logger
    this.baseRequestOptions = configureRequestOptionsFromUrl(options.newUrl, {})
  }

  protected get signatureSize() {
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

  async downloadNsisPackage(oldBlockMapFile: string) {
    const packageInfo = this.blockAwareFileInfo as PackageFileInfo
    const offset = packageInfo.size - packageInfo.headerSize!! - packageInfo.blockMapSize!!
    this.fileMetadataBuffer = await this.readRemoteBytes(offset, packageInfo.size - 1)
    const newBlockMap = await readBlockMap(this.fileMetadataBuffer.slice(packageInfo.headerSize!!))
    const oldBlockMap = safeLoad(await readFile(oldBlockMapFile, "utf-8"))
    await this.download(oldBlockMap, newBlockMap)
  }

  async downloadAppImage(oldBlockMap: BlockMap) {
    const packageInfo = this.blockAwareFileInfo
    const fileSize = packageInfo.size!!
    const offset = fileSize - (packageInfo.blockMapSize!! + 4)
    this.fileMetadataBuffer = await this.readRemoteBytes(offset, fileSize - 1)
    const newBlockMap = await readBlockMap(this.fileMetadataBuffer.slice(0, this.fileMetadataBuffer.length - 4))
    await this.download(oldBlockMap, newBlockMap)
  }

  private async download(oldBlockMap: BlockMap, newBlockMap: BlockMap) {
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

    const newPackageSize = this.blockAwareFileInfo.size
    if ((downloadSize + copySize + this.fileMetadataBuffer.length + this.signatureSize) !== newPackageSize) {
      throw new Error(`Internal error, size mismatch: downloadSize: ${downloadSize}, copySize: ${copySize}, newPackageSize: ${newPackageSize}`)
    }

    this.logger.info(`Full: ${formatBytes(newPackageSize)}, To download: ${formatBytes(downloadSize)} (${Math.round(downloadSize / (newPackageSize / 100))}%)`)

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

  private computeOperations(oldBlockMap: BlockMap, newBlockMap: BlockMap) {
    const nameToOldBlocks = buildBlockFileMap(oldBlockMap.files)
    const nameToNewBlocks = buildBlockFileMap(newBlockMap.files)

    const oldEntryMap = buildEntryMap(oldBlockMap.files)

    let lastOperation: Operation | null = null

    const operations: Array<Operation> = []
    for (const blockMapFile of newBlockMap.files) {
      const name = blockMapFile.name
      const oldEntry = oldEntryMap.get(name)
      if (oldEntry == null) {
        // new file
        operations.push({
          kind: OperationKind.DOWNLOAD,
          start: blockMapFile.offset,
          end: blockMapFile.offset + blockMapFile.sizes.reduce((accumulator, currentValue) => accumulator + currentValue),
        })
        continue
      }

      const newFile = nameToNewBlocks.get(name)!!
      let changedBlockCount = 0

      const {checksumToOffset: checksumToOldOffset, checksumToOldSize} = buildChecksumMap(nameToOldBlocks.get(name)!!, oldEntry.offset)

      let newOffset = blockMapFile.offset
      for (let i = 0; i < newFile.checksums.length; newOffset += newFile.sizes[i], i++) {
        const blockSize = newFile.sizes[i]
        const checksum = newFile.checksums[i]
        let oldOffset: number | null | undefined = checksumToOldOffset.get(checksum)
        if (oldOffset != null && checksumToOldSize.get(checksum) !== blockSize) {
          this.logger.warn(`Checksum ("${checksum}") matches, but size differs (old: ${checksumToOldSize.get(checksum)}, new: ${blockSize})`)
          oldOffset = null
        }

        if (oldOffset == null) {
          changedBlockCount++

          if (lastOperation == null || lastOperation.kind !== OperationKind.DOWNLOAD || lastOperation.end !== newOffset) {
            lastOperation = {
              kind: OperationKind.DOWNLOAD,
              start: newOffset,
              end: newOffset + blockSize,
            }
            operations.push(lastOperation)
          }
          else {
            lastOperation.end += blockSize
          }
        }
        else if (lastOperation == null || lastOperation.kind !== OperationKind.COPY || lastOperation.end !== oldOffset) {
          lastOperation = {
            kind: OperationKind.COPY,
            start: oldOffset,
            end: oldOffset + blockSize,
          }
          operations.push(lastOperation)
        }
        else {
          lastOperation.end += blockSize
        }
      }

      if (changedBlockCount > 0) {
        this.logger.info(`File${blockMapFile.name === "file" ? "" : (" " + blockMapFile.name)} has ${changedBlockCount} changed blocks`)
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

export class SevenZipDifferentialDownloader extends DifferentialDownloader {
  constructor(packageInfo: BlockMapDataHolder, httpExecutor: HttpExecutor<any>, options: DifferentialDownloaderOptions) {
    super(packageInfo, httpExecutor, options)
  }

  protected get signatureSize() {
    return SIGNATURE_HEADER_SIZE
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