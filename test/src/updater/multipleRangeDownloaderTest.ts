import { executeTasksUsingMultipleRangeRequests } from "electron-updater/src/differentialDownloader/multipleRangeDownloader"
import { DataSplitter } from "electron-updater/src/differentialDownloader/DataSplitter"
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

describe("DataSplitter", () => {
  test("handles a multipart header terminator split across chunks", async () => {
    const output: Buffer[] = []
    const out = new Writable({
      write: (chunk, _encoding, callback) => {
        output.push(Buffer.from(chunk))
        callback()
      },
    })
    let finishCount = 0
    const splitter = new DataSplitter(
      out,
      {
        oldFileFd: -1,
        tasks: [{ kind: OperationKind.DOWNLOAD, start: 0, end: 3 }],
        start: 0,
        end: 1,
      },
      new Map([[0, 0]]),
      "boundary",
      [3],
      () => finishCount++,
      3
    )

    const write = (chunk: string) =>
      new Promise<void>((resolve, reject) => {
        splitter.write(Buffer.from(chunk), error => (error == null ? resolve() : reject(error)))
      })

    await write("--boundary\r\nContent-Range: bytes 0-2/3\r\n\r")
    await write("\nabc\r\n--boundary--\r\n")

    expect(Buffer.concat(output).toString()).toBe("abc")
    expect(finishCount).toBe(1)
  })

  test("acknowledges trailing writes after completion", () => {
    const splitter = new DataSplitter(new Writable(), { oldFileFd: -1, tasks: [], start: 0, end: 0 }, new Map(), "boundary", [], () => {}, 0)
    splitter.partIndex = 0
    let callbackCalled = false

    splitter._write(Buffer.from("trailing"), "buffer", error => {
      expect(error).toBeUndefined()
      callbackCalled = true
    })

    expect(callbackCalled).toBe(true)
  })
})
