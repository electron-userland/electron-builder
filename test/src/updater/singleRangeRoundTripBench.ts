// Bench, not run in CI (the name matches none of the test-file globs): requests, round trips and bytes of a v3
// differential update of a 100 MiB file, for the block map fetch and the file download, on a single-range host
// (`isUseMultipleRangeRequest: false`: GitHub releases, S3, many CDNs) and on a multipart host.
//
//   env -u GH_TOKEN -u GITHUB_TOKEN TEST_FILES=singleRangeRoundTripBench pnpm ci:test
//
// Env knobs: BENCH_FILE_MB (default 100), BENCH_LATENCY_MS (default 25).
//
// The host delays every response by BENCH_LATENCY_MS, so requests that are sent together are in flight together.
// "Round trips" is the length of the longest chain of requests where each one was sent after the previous one was
// answered: what a client pays in latency, whatever the RTT. The maps come from the production builder
// (`buildBlockMapV3`, the default 8/16/32 KiB chunker) over deterministic incompressible content; the edits keep the
// file size, as an installer rebuild with a few changed files typically does not.
import { CancellationToken, HttpExecutor } from "builder-util-runtime"
import { decodeBlockMapV3, toBlockMap } from "builder-util-runtime/internal"
import { buildBlockMapV3 } from "app-builder-lib/src/targets/blockmap/blockmapV3.js"
import { fetchBlockMapV3 } from "electron-updater/src/differentialDownloader/blockMapV3Fetcher"
import { GenericDifferentialDownloader } from "electron-updater/src/differentialDownloader/GenericDifferentialDownloader"
import { createCipheriv } from "crypto"
import { readFileSync, rmSync, writeFileSync } from "fs"
import { ClientRequest, createServer, IncomingMessage, request as httpRequest, Server, ServerResponse } from "http"
import { AddressInfo } from "net"
import * as path from "path"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

const FILE_SIZE = Number(process.env.BENCH_FILE_MB ?? 100) * 1024 * 1024
const LATENCY_MS = Number(process.env.BENCH_LATENCY_MS ?? 25)

class LocalHttpExecutor extends HttpExecutor<ClientRequest> {
  createRequest(options: any, callback: (response: any) => void): ClientRequest {
    return httpRequest(options, callback)
  }
}

/** deterministic incompressible bytes (AES-CTR keystream) */
function pseudoRandom(size: number, seed: number): Buffer {
  const key = Buffer.alloc(16, seed)
  const cipher = createCipheriv("aes-128-ctr", key, Buffer.alloc(16))
  return Buffer.concat([cipher.update(Buffer.alloc(size)), cipher.final()])
}

interface Exchange {
  sent: number
  answered: number
}

interface Stats {
  requests: number
  roundTrips: number
  bytes: number
}

class RecordingHost {
  private server: Server | null = null
  url: URL = null as any
  multipart = false
  readonly files = new Map<string, Buffer>()
  private log: Array<Exchange> = []
  private bytes = 0

  async start(): Promise<void> {
    this.server = createServer((req, res) => this.handle(req, res))
    await new Promise<void>(resolve => this.server!.listen(0, "127.0.0.1", resolve))
    this.url = new URL(`http://127.0.0.1:${(this.server.address() as AddressInfo).port}/`)
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections()
    await new Promise<void>(resolve => this.server?.close(() => resolve()))
  }

  reset(): void {
    this.log = []
    this.bytes = 0
  }

