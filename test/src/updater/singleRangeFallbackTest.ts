import { CancellationToken, HttpExecutor } from "builder-util-runtime"
import { GenericDifferentialDownloader } from "electron-updater/src/differentialDownloader/GenericDifferentialDownloader"
import { createHash } from "crypto"
import { readFileSync, writeFileSync } from "fs"
import { ClientRequest, createServer, IncomingMessage, request as httpRequest, Server, ServerResponse } from "http"
import { AddressInfo } from "net"
import * as path from "path"
import { afterEach, describe, expect, test } from "vitest"
import { blockMap } from "../helpers/updaterTestUtil.js"

// Plain node:http, so the sandbox's HTTP_PROXY settings (honoured by NodeHttpExecutor) cannot route 127.0.0.1 through a proxy.
class LocalHttpExecutor extends HttpExecutor<ClientRequest> {
  createRequest(options: any, callback: (response: any) => void): ClientRequest {
    return httpRequest(options, callback)
  }
}

const BLOCK = 4096

function block(seed: number): Buffer {
  const buffer = Buffer.alloc(BLOCK)
  let x = seed
  for (let i = 0; i < BLOCK; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    buffer[i] = x >> 16
  }
  return buffer
}

// old = A X C Y, new = A B C D: the plan copies A and C and downloads B and D (two ranges, so a multi-range request)
const blocks = { A: block(1), B: block(2), C: block(3), D: block(4), X: block(5), Y: block(6) }
const oldContent = Buffer.concat([blocks.A, blocks.X, blocks.C, blocks.Y])
const newContent = Buffer.concat([blocks.A, blocks.B, blocks.C, blocks.D])
// the block names stand in for the checksums
function namedBlockMap(names: Array<string>) {
  return blockMap(names, new Array<number>(names.length).fill(BLOCK))
}

type HostBehaviour = "multipart" | "multi-501" | "multi-400" | "multi-200" | "multi-403" | "ignores-ranges" | "wrong-range" | "uppercase-unit"

function parseRanges(header: string): Array<[number, number]> {
  return header
    .slice("bytes=".length)
    .split(",")
    .map(range => range.trim().split("-").map(Number) as [number, number])
}

