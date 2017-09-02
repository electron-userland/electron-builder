import BluebirdPromise from "bluebird-lst"
import { configureRequestOptionsFromUrl, DigestTransform, HttpError, HttpExecutor, safeGetHeader } from "electron-builder-http"
import { BLOCK_MAP_FILE_NAME, BlockMap, BlockMapFile } from "electron-builder-http/out/differentialUpdate/blockMapApi"
import { openZip } from "electron-builder-http/out/differentialUpdate/localZip"
import { Entry, eocdrWithoutCommentSize, readCentralDirectoryEntry } from "electron-builder-http/out/differentialUpdate/zip"
import { PackageFileInfo } from "electron-builder-http/out/updateInfo"
import { close, createReadStream, createWriteStream, open } from "fs-extra-p"
import { OutgoingHttpHeaders, RequestOptions } from "http"
import { safeLoad } from "js-yaml"
import { Logger } from "./main"

const inflateRaw: any = BluebirdPromise.promisify(require("zlib").inflateRaw)

export class DifferentialDownloader {
  private readonly baseRequestOptions: RequestOptions

  private blockMapBuffer: Buffer
  private centralDirectoryBuffer: Buffer

  constructor(private readonly packageInfo: PackageFileInfo,
              private readonly httpExecutor: HttpExecutor<any>,
              private readonly requestHeaders: OutgoingHttpHeaders | null,
              private readonly oldPackageFile: string,
              private readonly logger: Logger,
              private readonly packagePath: string) {
    this.baseRequestOptions = configureRequestOptionsFromUrl(packageInfo.file, {})
  }

  private createRequestOptions(method: "head" | "get" = "get"): RequestOptions {
    return {
      ...this.baseRequestOptions,
      method,
      headers: {
        ...this.requestHeaders,
        Accept: "*/*",
      } as any,
    }
  }

  async download() {
    const entries = await this.readCentralDirectory()
    await this.computeDifference(entries)
  }

  private async readCentralDirectory() {
    // eocdrWithoutCommentSize, we assume that zip file must not have comment
    const bufferSize = eocdrWithoutCommentSize
    const buffer = await this.readRemoteBytes(this.packageInfo.size - bufferSize, bufferSize)

    const zipReader = readCentralDirectoryEntry(buffer)
    const centralDirectoryBuffer = await this.readRemoteBytes(zipReader.centralDirectoryOffset, zipReader.centralDirectorySize)
    const entries = zipReader.readEntries(await this.readRemoteBytes(zipReader.centralDirectoryOffset, zipReader.centralDirectorySize))
    this.centralDirectoryBuffer = Buffer.concat([buffer, centralDirectoryBuffer])
    return entries
  }

  private async computeDifference(newEntries: Array<Entry>) {
    const oldZip = await openZip(this.oldPackageFile)
    const oldEntries = await oldZip.readEntries()

    const oldEntryMap = buildEntryMap(oldEntries)
    const oldBlockMapEntry = getBlockMapEntry(oldEntryMap)

    const newEntryMap = buildEntryMap(newEntries)
    const newBlockMapEntry = getBlockMapEntry(newEntryMap)

    const oldBlockMap = await readBlockMap(await oldZip.readEntryData(oldBlockMapEntry))

    // we append blockMapBuffer to result file as is, so, read not only entry data, but entry header also
    const headerSize = newBlockMapEntry.dataStart - newBlockMapEntry.offset
    this.blockMapBuffer = await this.readRemoteBytes(newBlockMapEntry.offset, headerSize + newBlockMapEntry.compressedSize)
    const newBlockMap = await readBlockMap(this.blockMapBuffer.slice(headerSize))

    // we don't check other metadata like compressionMethod - generic check that it is make sense to differentially update is suitable for it
    if (oldBlockMap.hashMethod !== newBlockMap.hashMethod) {
      throw new Error(`hashMethod is different (${oldBlockMap.hashMethod} - ${newBlockMap.hashMethod}), full download is required`)
    }
    if (oldBlockMap.blockSize !== newBlockMap.blockSize) {
      throw new Error(`blockSize is different (${oldBlockMap.blockSize} - ${newBlockMap.blockSize}), full download is required`)
    }

    const operations = this.computeOperations(newEntries, oldEntryMap, oldBlockMap, newBlockMap)
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
    if ((downloadSize + copySize + this.blockMapBuffer.length + this.centralDirectoryBuffer.length) !== newPackageSize) {
      throw new Error(`Internal error, size mismatch: downloadSize: ${downloadSize}, copySize: ${copySize}, newPackageSize: ${newPackageSize}`)
    }

    this.logger.info(`Full: ${formatBytes(newPackageSize)}, To download: ${formatBytes(downloadSize)} (${formatBytes(((newPackageSize - downloadSize) / newPackageSize) * 100, "%")})`)

    await this.downloadFile(operations)
  }

