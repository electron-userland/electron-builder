import { CancellationToken } from "builder-util-runtime"
import { copyData, DataSplitter, PartListDataTask } from "electron-updater/src/differentialDownloader/DataSplitter"
import { Operation, OperationKind } from "electron-updater/src/differentialDownloader/downloadPlanBuilder"
import { executeTasksUsingMultipleRangeRequests } from "electron-updater/src/differentialDownloader/multipleRangeDownloader"
import fs, { closeSync, openSync, writeFileSync } from "fs"
import { createServer, IncomingMessage, request as httpRequest, RequestOptions, Server, ServerResponse } from "http"
import { AddressInfo } from "net"
import * as path from "path"
import { Writable } from "stream"
import type { TmpDir } from "temp-file"
import { afterEach, describe, expect, test, vi } from "vitest"

// Deterministic, non-repeating content so a misaligned part cannot accidentally produce the expected bytes.
function patternBuffer(size: number, seed: number): Buffer {
  const buffer = Buffer.alloc(size)
  let x = seed
  for (let i = 0; i < size; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    buffer[i] = x >> 16
  }
  return buffer
}

// Alternating DOWNLOAD / COPY operations covering [0, fileSize); sizes vary so parts do not line up with chunk sizes.
function makeTasks(count: number, fileSize: number): Array<Operation> {
  const tasks: Array<Operation> = []
  const step = Math.floor(fileSize / count)
  for (let i = 0; i < count; i++) {
    const start = i * step
    const end = i === count - 1 ? fileSize : start + step
    tasks.push({ kind: i % 2 === 0 ? OperationKind.DOWNLOAD : OperationKind.COPY, start, end })
  }
  return tasks
}

interface MultipartOptions {
  readonly eol: "\r\n" | "\n"
  readonly boundary: string
  readonly leadingEol: boolean
}

// Builds a multipart/byteranges body the way servers do: every part is "<EOL>--boundary<EOL>headers<EOL><EOL>data".
function multipartBody(ranges: Array<[number, number]>, newFile: Buffer, options: MultipartOptions): Buffer {
  const { eol, boundary } = options
  const chunks: Array<Buffer> = []
  ranges.forEach(([start, endInclusive], index) => {
    const lead = index === 0 && !options.leadingEol ? "" : eol
    chunks.push(Buffer.from(`${lead}--${boundary}${eol}Content-Type: application/octet-stream${eol}Content-Range: bytes ${start}-${endInclusive}/${newFile.length}${eol}${eol}`))
    chunks.push(newFile.subarray(start, endInclusive + 1))
  })
  chunks.push(Buffer.from(`${eol}--${boundary}--${eol}`))
  return Buffer.concat(chunks)
}

function collector(): { out: Writable; data: () => Buffer } {
  const received: Array<Buffer> = []
  const out = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      received.push(Buffer.from(chunk))
      callback()
    },
  })
  return { out, data: () => Buffer.concat(received) }
}

function expectedOutput(tasks: Array<Operation>, oldFile: Buffer, newFile: Buffer): Buffer {
  return Buffer.concat(tasks.map(task => (task.kind === OperationKind.COPY ? oldFile : newFile).subarray(task.start, task.end)))
}

