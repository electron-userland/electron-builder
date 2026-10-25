import { createHttpError, HttpExecutor, safeGetHeader } from "builder-util-runtime"
import { IncomingMessage, RequestOptions } from "http"
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

            if (!checkIsRangesSupported(response, reject)) {
              return
            }

            response.pipe(out, {
              end: false,
            })
            response.once("end", () => w(index))
          },
          reject
        )
      }
    }

    w(options.start)
    return
  }

  const onResponse = (response: IncomingMessage, request: AbortableRequest): void => {
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

    const dicer = new DataSplitter(out, options, partIndexToTaskIndex, m[1] || m[2], partIndexToLength, onBatchFinished, grandTotalBytes, differentialDownloader.options.onProgress)
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
  requestRange(differentialDownloader, { options: differentialDownloader.createRequestOptions() }, ranges.substring(0, ranges.length - 2), onResponse, reject)
}

// the redirect limit of HttpExecutor
const MAX_REDIRECTS = 10

/** Where a range is requested: the update URL, or the redirect target once a request to it was redirected. */
export interface RangeRequestTarget {
  options: RequestOptions
}

export interface AbortableRequest {
  abort(): void
}

/**
 * Requests `range` (a `Range` header value) from `target`, whose options ask for manual redirects (see
 * DifferentialDownloader.createRequestOptions), so Electron's net reports a redirect as an event instead of following it with
 * every header. Like ElectronHttpExecutor, the redirected request is aborted and sent again to the redirect target, without the
 * credential headers when the target is on another origin (HttpExecutor.prepareRedirectUrlOptions), up to 10 redirects.
 * The redirect target becomes the `target`, so a caller that passes the same `target` again requests the next range from the
 * redirect target. `onResponse` gets the request that was answered.
 */
export function requestRange(
  differentialDownloader: DifferentialDownloader,
  target: RangeRequestTarget,
  range: string,
  onResponse: (response: IncomingMessage, request: AbortableRequest) => void,
  reject: (error: Error) => void
): void {
  const { httpExecutor } = differentialDownloader
  const send = (requestOptions: RequestOptions, redirectCount: number): void => {
    const request = httpExecutor.createRequest(requestOptions, (response: IncomingMessage) => onResponse(response, request))
    // an event listener: whatever goes wrong is passed to reject, a throw would escape as an uncaught exception
    request.on("redirect", (_statusCode: number, _method: string, redirectUrl: string) => {
      // no way to modify request options (followRedirect() would resend every header), abort old and make a new one
      request.abort()
      if (redirectCount >= MAX_REDIRECTS) {
        reject(new Error(`Too many redirects (> ${MAX_REDIRECTS})`))
        return
      }
      try {
        const redirectOptions = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, requestOptions)
        // Electron's net.request throws for another protocol, where Electron following the redirect itself fails the request
        if (redirectOptions.protocol !== "http:" && redirectOptions.protocol !== "https:") {
          throw new Error(`Cannot follow the redirect to the "${redirectOptions.protocol ?? ""}" protocol`)
        }
        logRedirect(differentialDownloader, redirectOptions)
        target.options = redirectOptions
        send(redirectOptions, redirectCount + 1)
      } catch (e: unknown) {
        reject(e instanceof Error ? e : new Error(`Cannot follow the redirect: ${String(e)}`))
      }
    })
    httpExecutor.addErrorAndTimeoutHandlers(request, reject)
    request.end()
  }
  send({ ...target.options, headers: { ...target.options.headers, range } }, 0)
}

function logRedirect(differentialDownloader: DifferentialDownloader, redirectOptions: RequestOptions): void {
  try {
    differentialDownloader.options.logger.info(`Redirect to ${urlWithoutQuery(redirectOptions)}`)
  } catch (_ignored) {
    // a failing logger must not fail the download
  }
}

// the query of a redirect target (a pre-signed URL) can hold a signature, and the user info is not in the options
function urlWithoutQuery(options: RequestOptions): string {
  const port = options.port == null ? "" : `:${options.port}`
  const path = options.path ?? "/"
  const queryIndex = path.indexOf("?")
  return `${options.protocol ?? "https:"}//${options.hostname ?? ""}${port}${queryIndex < 0 ? path : path.substring(0, queryIndex)}`
}

export function checkIsRangesSupported(response: IncomingMessage, reject: (error: Error) => void): boolean {
  // requestRange follows redirects (Electron reports them as events), so a 3xx is not expected here
  const { statusCode } = response
  if (typeof statusCode === "number" && statusCode >= 400) {
    reject(createHttpError(response))
    return false
  }

  if (statusCode !== 206) {
    const acceptRanges = safeGetHeader(response, "accept-ranges")
    if (acceptRanges == null || acceptRanges === "none") {
      reject(new Error(`Server doesn't support Accept-Ranges (response code ${statusCode})`))
      return false
    }
  }
  return true
}
