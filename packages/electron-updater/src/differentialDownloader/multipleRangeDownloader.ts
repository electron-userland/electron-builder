import { CancellationError, createHttpError, newError, safeGetHeader } from "builder-util-runtime"
import { IncomingMessage, RequestOptions } from "http"
import { Writable } from "stream"
import { copyData, DataSplitter, PartListDataTask } from "./DataSplitter.js"
import { DifferentialDownloader } from "./DifferentialDownloader.js"
import { Operation, OperationKind } from "./downloadPlanBuilder.js"

/** The server answered a multi-range request without a `multipart/byteranges` body: the download can be retried with one range per request. */
export const ERR_MULTIPLE_RANGES_NOT_SUPPORTED = "ERR_UPDATER_MULTIPLE_RANGES_NOT_SUPPORTED"

// 400 Bad Request (Google Cloud Storage: "Multiple ranges are not supported"), 416 Range Not Satisfiable, 501 Not Implemented (GitHub release assets)
const MULTIPLE_RANGES_REJECTED_STATUS_CODES = new Set([400, 416, 501])

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

// Each request starts at the update URL and follows its own redirects: a redirect target can be a pre-signed URL that
// expires before a later batch of a long download.
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
        requestRange(
          differentialDownloader,
          { options: differentialDownloader.createRequestOptions() },
          `bytes=${task.start}-${task.end - 1}`,
          response => {
            response.on("error", reject)

            if (!checkIsPartialContent(response, task.start, task.end - 1, reject)) {
              return
            }

            response.pipe(out, {
              end: false,
            })
            response.once("end", () => w(index))
          },
          reject,
          out
        )
      }
    }

    w(options.start)
    return
  }

  const onResponse = (response: IncomingMessage, request: AbortableRequest): void => {
    response.on("error", reject)

    // other errors (auth, missing file, server failure) are not about ranges: fail as before, without a range-by-range retry
    const { statusCode } = response
    if (typeof statusCode === "number" && statusCode >= 400 && !MULTIPLE_RANGES_REJECTED_STATUS_CODES.has(statusCode)) {
      response.destroy()
      reject(createHttpError(response))
      return
    }

    // Hosts that serve only one range per request answer a multi-range request with an error (GitHub release assets: 501,
    // GCS: 400), the whole file (S3: 200) or a single coalesced part. Stop reading and let the caller retry range by range.
    const contentType = safeGetHeader(response, "content-type")
    const m = statusCode === 206 ? /^multipart\/.+?\s*;\s*boundary=(?:"([^"]+)"|([^\s";]+))\s*$/i.exec(contentType) : null
    if (m == null) {
      response.destroy()
      request.abort()
      reject(newError(`Server does not support multiple ranges in one request (status ${statusCode}, Content-Type "${contentType}")`, ERR_MULTIPLE_RANGES_NOT_SUPPORTED))
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
  }
  requestRange(differentialDownloader, { options: differentialDownloader.createRequestOptions() }, ranges.substring(0, ranges.length - 2), onResponse, reject, out)
}

/** Where a range is requested: the update URL, or the redirect target once a request to it was redirected. */
export interface RangeRequestTarget {
  options: RequestOptions
}

export interface AbortableRequest {
  abort(): void
}

/**
 * Requests `range` (a `Range` header value) from `target`, whose options ask for manual redirects (see
 * DifferentialDownloader.createRequestOptions). The executor's redirect handler aborts a redirected request and it is sent
 * again to the redirect target, without the credential headers when the target is on another origin, up to the executor's
 * redirect limit. The redirect target becomes the `target`, so a caller that passes the same `target` again requests the next
 * range from the redirect target. `onResponse` gets the request that was answered.
 *
 * Every request, a redirected one included, is created with DifferentialDownloader.createRangeRequest, so a cancel aborts it.
 * No request is sent once the download stopped (cancelled, or failed and destroyed `out`): it would outlive the download.
 */
export function requestRange(
  differentialDownloader: DifferentialDownloader,
  target: RangeRequestTarget,
  range: string,
  onResponse: (response: IncomingMessage, request: AbortableRequest) => void,
  reject: (error: Error) => void,
  out?: Writable
): void {
  const { httpExecutor } = differentialDownloader
  const send = (requestOptions: RequestOptions, redirectCount: number): void => {
    if (differentialDownloader.options.cancellationToken.cancelled) {
      reject(new CancellationError())
      return
    }
    if (out?.destroyed === true) {
      reject(new Error("Cannot request a range: the output stream is destroyed"))
      return
    }
    const request = differentialDownloader.createRangeRequest(requestOptions, (response: IncomingMessage) => onResponse(response, request))
    httpExecutor.addErrorAndTimeoutHandlers(request, reject)
    httpExecutor.addRedirectHandlers(request, requestOptions, reject, redirectCount, redirectOptions => {
      differentialDownloader.logger.info(`Redirect to ${urlWithoutQuery(redirectOptions)}`)
      target.options = redirectOptions
      send(redirectOptions, redirectCount + 1)
    })
    request.end()
  }
  send({ ...target.options, headers: { ...target.options.headers, range } }, 0)
}

// the query of a redirect target (a pre-signed URL) can hold a signature, and the user info is not in the options
function urlWithoutQuery(options: RequestOptions): string {
  const port = options.port == null ? "" : `:${options.port}`
  const path = options.path ?? "/"
  const queryIndex = path.indexOf("?")
  return `${options.protocol ?? "https:"}//${options.hostname ?? ""}${port}${queryIndex < 0 ? path : path.substring(0, queryIndex)}`
}

/**
 * Accepts only a 206 answer for exactly `bytes=start-endInclusive`. `Accept-Ranges: bytes` is not evidence of range support
 * (CDNs send it with a 200 full body), and piping a 200 would stream the whole file once per range before the sha512 check
 * fails. A rejected response is destroyed, so nothing more is read from it.
 */
export function checkIsPartialContent(response: IncomingMessage, start: number, endInclusive: number, reject: (error: Error) => void): boolean {
  // requestRange follows redirects (Electron reports them as events); any other status but 206, a 3xx included, is rejected below
  const { statusCode } = response
  if (typeof statusCode === "number" && statusCode >= 400) {
    response.destroy()
    reject(createHttpError(response))
    return false
  }

  // range units compare case-insensitively (RFC 9110 section 14.1)
  const contentRange = safeGetHeader(response, "content-range")
  if (statusCode !== 206 || contentRange == null || !contentRange.toLowerCase().startsWith(`bytes ${start}-${endInclusive}/`)) {
    response.destroy()
    reject(
      newError(
        `Server did not return the requested range bytes=${start}-${endInclusive} (status ${statusCode}, Content-Range "${contentRange ?? ""}")`,
        "ERR_UPDATER_RANGE_NOT_SUPPORTED"
      )
    )
    return false
  }
  return true
}