describe("differential multipart download", () => {
  const fileSize = 8 * 1024
  const newFile = patternBuffer(fileSize, 1)
  const oldFile = patternBuffer(fileSize, 2)

  // Writes `content` into the test's own temp dir and opens it read-only; the caller is responsible for closing the fd.
  async function openOldFile(tmpDir: TmpDir, content: Buffer): Promise<number> {
    const oldFilePath = path.join(await tmpDir.createTempDir({ prefix: "differential-multipart" }), "old.bin")
    writeFileSync(oldFilePath, content)
    return openSync(oldFilePath, "r")
  }

  // Feeds `body` in `chunkSize` pieces and resolves once the splitter reports the batch finished.
  async function split(oldFileFd: number, tasks: Array<Operation>, body: Buffer, boundary: string, chunkSize: number): Promise<Buffer> {
    const options: PartListDataTask = { oldFileFd, tasks, start: 0, end: tasks.length }
    const partIndexToTaskIndex = new Map<number, number>()
    const partIndexToLength: Array<number> = []
    tasks.forEach((task, index) => {
      if (task.kind === OperationKind.DOWNLOAD) {
        partIndexToTaskIndex.set(partIndexToLength.length, index)
        partIndexToLength.push(task.end - task.start)
      }
    })

    const { out, data } = collector()
    let finishedCount = 0
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`splitter did not finish (chunk size ${chunkSize})`)), 5000)
      const splitter = new DataSplitter(
        out,
        options,
        partIndexToTaskIndex,
        boundary,
        partIndexToLength,
        () => {
          finishedCount++
          clearTimeout(timer)
          resolve()
        },
        0
      )
      splitter.on("error", error => {
        clearTimeout(timer)
        reject(error)
      })
      // A finished splitter deliberately stops accepting data, so write without waiting for the trailing callbacks.
      const writeFrom = (offset: number): void => {
        if (offset >= body.length || finishedCount > 0) {
          return
        }
        splitter.write(body.subarray(offset, offset + chunkSize), () => writeFrom(offset + chunkSize))
      }
      writeFrom(0)
    })
    expect(finishedCount).toBe(1)
    return data()
  }

  const chunkSizes = [1, 2, 3, 5, 7, 16, 64, 1000, Number.MAX_SAFE_INTEGER]
  const cases: Array<{ name: string; options: MultipartOptions }> = [
    { name: "CRLF without leading line break", options: { eol: "\r\n", boundary: "3d6b6a416f9b5", leadingEol: false } },
    { name: "CRLF with leading line break (nginx)", options: { eol: "\r\n", boundary: "00000000000000000001", leadingEol: true } },
    // Qiniu CDN: bare LF line endings, quoted boundary containing a space and a colon, body starting with a line break
    { name: "bare LF with leading line break (Qiniu)", options: { eol: "\n", boundary: "web cache:4af23fc9de0dc88ebd8552fbafe6f2a1", leadingEol: true } },
    { name: "bare LF without leading line break", options: { eol: "\n", boundary: "lf-boundary", leadingEol: false } },
  ]

  for (const { name, options } of cases) {
    test(`splits every part correctly: ${name}, any chunking`, async ({ expect, tmpDir }) => {
      const tasks = makeTasks(12, fileSize)
      const ranges = tasks.filter(task => task.kind === OperationKind.DOWNLOAD).map(task => [task.start, task.end - 1] as [number, number])
      const body = multipartBody(ranges, newFile, options)
      const expected = expectedOutput(tasks, oldFile, newFile)
      const oldFileFd = await openOldFile(tmpDir, oldFile)
      try {
        for (const chunkSize of chunkSizes) {
          const actual = await split(oldFileFd, tasks, body, options.boundary, chunkSize)
          expect(actual.equals(expected), `${name}, chunk size ${chunkSize}`).toBe(true)
        }
      } finally {
        closeSync(oldFileFd)
      }
    })
  }

  // A copy runs after a part or a request ended, by which time a failure or a cancel may have destroyed the output and the
  // downloader may be closing the old file: the copy must not start reading it.
  test("a copy into a destroyed output stream does not read the old file and fails", async ({ expect, tmpDir }) => {
    const oldFileFd = await openOldFile(tmpDir, oldFile)
    const createReadStreamSpy = vi.spyOn(fs, "createReadStream")
    const readSpy = vi.spyOn(fs, "read")
    try {
      const { out } = collector()
      out.destroy()
      const outcomes: Array<string> = []
      copyData(
        { kind: OperationKind.COPY, start: 0, end: 1024 },
        out,
        oldFileFd,
        error => outcomes.push(`rejected: ${error.message}`),
        () => outcomes.push("resolved")
      )
      // a read started anyway would have been issued by now
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(outcomes).toEqual(["rejected: Cannot copy data: the output stream is destroyed"])
      expect(createReadStreamSpy.mock.calls.filter(args => (args[1] as any)?.fd === oldFileFd)).toEqual([])
      expect(readSpy.mock.calls.filter(args => args[0] === oldFileFd)).toEqual([])
    } finally {
      createReadStreamSpy.mockRestore()
      readSpy.mockRestore()
      closeSync(oldFileFd)
    }
  })

  describe("multiple batches", () => {
    let server: Server | null = null

    afterEach(async () => {
      vi.useRealTimers()
      if (server != null) {
        server.closeAllConnections()
        await new Promise<void>(resolve => server!.close(() => resolve()))
        server = null
      }
    })

    // The watchdog armed when a batch response ends must not fail the download while a later batch is still running.
    test("a finished batch does not fail a slower next batch", async ({ expect, tmpDir }) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })

      // > 1000 operations => two range requests
      const tasks = makeTasks(1200, 1200 * 6)
      const bigNewFile = patternBuffer(1200 * 6, 3)
      const bigOldFile = patternBuffer(1200 * 6, 4)

      const boundary = "batch-boundary"
      const requests: Array<{ ranges: Array<[number, number]>; response: ServerResponse }> = []
      let onRequest: (() => void) | null = null
      server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const ranges = req.headers
          .range!.slice("bytes=".length)
          .split(", ")
          .map(range => range.split("-").map(Number) as [number, number])
        requests.push({ ranges, response: res })
        onRequest?.()
      })
      await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve))
      const port = (server.address() as AddressInfo).port

      const respond = (index: number): void => {
        const { ranges, response } = requests[index]
        response.writeHead(206, { "Content-Type": `multipart/byteranges; boundary=${boundary}` })
        response.end(multipartBody(ranges, bigNewFile, { eol: "\r\n", boundary, leadingEol: true }))
      }
      const waitForRequest = (count: number): Promise<void> =>
        new Promise(resolve => {
          const check = (): void => {
            if (requests.length >= count) {
              onRequest = null
              resolve()
            }
          }
          onRequest = check
          check()
        })

      const differentialDownloader: any = {
        fileMetadataBuffer: null,
        options: { onProgress: undefined, cancellationToken: new CancellationToken() },
        createRequestOptions: (): RequestOptions => ({ hostname: "127.0.0.1", port, path: "/new.bin", method: "GET", headers: {} }),
        createRangeRequest: (options: RequestOptions, callback: (response: IncomingMessage) => void) => httpRequest(options, callback),
        httpExecutor: {
          createRequest: (options: RequestOptions, callback: (response: IncomingMessage) => void) => httpRequest(options, callback),
          addErrorAndTimeoutHandlers: (request: any, reject: (error: Error) => void) => request.on("error", reject),
          // node:http answers a redirect with a 3xx response
          addRedirectHandlers: () => {},
        },
      }

      const bigOldFileFd = await openOldFile(tmpDir, bigOldFile)
      try {
        const { out, data } = collector()
        let failure: Error | null = null
        const finished = new Promise<void>(resolve => out.on("finish", resolve))
        executeTasksUsingMultipleRangeRequests(differentialDownloader, tasks, out, bigOldFileFd, error => {
          failure = error
        })(0)

        await waitForRequest(1)
        respond(0)
        // the second request is only sent after the first batch was fully handled
        await waitForRequest(2)

        // well past the 10s grace period of the first batch, while the second batch is still in flight
        await vi.advanceTimersByTimeAsync(11_000)
        expect(failure).toBeNull()

        respond(1)
        await finished
        expect(failure).toBeNull()
        expect(data().equals(expectedOutput(tasks, bigOldFile, bigNewFile))).toBe(true)
      } finally {
        closeSync(bigOldFileFd)
      }
    })
  })
})
