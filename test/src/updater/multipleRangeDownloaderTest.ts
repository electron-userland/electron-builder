import { CancellationToken } from "builder-util-runtime"
import {
  computeBatchEnd,
  ERR_MULTIPLE_RANGES_NOT_SUPPORTED,
  executeTasksUsingMultipleRangeRequests,
  MAX_RANGES_PER_REQUEST,
  MAX_TASKS_PER_REQUEST,
} from "electron-updater/src/differentialDownloader/multipleRangeDownloader"
import { DataSplitter, parseMultipartBoundary } from "electron-updater/src/differentialDownloader/DataSplitter"
import { OperationKind } from "electron-updater/src/differentialDownloader/downloadPlanBuilder"
import { PassThrough, Writable } from "stream"
import * as fs from "fs"
import * as path from "path"
import { describe, expect, test } from "vitest"
import type { DifferentialDownloader } from "electron-updater/src/differentialDownloader/DifferentialDownloader"
import type { Operation } from "electron-updater/src/differentialDownloader/downloadPlanBuilder"

function createFakeDifferentialDownloader(response: PassThrough): DifferentialDownloader {
  const createRequest = (_options: unknown, callback: (response: unknown) => void) => ({
    end: () => callback(response),
    abort: () => {},
  })
  return {
    options: { cancellationToken: new CancellationToken() },
    logger: null,
    createRequestOptions: () => ({ headers: {} }),
    createRangeRequest: createRequest,
    httpExecutor: {
      createRequest,
      addErrorAndTimeoutHandlers: () => {},
      addRedirectHandlers: () => {},
    },
  } as unknown as DifferentialDownloader
}

const D = (start: number, end: number): Operation => ({ kind: OperationKind.DOWNLOAD, start, end })
const C = (start: number, end: number): Operation => ({ kind: OperationKind.COPY, start, end })

/**
 * A fake range server: answers every request with a `multipart/byteranges` body (or a single part) cut
 * from `remote`, exactly as the range server in test/src/helpers/launchAppCrossPlatform.ts does, and
 * records the `Range` header of every request.
 */
function createFakeRangeServer(remote: Buffer): { downloader: DifferentialDownloader; rangeHeaders: Array<string> } {
  const rangeHeaders: Array<string> = []
  const boundary = "gc0p4Jq0M2Yt08jU534c0p"
  const createRequest = (options: { headers: Record<string, string> }, callback: (response: unknown) => void) => ({
    end: () => {
      const rangeHeader = options.headers.range
      rangeHeaders.push(rangeHeader)
      const ranges = rangeHeader
        .substring("bytes=".length)
        .split(",")
        .map(it => it.trim().split("-").map(Number))
      const response = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string> }
      response.statusCode = 206
      if (ranges.length === 1) {
        response.headers = { "content-type": "application/octet-stream" }
        callback(response)
        response.end(remote.subarray(ranges[0][0], ranges[0][1] + 1))
        return
      }
      response.headers = { "content-type": `multipart/byteranges; boundary=${boundary}` }
      callback(response)
      ranges.forEach(([start, end], i) => {
        response.write(`${i === 0 ? "" : "\r\n"}--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes ${start}-${end}/${remote.length}\r\n\r\n`)
        response.write(remote.subarray(start, end + 1))
      })
      response.end(`\r\n--${boundary}--\r\n`)
    },
    abort: () => {},
  })
  const downloader = {
    options: { cancellationToken: new CancellationToken() },
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    createRequestOptions: () => ({ headers: {} }),
    createRangeRequest: createRequest,
    httpExecutor: {
      createRequest,
      addErrorAndTimeoutHandlers: () => {},
      addRedirectHandlers: () => {},
    },
  } as unknown as DifferentialDownloader
  return { downloader, rangeHeaders }
}

function collect(): { out: Writable; done: Promise<Buffer> } {
  const chunks: Array<Buffer> = []
  let resolveDone: (b: Buffer) => void
  const done = new Promise<Buffer>(resolve => (resolveDone = resolve))
  const out = new Writable({
    write: (chunk, _encoding, callback) => {
      chunks.push(Buffer.from(chunk))
      callback()
    },
    final: callback => {
      resolveDone(Buffer.concat(chunks))
      callback()
    },
  })
  return { out, done }
}