  /** requests, the longest chain of requests sent after the previous one was answered, and response body bytes */
  stats(): Stats {
    const exchanges = [...this.log].sort((a, b) => a.sent - b.sent)
    const depth: Array<number> = []
    exchanges.forEach((it, i) => {
      let d = 1
      for (let j = 0; j < i; j++) {
        if (exchanges[j].answered <= it.sent) {
          d = Math.max(d, depth[j] + 1)
        }
      }
      depth.push(d)
    })
    return { requests: exchanges.length, roundTrips: Math.max(0, ...depth), bytes: this.bytes }
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const exchange: Exchange = { sent: performance.now(), answered: Infinity }
    this.log.push(exchange)
    const file = this.files.get(new URL(req.url!, this.url).pathname.slice(1))!
    const send = (status: number, headers: Record<string, string | number>, body: Buffer) => {
      setTimeout(() => {
        this.bytes += body.length
        res.writeHead(status, headers)
        res.end(body, () => (exchange.answered = performance.now()))
      }, LATENCY_MS)
    }
    const header = req.headers.range
    if (header == null) {
      send(200, { "Content-Length": file.length }, file)
      return
    }
    const ranges = header
      .slice("bytes=".length)
      .split(",")
      .map(it => it.trim().split("-").map(Number))
    if (ranges.length === 1) {
      const [start, end] = ranges[0]
      send(206, { "Content-Range": `bytes ${start}-${end}/${file.length}`, "Content-Length": end - start + 1 }, file.subarray(start, end + 1))
      return
    }
    if (!this.multipart) {
      send(501, {}, Buffer.from("Multiple ranges are not supported"))
      return
    }
    const boundary = "bench-boundary"
    const parts: Array<Buffer> = []
    for (const [start, end] of ranges) {
      parts.push(Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes ${start}-${end}/${file.length}\r\n\r\n`))
      parts.push(file.subarray(start, end + 1))
    }
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))
    send(206, { "Content-Type": `multipart/byteranges; boundary=${boundary}` }, Buffer.concat(parts))
  }
}

interface Scenario {
  name: string
  edit: (content: Buffer) => void
}

const SCENARIOS: Array<Scenario> = [
  {
    name: "1 change",
    edit: content => pseudoRandom(64, 101).copy(content, Math.floor(FILE_SIZE * 0.37)),
  },
  {
    name: "20 scattered changes",
    edit: content => {
      for (let i = 0; i < 20; i++) {
        pseudoRandom(64, 102 + i).copy(content, Math.floor(((i + 0.5) * FILE_SIZE) / 20))
      }
    },
  },
  {
    name: "one 8 MiB contiguous change",
    edit: content => pseudoRandom(8 * 1024 * 1024, 140).copy(content, Math.floor(FILE_SIZE * 0.4)),
  },
]

describe("single-range round trips of a v3 differential update", { concurrent: false, timeout: 15 * 60 * 1000 }, () => {
  const host = new RecordingHost()
  beforeAll(() => host.start())
  afterAll(() => host.stop())

  test(`${FILE_SIZE / 1024 / 1024} MiB file`, async ({ tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "round-trip-bench" })
    const oldFile = path.join(dir, "old.bin")
    const workFile = path.join(dir, "work.bin")
    const oldContent = pseudoRandom(FILE_SIZE, 1)
    writeFileSync(oldFile, oldContent)
    await buildBlockMapV3(oldFile, path.join(dir, "old.blockmap"))
    const oldMapData = readFileSync(path.join(dir, "old.blockmap"))
    const oldMap = decodeBlockMapV3(oldMapData)
    const rows: Array<string> = [
      `map: ${oldMapData.length} bytes, ${oldMap.header.superCount} super-groups, ${oldMap.header.groupCount} groups, ${oldMap.header.blockCount} blocks; latency ${LATENCY_MS} ms`,
      "| change | host | map requests | map round trips | map bytes | file requests | file round trips | file bytes |",
      "|---|---|---:|---:|---:|---:|---:|---:|",
    ]

    try {
      for (const scenario of SCENARIOS) {
        const newContent = Buffer.from(oldContent)
        scenario.edit(newContent)
        writeFileSync(workFile, newContent)
        const built = await buildBlockMapV3(workFile, path.join(dir, "new.blockmap"))
        rmSync(workFile)
        host.files.set("app.bin", newContent)
        host.files.set("app.bin.blockmap", readFileSync(path.join(dir, "new.blockmap")))

        for (const multipart of [false, true]) {
          host.multipart = multipart
          host.reset()
          const fetched = await fetchBlockMapV3({
            url: new URL("app.bin.blockmap", host.url),
            oldMap: oldMapData,
            expectedFileSize: FILE_SIZE,
            httpExecutor: new LocalHttpExecutor(),
            cancellationToken: new CancellationToken(),
            isUseMultipleRangeRequest: multipart,
          })
          expect(fetched.buffer.equals(host.files.get("app.bin.blockmap")!)).toBe(true)
          const map = host.stats()

          host.reset()
          const logger = { info: () => {}, warn: () => {}, error: () => {} }
          await new GenericDifferentialDownloader({ size: FILE_SIZE, sha512: built.sha512 }, new LocalHttpExecutor(), {
            oldFile,
            newFile: workFile,
            newUrl: new URL("app.bin", host.url),
            logger,
            requestHeaders: null,
            isUseMultipleRangeRequest: multipart,
            cancellationToken: new CancellationToken(),
          }).download(toBlockMap(oldMap), toBlockMap(decodeBlockMapV3(fetched.buffer)))
          rmSync(workFile)
          const file = host.stats()
          rows.push(
            `| ${scenario.name} | ${multipart ? "multipart" : "single-range"} | ${map.requests} | ${map.roundTrips} | ${map.bytes} | ${file.requests} | ${file.roundTrips} | ${file.bytes} |`
          )
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    console.log(rows.join("\n"))
  })
})