describe("differential download on hosts with limited range support", { concurrent: false }, () => {
  let server: Server | null = null
  let requests: Array<string> = []

  afterEach(async () => {
    if (server != null) {
      server.closeAllConnections()
      await new Promise<void>(resolve => server!.close(() => resolve()))
      server = null
    }
  })

  async function startHost(behaviour: HostBehaviour): Promise<URL> {
    requests = []
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const header = req.headers.range ?? ""
      requests.push(header)
      const ranges = parseRanges(header)
      const isMulti = ranges.length > 1
      const sendFull = () => {
        res.writeHead(200, { "Accept-Ranges": "bytes", "Content-Length": newContent.length })
        res.end(newContent)
      }
      if (behaviour === "ignores-ranges") {
        sendFull()
        return
      }
      if (isMulti && behaviour !== "multipart") {
        if (behaviour === "multi-200") {
          sendFull()
        } else {
          res.writeHead(behaviour === "multi-501" ? 501 : behaviour === "multi-403" ? 403 : 400)
          res.end("Multiple ranges are not supported")
        }
        return
      }
      if (isMulti) {
        const boundary = "test-boundary"
        const parts = ranges.map(([start, end]) =>
          Buffer.concat([
            Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes ${start}-${end}/${newContent.length}\r\n\r\n`),
            newContent.subarray(start, end + 1),
          ])
        )
        res.writeHead(206, { "Content-Type": `multipart/byteranges; boundary=${boundary}` })
        res.end(Buffer.concat([...parts, Buffer.from(`\r\n--${boundary}--\r\n`)]))
        return
      }
      const [start, end] = ranges[0]
      const reported =
        behaviour === "wrong-range"
          ? `bytes ${start + 1}-${end + 1}/${newContent.length}`
          : `${behaviour === "uppercase-unit" ? "BYTES" : "bytes"} ${start}-${end}/${newContent.length}`
      res.writeHead(206, { "Content-Range": reported, "Content-Length": end - start + 1 })
      res.end(newContent.subarray(start, end + 1))
    })
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve))
    return new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/new.bin`)
  }

  async function download(
    dir: string,
    newUrl: URL,
    isUseMultipleRangeRequest: boolean,
    httpExecutor: HttpExecutor<ClientRequest> = new LocalHttpExecutor()
  ): Promise<{ newFile: string; warnings: Array<string> }> {
    const oldFile = path.join(dir, "old.bin")
    const newFile = path.join(dir, "new.bin")
    writeFileSync(oldFile, oldContent)
    const warnings: Array<string> = []
    const logger = { info: () => {}, warn: (message: string) => warnings.push(message), error: () => {} }
    const fileInfo = { size: newContent.length, sha512: createHash("sha512").update(newContent).digest("base64") }
    const downloader = new GenericDifferentialDownloader(fileInfo, httpExecutor, {
      oldFile,
      newFile,
      newUrl,
      logger,
      requestHeaders: null,
      isUseMultipleRangeRequest,
      cancellationToken: new CancellationToken(),
    })
    await downloader.download(namedBlockMap(["A", "X", "C", "Y"]), namedBlockMap(["A", "B", "C", "D"]))
    return { newFile, warnings }
  }

  test("a host that serves multipart/byteranges takes one request", async ({ tmpDir }) => {
    const { newFile } = await download(await tmpDir.createTempDir({ prefix: "single-range" }), await startHost("multipart"), true)
    expect(readFileSync(newFile).equals(newContent)).toBe(true)
    expect(requests).toHaveLength(1)
  })

  for (const [behaviour, label] of [
    ["multi-501", "501 (GitHub release assets)"],
    ["multi-400", "400 (Google Cloud Storage)"],
    ["multi-200", "200 with the whole file (S3)"],
  ] as const) {
    test(`a host that answers multi-range requests with ${label} is retried with one range per request`, async ({ tmpDir }) => {
      const { newFile, warnings } = await download(await tmpDir.createTempDir({ prefix: "single-range" }), await startHost(behaviour), true)
      expect(readFileSync(newFile).equals(newContent)).toBe(true)
      expect(requests).toEqual([`bytes=${BLOCK}-${2 * BLOCK - 1}, ${3 * BLOCK}-${4 * BLOCK - 1}`, `bytes=${BLOCK}-${2 * BLOCK - 1}`, `bytes=${3 * BLOCK}-${4 * BLOCK - 1}`])
      expect(warnings.some(it => it.includes("retrying with one range per request"))).toBe(true)
    })
  }

  test("an error that is not about ranges (403) is not retried range by range", async ({ tmpDir }) => {
    const promise = download(await tmpDir.createTempDir({ prefix: "single-range" }), await startHost("multi-403"), true)
    await expect(promise).rejects.toMatchObject({ statusCode: 403 })
    expect(requests).toHaveLength(1)
  })

  test("a rejection that is not an Error is rethrown as is, without a range-by-range retry", async ({ tmpDir }) => {
    class ThrowingHttpExecutor extends HttpExecutor<ClientRequest> {
      calls = 0
      createRequest(): ClientRequest {
        this.calls++
        // oxlint-disable-next-line typescript/only-throw-error -- the test needs a non-Error rejection
        throw null
      }
    }
    const httpExecutor = new ThrowingHttpExecutor()
    const promise = download(await tmpDir.createTempDir({ prefix: "single-range" }), new URL("http://127.0.0.1/new.bin"), true, httpExecutor)
    await expect(promise).rejects.toBeNull()
    expect(httpExecutor.calls).toBe(1)
  })

  test("a host that ignores ranges fails on the first single-range request instead of streaming the file per range", async ({ tmpDir }) => {
    const promise = download(await tmpDir.createTempDir({ prefix: "single-range" }), await startHost("ignores-ranges"), true)
    await expect(promise).rejects.toMatchObject({ code: "ERR_UPDATER_RANGE_NOT_SUPPORTED" })
    // the multi-range attempt, then one single-range attempt
    expect(requests).toHaveLength(2)
  })

  test("single-range downloads reject a 200 answer even when it carries Accept-Ranges", async ({ tmpDir }) => {
    const promise = download(await tmpDir.createTempDir({ prefix: "single-range" }), await startHost("ignores-ranges"), false)
    await expect(promise).rejects.toMatchObject({ code: "ERR_UPDATER_RANGE_NOT_SUPPORTED" })
    expect(requests).toHaveLength(1)
  })

  test("single-range downloads accept a range unit in any case (RFC 9110)", async ({ tmpDir }) => {
    const { newFile } = await download(await tmpDir.createTempDir({ prefix: "single-range" }), await startHost("uppercase-unit"), false)
    expect(readFileSync(newFile).equals(newContent)).toBe(true)
    expect(requests).toHaveLength(2)
  })

  test("single-range downloads reject a 206 for a different range", async ({ tmpDir }) => {
    const promise = download(await tmpDir.createTempDir({ prefix: "single-range" }), await startHost("wrong-range"), false)
    await expect(promise).rejects.toMatchObject({ code: "ERR_UPDATER_RANGE_NOT_SUPPORTED" })
    expect(requests).toHaveLength(1)
  })
})
