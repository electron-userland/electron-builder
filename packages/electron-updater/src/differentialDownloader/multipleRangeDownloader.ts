import { createHttpError, safeGetHeader } from "builder-util-runtime"
import { IncomingMessage } from "http"
import { Writable } from "stream"
import { copyData, DataSplitter, PartListDataTask } from "./DataSplitter"
import { DifferentialDownloader } from "./DifferentialDownloader"
import { Operation, OperationKind } from "./downloadPlanBuilder"

export function executeTasksUsingMultipleRangeRequests(
  differentialDownloader: DifferentialDownloader,
  tasks: Array<Operation>,
  out: Writable,
  oldFileFd: number,
  reject: (error: Error) => void
): (taskOffset: number) => void {
  const w = (taskOffset: number): void => {
    if (taskOffset >= tasks.length) {
      if (differentialDownloader.fileMetadataBuffer != null) {
        out.write(differentialDownloader.fileMetadataBuffer)
      }
      out.end()
      return
    }

    const nextOffset = taskOffset + 1000
    doExecuteTasks(
      differentialDownloader,
      {
        tasks,
        start: taskOffset,
        end: Math.min(tasks.length, nextOffset),
        oldFileFd,
      },
      out,
      () => w(nextOffset),
      reject
    )
  }
  return w
}

function doExecuteTasks(differentialDownloader: DifferentialDownloader, options: PartListDataTask, out: Writable, resolve: () => void, reject: (error: Error) => void): void {
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
    const w = (index: number): void => {
      if (index >= options.end) {
        resolve()
        return
      }

      const task = options.tasks[index++]

      if (task.kind === OperationKind.COPY) {
        copyData(task, out, options.oldFileFd, reject, () => w(index))
      } else {
        const requestOptions = differentialDownloader.createRequestOptions()
        requestOptions.headers!.Range = `bytes=${task.start}-${task.end - 1}`
        const request = differentialDownloader.httpExecutor.createRequest(requestOptions, response => {
          if (!checkIsRangesSupported(response, reject)) {
            return
          }

          response.pipe(out, {
            end: false,
          })
          response.once("end", () => w(index))
        })
        differentialDownloader.httpExecutor.addErrorAndTimeoutHandlers(request, reject)
        request.end()
      }
    }

    w(options.start)
    return
  }

  const requestOptions = differentialDownloader.createRequestOptions()
  requestOptions.headers!.Range = ranges.substring(0, ranges.length - 2)
  const request = differentialDownloader.httpExecutor.createRequest(requestOptions, response => {
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

    response.on("end", () => {
      setTimeout(() => {
        request.abort()
        reject(new Error("Response ends without calling any handlers"))
      }, 10000)
    })
  })
  differentialDownloader.httpExecutor.addErrorAndTimeoutHandlers(request, reject)
  request.end()
}

export function checkIsRangesSupported(response: IncomingMessage, reject: (error: Error) => void): boolean {
  // Electron net handles redirects automatically, our NodeJS test server doesn't use redirects - so, we don't check 3xx codes.
  if (response.statusCode! >= 400) {
    reject(createHttpError(response))
    return false
  }

  if (response.statusCode !== 206) {
    const acceptRanges = safeGetHeader(response, "accept-ranges")
    if (acceptRanges == null || acceptRanges === "none") {
      reject(new Error(`Server doesn't support Accept-Ranges (response code ${response.statusCode})`))
      return false
    }
  }
  return true
}