describe("computeBatchEnd", () => {
  test("caps the number of DOWNLOAD ranges per request at 200", () => {
    expect(MAX_RANGES_PER_REQUEST).toBe(200)
    const tasks: Array<Operation> = []
    for (let i = 0; i < 450; i++) {
      tasks.push(D(i * 10, i * 10 + 10))
    }
    const batches: Array<[number, number]> = []
    for (let start = 0; start < tasks.length;) {
      const end = computeBatchEnd(tasks, start)
      batches.push([start, end])
      start = end
    }
    expect(batches).toEqual([
      [0, 200],
      [200, 400],
      [400, 450],
    ])
  })

  test("COPY operations do not count towards the range cap but towards the task cap", () => {
    // alternating COPY/DOWNLOAD: 1000 tasks hold 500 ranges → cut after the 200th DOWNLOAD
    const tasks: Array<Operation> = []
    for (let i = 0; i < 1000; i++) {
      tasks.push(i % 2 === 0 ? C(i * 10, i * 10 + 10) : D(i * 10, i * 10 + 10))
    }
    // task 399 is the 200th DOWNLOAD; the COPY at 400 stays in the batch, the DOWNLOAD at 401 starts the next
    expect(computeBatchEnd(tasks, 0)).toBe(401)
    expect(computeBatchEnd(tasks, 401)).toBe(801)
    expect(computeBatchEnd(tasks, 801)).toBe(1000)

    const copies: Array<Operation> = []
    for (let i = 0; i < 2500; i++) {
      copies.push(C(i, i + 1))
    }
    expect(MAX_TASKS_PER_REQUEST).toBe(1000)
    expect(computeBatchEnd(copies, 0)).toBe(1000)
    expect(computeBatchEnd(copies, 2400)).toBe(2500)
  })

  test("custom limits", () => {
    const tasks = [D(0, 1), C(1, 2), D(2, 3), D(3, 4), C(4, 5)]
    expect(computeBatchEnd(tasks, 0, 2, 100)).toBe(3)
    expect(computeBatchEnd(tasks, 3, 2, 100)).toBe(5)
    expect(computeBatchEnd(tasks, 0, 100, 2)).toBe(2)
    expect(computeBatchEnd(tasks, 0, 1, 100)).toBe(2)
    expect(computeBatchEnd([], 0)).toBe(0)
  })
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

  test("rejects a 206 whose long Content-Type names no boundary without backtracking over it", () => {
    const tasks: Array<Operation> = [D(0, 10), D(20, 30)]
    const out = new Writable({
      write: (_chunk, _encoding, callback) => callback(),
    })
    const response = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string> }
    response.statusCode = 206
    // a whitespace run followed by a non-space character (Electron trims only trailing whitespace); Electron's net accepts
    // response headers of about 256 KB
    response.headers = { "content-type": `multipart/x${" ".repeat(100_000)}x` }

    const errors: Array<Error & { code?: string }> = []
    const start = performance.now()
    executeTasksUsingMultipleRangeRequests(createFakeDifferentialDownloader(response), tasks, out, 0, e => errors.push(e))(0)
    expect(performance.now() - start).toBeLessThan(3000)
    expect(errors.map(it => it.code)).toEqual([ERR_MULTIPLE_RANGES_NOT_SUPPORTED])
    // the error message quotes only the first 200 characters of the header
    expect(errors.map(it => it.message)).toEqual([`Server does not support multiple ranges in one request (status 206, Content-Type "multipart/x${" ".repeat(189)}")`])
  })

  test("splits a plan with more than 200 ranges into several multipart requests and assembles the file", async ({ tmpDir }) => {
    const blockSize = 16
    const blockCount = 450
    // old file: 450 blocks; new file: every odd block replaced → 225 DOWNLOAD ranges alternating with COPYs
    const oldFile = Buffer.alloc(blockSize * blockCount)
    const newFile = Buffer.alloc(blockSize * blockCount)
    const tasks: Array<Operation> = []
    for (let i = 0; i < blockCount; i++) {
      const start = i * blockSize
      oldFile.fill(i & 0xff, start, start + blockSize)
      if (i % 2 === 1) {
        newFile.fill(0xff - (i & 0xff), start, start + blockSize)
        tasks.push(D(start, start + blockSize))
      } else {
        newFile.fill(i & 0xff, start, start + blockSize)
        tasks.push(C(start, start + blockSize))
      }
    }
    const dir = await tmpDir.getTempDir({ prefix: "multi-range" })
    fs.mkdirSync(dir, { recursive: true })
    const oldPath = path.join(dir, "old.bin")
    fs.writeFileSync(oldPath, oldFile)
    const oldFileFd = fs.openSync(oldPath, "r")
    try {
      const { downloader, rangeHeaders } = createFakeRangeServer(newFile)
      const { out, done } = collect()
      const failure = new Promise<never>((_resolve, reject) => {
        const w = executeTasksUsingMultipleRangeRequests(downloader, tasks, out, oldFileFd, reject)
        w(0)
      })
      const assembled = await Promise.race([done, failure])
      expect(assembled.equals(newFile)).toBe(true)

      // 225 ranges → 200 + 25
      expect(rangeHeaders).toHaveLength(2)
      const rangeCounts = rangeHeaders.map(it => it.split(",").length)
      expect(rangeCounts).toEqual([200, 25])
      for (const header of rangeHeaders) {
        expect(header.startsWith("bytes=")).toBe(true)
        expect(header.length).toBeLessThan(8 * 1024)
      }
    } finally {
      fs.closeSync(oldFileFd)
    }
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

describe("parseMultipartBoundary", () => {
  test("returns the boundary of a multipart Content-Type", () => {
    expect(parseMultipartBoundary("multipart/byteranges; boundary=3d6b6a416f9b5")).toBe("3d6b6a416f9b5")
    expect(parseMultipartBoundary('Multipart/ByteRanges;BOUNDARY="a b"')).toBe("a b")
    expect(parseMultipartBoundary("multipart/byteranges; boundary=abc ")).toBe("abc")
    expect(parseMultipartBoundary("multipart/byteranges; charset=x; boundary=abc")).toBe("abc")
    expect(parseMultipartBoundary("multipart/byteranges; boundary=abc; x=y")).toBe("abc")
    expect(parseMultipartBoundary(`multipart/byteranges; boundary=${"b".repeat(70)}`)).toBe("b".repeat(70))
    expect(parseMultipartBoundary(`multipart/byteranges; boundary="${"b".repeat(70)}"`)).toBe("b".repeat(70))
  })

  test("returns null when the type is not multipart or names no valid boundary", () => {
    for (const contentType of [
      null,
      undefined,
      "",
      "application/zip",
      "application/zip; boundary=abc",
      "multipart/",
      "multipart/; boundary=abc",
      "multipart/byteranges",
      "multipart/byteranges; boundary=",
      'multipart/byteranges; boundary=""',
      "multipart/byteranges; boundary=a b",
      'multipart/byteranges; boundary="abc',
      'multipart/byteranges; boundary="a"b"',
      // RFC 2046 limits a boundary to 70 characters
      `multipart/byteranges; boundary=${"b".repeat(71)}`,
      `multipart/byteranges; boundary="${"b".repeat(71)}"`,
    ]) {
      expect(parseMultipartBoundary(contentType)).toBeNull()
    }
  })

  test("takes linear time on a long whitespace run", () => {
    for (const whitespace of [" ", "\t"]) {
      const start = performance.now()
      expect(parseMultipartBoundary(`multipart/x${whitespace.repeat(250_000)}x`)).toBeNull()
      expect(parseMultipartBoundary(`multipart/x;${whitespace.repeat(250_000)}boundary=${whitespace.repeat(250_000)}x`)).toBe("x")
      expect(performance.now() - start).toBeLessThan(3000)
    }
  })
})
