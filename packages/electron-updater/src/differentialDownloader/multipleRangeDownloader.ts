import { createHttpError, safeGetHeader } from "builder-util-runtime"
import { IncomingMessage } from "http"
import { Writable } from "stream"
import { copyData, DataSplitter, PartListDataTask } from "./DataSplitter.js"
import { DifferentialDownloader } from "./DifferentialDownloader.js"
import { Operation, OperationKind } from "./downloadPlanBuilder.js"

/**
 * Maximum number of DOWNLOAD ranges packed into one `multipart/byteranges` request. Apache's `MaxRanges`
 * default is 200 (more → a plain 200 response with the whole file, which fails the multipart content-type
 * check), and at ~19 B per range more than ~400–500 ranges push the `Range` header alone past the 8 KB
 * request-header limits of nginx and Apache (HTTP 400). Both failures degrade to a full download.
 */
export const MAX_RANGES_PER_REQUEST = 200

/** Maximum number of operations (COPY + DOWNLOAD) handled by one request/batch. */
export const MAX_TASKS_PER_REQUEST = 1000

/**
 * Returns the exclusive end index of the batch starting at `start`: at most `maxTasks` operations and at
 * most `maxRanges` DOWNLOAD operations. COPY operations following the last DOWNLOAD of a batch stay in it
 * (they cost nothing on the wire), the batch is cut right before the DOWNLOAD that would exceed the cap.
 */
export function computeBatchEnd(tasks: Array<Operation>, start: number, maxRanges: number = MAX_RANGES_PER_REQUEST, maxTasks: number = MAX_TASKS_PER_REQUEST): number {
  const limit = Math.min(tasks.length, start + maxTasks)
  let rangeCount = 0
  let end = start
  while (end < limit) {
    if (tasks[end].kind === OperationKind.DOWNLOAD) {
      if (rangeCount >= maxRanges) {
        break
      }
      rangeCount++
    }
    end++
  }
  return end
}

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

    const nextOffset = computeBatchEnd(tasks, taskOffset)
    doExecuteTasks(
      differentialDownloader,
      {
        tasks,
        start: taskOffset,
        end: nextOffset,
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
  let grandTotalBytes = 0
  const partIndexToTaskIndex = new Map<number, number>()
  const partIndexToLength: Array<number> = []
  for (let i = options.start; i < options.end; i++) {
    const task = options.tasks[i]
    if (task.kind === OperationKind.DOWNLOAD) {
      ranges += `${task.start}-${task.end - 1}, `
      partIndexToTaskIndex.set(partCount, i)
      partCount++
      partIndexToLength.push(task.end - task.start)
      grandTotalBytes += task.end - task.start
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
          response.on("error", reject)

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
    response.on("error", reject)

    if (!checkIsRangesSupported(response, reject)) {
      return
    }

    const contentType = safeGetHeader(response, "content-type")
    const m = /^multipart\/.+?\s*;\s*boundary=(?:"([^"]+)"|([^\s";]+))\s*$/i.exec(contentType)
    if (m == null) {
      reject(new Error(`Content-Type "multipart/byteranges" is expected, but got "${contentType}"`))
      return
    }

    // The watchdog below only exists for a response that ends before every part was handled. It must not outlive a
    // successful batch: the next batch reuses the same `reject`, so a stale watchdog used to fail any multi-batch
    // download whose later batches took longer than the grace period.
    let isBatchFinished = false
    let watchdog: ReturnType<typeof setTimeout> | null = null
    const onBatchFinished = (): void => {
      isBatchFinished = true
      if (watchdog != null) {
        clearTimeout(watchdog)
        watchdog = null
      }
      resolve()
    }

    const dicer = new DataSplitter(
      out,
      options,
      partIndexToTaskIndex,
      m[1] || m[2],
      partIndexToLength,
      onBatchFinished,
      grandTotalBytes,
      differentialDownloader.options.onProgress,
      differentialDownloader.logger
    )
    dicer.on("error", reject)
    response.pipe(dicer)

    response.on("end", () => {
      if (isBatchFinished) {
        return
      }
      watchdog = setTimeout(() => {
        watchdog = null
        if (isBatchFinished) {
          return
        }
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