  private async downloadFile(operations: Array<Operation>) {
    const oldFileFd = await open(this.oldPackageFile, "r")
    await new BluebirdPromise((resolve, reject) => {
      const streams: Array<any> = []
      streams.push(new DigestTransform(this.packageInfo.sha512, "sha512", "base64"))

      const fileOut = createWriteStream(this.packagePath)
      fileOut.on("finish", () => {
        (fileOut.close as any)(resolve)
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

      const w = (index: number) => {
        if (index >= operations.length) {
          fileOut.write(this.blockMapBuffer, () => {
            fileOut.end(this.centralDirectoryBuffer)
          })
          return
        }

        const operation = operations[index++]

        if (operation.kind === OperationKind.COPY) {
          const readStream = createReadStream(this.oldPackageFile, {
            fd: oldFileFd,
            autoClose: false,
            start: operation.start,
            end: operation.end,
          })
          readStream.on("error", reject)
          readStream.once("end", () => w(index))
          readStream.pipe(streams[0], {
            end: false
          })
        }
        else {
          // https://github.com/electron-userland/electron-builder/issues/1523#issuecomment-327084661
          // todo to reduce http requests we need to consolidate non sequential download operations (Multipart ranges)
          const requestOptions = this.createRequestOptions("get")
          requestOptions.headers!!.Range = `bytes=${operation.start}-${operation.end}`
          const request = this.httpExecutor.doRequest(requestOptions, response => {
            // Electron net handles redirects automatically, our NodeJS test server doesn't use redirects - so, we don't check 3xx codes.
            if (response.statusCode >= 400) {
              reject(new HttpError(response))
            }

            response.pipe(streams[0], {
              end: false
            })
            response.once("end", () => w(index))
          })
          this.httpExecutor.addErrorAndTimeoutHandlers(request, reject)
          request.end()
        }
      }

      w(0)
    })
      .finally(() => close(oldFileFd))
  }

  private computeOperations(newEntries: Array<Entry>, oldEntryMap: Map<string, Entry>, oldBlockMap: BlockMap, newBlockMap: BlockMap) {
    const nameToOldBlocks = buildBlockFileMap(oldBlockMap.files)
    const nameToNewBlocks = buildBlockFileMap(newBlockMap.files)

    // convert kb to bytes
    const blockSize = newBlockMap.blockSize * 1024

    const operations: Array<Operation> = []
    for (const entry of newEntries) {
      if (entry.fileName === BLOCK_MAP_FILE_NAME) {
        continue
      }

      // for new empty file we can avoid HTTP request (construct entry manually), but as it is a rare case, we avoid code complication and handle it as for a new file
      const oldEntry = entry.compressedSize === 0 ? null : oldEntryMap.get(entry.fileName)
      if (oldEntry == null || oldEntry.compressedSize === 0 /* new file is not empty, but old is empty - no need to check block map, just download the whole new entry */) {
        // new file
        operations.push({
          kind: OperationKind.DOWNLOAD,
          start: entry.offset,
          end: entry.dataEnd,
        })
        continue
      }

      let lastOperation: Operation | null = null
      // const operationCountBeforeFile = operations.length

      const newFile = nameToNewBlocks.get(entry.fileName)!!
      const oldFile = nameToOldBlocks.get(entry.fileName)!!

      let changedBlockCount = 0

      blockMapLoop:
      for (let i = 0; i < newFile.blocks.length; i++) {
        if (i >= oldFile.blocks.length) {
          break
        }

        const isFirstBlock = i === 0
        const isLastBlock = i === (newFile.blocks.length - 1)
        const currentBlockSize = isLastBlock ? (newFile.size % blockSize) : blockSize

        if (oldFile.blocks[i] === newFile.blocks[i]) {
          if (lastOperation == null || lastOperation.kind !== OperationKind.COPY) {
            const start = isFirstBlock ? oldEntry.offset : (oldEntry.dataStart + (i * blockSize))
            let end = start + currentBlockSize
            if (isFirstBlock) {
              end += (oldEntry.dataStart - oldEntry.offset)

              if (operations.length > 0) {
                const prevOperation = operations[operations.length - 1]
                if (prevOperation.kind === OperationKind.COPY && prevOperation.end === start) {
                  lastOperation = prevOperation
                  prevOperation.end = end
                  continue blockMapLoop
                }
              }
            }

            lastOperation = {
              kind: OperationKind.COPY,
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
          changedBlockCount++

          const start = isFirstBlock ? entry.offset : (entry.dataStart + (i * blockSize))
          let end = start + currentBlockSize
          if (isFirstBlock) {
            end += (oldEntry.dataStart - oldEntry.offset)
          }

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
      }

      if (changedBlockCount > 0) {
        this.logger.info(`File ${entry.fileName} has ${changedBlockCount} changed blocks`)
      }
    }
    return operations
  }

  private async readRemoteBytes(offset: number, length: number) {
    const buffer = Buffer.allocUnsafe(length)
    const requestOptions = this.createRequestOptions("get")
    requestOptions.headers!!.Range = `bytes=${offset}-${offset + length}`
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

function getBlockMapEntry(map: Map<string, Entry>) {
  const result = map.get(BLOCK_MAP_FILE_NAME)
  if (result == null) {
    throw new Error("Current package doesn't have blockMap.yml")
  }
  return result
}

function buildEntryMap(list: Array<Entry>) {
  const result = new Map<string, Entry>()
  for (const item of list) {
    result.set(item.fileName, item)
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