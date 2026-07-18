import { executeTasksUsingMultipleRangeRequests } from "electron-updater/src/differentialDownloader/multipleRangeDownloader"
import { OperationKind } from "electron-updater/src/differentialDownloader/downloadPlanBuilder"
import { PassThrough, Writable } from "stream"
import { describe, expect, test } from "vitest"
import type { DifferentialDownloader } from "electron-updater/src/differentialDownloader/DifferentialDownloader"
import type { Operation } from "electron-updater/src/differentialDownloader/downloadPlanBuilder"

function createFakeDifferentialDownloader(response: PassThrough): DifferentialDownloader {
  return {
    options: {},
    logger: null,
    createRequestOptions: () => ({ headers: {} }),
    httpExecutor: {
      createRequest: (_options: unknown, callback: (response: unknown) => void) => ({
        end: () => callback(response),
        abort: () => {},
      }),
      addErrorAndTimeoutHandlers: () => {},
    },
  } as unknown as DifferentialDownloader
}

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
})
