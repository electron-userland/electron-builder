import { executeTasksUsingMultipleRangeRequests } from "electron-updater/src/differentialDownloader/multipleRangeDownloader"
import { OperationKind } from "electron-updater/src/differentialDownloader/downloadPlanBuilder"
import { PassThrough, Writable } from "stream"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { DifferentialDownloader } from "electron-updater/src/differentialDownloader/DifferentialDownloader"
import type { Operation } from "electron-updater/src/differentialDownloader/downloadPlanBuilder"

function createFakeDifferentialDownloader(response: PassThrough, abort = () => {}): DifferentialDownloader {
  return {
    options: {},
    logger: null,
    createRequestOptions: () => ({ headers: {} }),
    httpExecutor: {
      createRequest: (_options: unknown, callback: (response: unknown) => void) => ({
        end: () => callback(response),
        abort,
      }),
      addErrorAndTimeoutHandlers: () => {},
    },
  } as unknown as DifferentialDownloader
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("executeTasksUsingMultipleRangeRequests", () => {
  test("rejects instead of emitting an unhandled error when the multipart range response fails mid-download", async () => {
    // two DOWNLOAD tasks force the multipart/byteranges branch (partCount > 1)
    const tasks: Array<Operation> = [
      { kind: OperationKind.DOWNLOAD, start: 0, end: 10 },
      { kind: OperationKind.DOWNLOAD, start: 20, end: 30 },
    ]
    const out = new Writable({
      write: (_chunk, _encoding, callback) => callback(),
    })
    const response = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string> }
    response.statusCode = 206
    response.headers = { "content-type": "multipart/byteranges; boundary=boundary" }

    const error = await new Promise<Error>(resolve => {
      const w = executeTasksUsingMultipleRangeRequests(createFakeDifferentialDownloader(response), tasks, out, 0, resolve)
      w(0)
      // simulate a network failure (e.g. sleep/wake, Wi-Fi roam) after part of the body arrived
      response.write("--boundary")
      setImmediate(() => response.emit("error", new Error("read ECONNRESET")))
    })
    expect(error.message).toBe("read ECONNRESET")
  })

  test("does not retain an abort timer after a successful multipart response", async () => {
    const tasks: Array<Operation> = [
      { kind: OperationKind.DOWNLOAD, start: 0, end: 3 },
      { kind: OperationKind.DOWNLOAD, start: 3, end: 6 },
    ]
    const output: Buffer[] = []
    const out = new Writable({
      write: (chunk, _encoding, callback) => {
        output.push(Buffer.from(chunk))
        callback()
      },
    })
    const response = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string> }
    response.statusCode = 206
    response.headers = { "content-type": "multipart/byteranges; boundary=boundary" }
    const abort = vi.fn()
    const timerHandle = {} as NodeJS.Timeout
    const timeout = vi.spyOn(globalThis, "setTimeout").mockReturnValue(timerHandle)
    const clearTimer = vi.spyOn(globalThis, "clearTimeout")

    await new Promise<void>((resolve, reject) => {
      const w = executeTasksUsingMultipleRangeRequests(createFakeDifferentialDownloader(response, abort), tasks, out, -1, reject)
      w(0)
      out.once("finish", resolve)
      out.once("error", reject)
      response.end("--boundary\r\nContent-Range: bytes 0-2/6\r\n\r\nabc\r\n--boundary\r\nContent-Range: bytes 3-5/6\r\n\r\ndef\r\n--boundary--\r\n")
    })

    expect(Buffer.concat(output).toString()).toBe("abcdef")
    const endTimerWasCreated = timeout.mock.calls.some(call => call[1] === 10000)
    if (endTimerWasCreated) {
      expect(clearTimer).toHaveBeenCalledWith(timerHandle)
    }
    expect(abort).not.toHaveBeenCalled()
  })

  test("rejects immediately when a multipart response is aborted", async () => {
    const tasks: Array<Operation> = [
      { kind: OperationKind.DOWNLOAD, start: 0, end: 3 },
      { kind: OperationKind.DOWNLOAD, start: 3, end: 6 },
    ]
    const response = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string> }
    response.statusCode = 206
    response.headers = { "content-type": "multipart/byteranges; boundary=boundary" }

    const error = await new Promise<Error>(resolve => {
      const w = executeTasksUsingMultipleRangeRequests(createFakeDifferentialDownloader(response), tasks, new Writable(), -1, resolve)
      w(0)
      response.emit("aborted")
    })

    expect(error.message).toBe("response has been aborted by the server")
  })
})
