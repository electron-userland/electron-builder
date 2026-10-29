import { blake2b } from "@noble/hashes/blake2.js"
import { CancellationToken } from "builder-util-runtime"
import { BlockInput, blockMapSizeLimit, decodeBlockMapV3, encodeBlockMapV3, isBlockMapV3, RECORD_SIZE, recordsStart, SUPER_SIZE } from "builder-util-runtime/internal"
import {
  coalesce,
  fetchBlockMapV3,
  FIRST_RANGE_SIZE,
  firstRangeSize,
  MIN_FIRST_RANGE_SIZE,
  parseMultipartByteRanges,
  verifyBlockMapV3,
} from "electron-updater/src/differentialDownloader/blockMapV3Fetcher"
import * as http from "http"
import { AddressInfo } from "net"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { gzipSync } from "zlib"
import { httpExecutor } from "../helpers/updaterTestUtil"

// Deterministic synthetic blocks: content-derived digests, sizes around a mean (same generator as blockMapV3Test).
function makeBlocks(count: number, seed: number, avgSize = 4096, startOffset = 0): Array<BlockInput> {
  const blocks: Array<BlockInput> = []
  let x = seed >>> 0
  let offset = startOffset
  for (let i = 0; i < count; i++) {
    x = (x * 1664525 + 1013904223) >>> 0
    const size = Math.max(64, Math.min(0xffff, avgSize + ((x % (avgSize * 2)) - avgSize) / 2))
    const digest = blake2b(Buffer.from(`block-${seed}-${i}-${x}`), { dkLen: 18 })
    blocks.push({ digest, size: Math.floor(size), offset })
    offset += Math.floor(size)
  }
  return blocks
}

function encode(blocks: Array<BlockInput>): Buffer {
  const fileSize = blocks.reduce((sum, b) => sum + b.size, 0)
  return encodeBlockMapV3(blocks, { fileSize, defaultChunker: { min: 8192, avg: 16384, max: 32768 } })
}

/** Re-offsets blocks after an edit so the group boundary logic sees a consistent stream. */
function reoffset(blocks: Array<BlockInput>): Array<BlockInput> {
  let offset = 0
  return blocks.map(b => {
    const result = { ...b, offset }
    offset += b.size
    return result
  })
}

interface RequestLog {
  method: string
  range: string | null
  status: number
}

interface TestServer {
  url: URL
  requests: Array<RequestLog>
  /** request headers, in the order of `requests` */
  headers: Array<http.IncomingHttpHeaders>
  rangeSupport: boolean
  files: Map<string, Buffer>
  /** name → Location of a 302 answer */
  redirects: Map<string, string>
  /** answers the request instead of the file server when it returns true */
  override: ((req: http.IncomingMessage, res: http.ServerResponse) => boolean) | null
  close(): Promise<void>
}

function parseRanges(header: string, size: number): Array<[number, number]> | null {
  const m = /^bytes=(.+)$/.exec(header)
  if (m == null) {
    return null
  }
  const ranges: Array<[number, number]> = []
  for (const r of m[1].split(",")) {
    const [s, e] = r.trim().split("-")
    const start = s === "" ? size - parseInt(e, 10) : parseInt(s, 10)
    const end = e === "" ? size - 1 : Math.min(parseInt(e, 10), size - 1)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end) {
      return null
    }
    ranges.push([start, end])
  }
  return ranges
}

/** In-memory file server with single- and multi-range support (206 + Content-Range, 416 when unsatisfiable) and a switch to disable Range support. */
function startServer(): Promise<TestServer> {
  const state: TestServer = { url: null as any, requests: [], headers: [], rangeSupport: true, files: new Map(), redirects: new Map(), override: null, close: null as any }
  const server = http.createServer((req, res) => {
    const name = new URL(req.url!, "http://localhost").pathname.replace(/^\/+/, "")
    const file = state.files.get(name)
    const rangeHeader = req.headers["range"] ?? null
    const log: RequestLog = { method: req.method!, range: rangeHeader, status: 0 }
    state.requests.push(log)
    state.headers.push(req.headers)
    const send = (status: number, headers: http.OutgoingHttpHeaders, body?: Buffer) => {
      log.status = status
      res.writeHead(status, headers)
      res.end(body)
    }
    if (state.override?.(req, res) === true) {
      log.status = res.statusCode
      return
    }
    const location = state.redirects.get(name)
    if (location != null) {
      send(302, { Location: location })
      return
    }
    if (file == null) {
      send(404, {}, Buffer.from("Not found"))
      return
    }
    if (rangeHeader == null || !state.rangeSupport) {
      send(200, { "Content-Length": file.length, "Content-Type": "application/octet-stream", ...(state.rangeSupport ? { "Accept-Ranges": "bytes" } : {}) }, file)
      return
    }
    const ranges = parseRanges(rangeHeader, file.length)
    if (ranges == null) {
      send(416, { "Content-Range": `bytes */${file.length}` })
      return
    }
    if (ranges.length === 1) {
      const [start, end] = ranges[0]
      send(206, { "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${file.length}`, "Content-Type": "application/octet-stream" }, file.subarray(start, end + 1))
      return
    }
    const boundary = "gc0p4Jq0M2Yt08jU534c0p"
    const parts: Array<Buffer> = []
    ranges.forEach(([start, end], i) => {
      parts.push(Buffer.from(`${i === 0 ? "" : "\r\n"}--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes ${start}-${end}/${file.length}\r\n\r\n`))
      parts.push(file.subarray(start, end + 1))
    })
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))
    send(206, { "Accept-Ranges": "bytes", "Content-Type": `multipart/byteranges; boundary=${boundary}` }, Buffer.concat(parts))
  })
  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      state.url = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`)
      state.close = () => new Promise<void>(r => server.close(() => r()))
      resolve(state)
    })
  })
}

describe("blockMapV3Fetcher", () => {
  let server: TestServer
  /** a second origin (another port), e.g. the CDN a feed redirects to */
  let cdn: TestServer
  beforeAll(async () => {
    server = await startServer()
    cdn = await startServer()
  })
  afterAll(async () => {
    await server.close()
    await cdn.close()
  })

  // ~400 groups of ~32 blocks in ~25 super-groups
  const OLD_BLOCKS = makeBlocks(400 * 32, 1)
  const OLD = encode(OLD_BLOCKS)
  const oldMap = decodeBlockMapV3(OLD)

  function fetchWith(
    name: string,
    old: Buffer | null,
    isUseMultipleRangeRequest?: boolean,
    extra: { expectedFileSize?: number; requestHeaders?: http.OutgoingHttpHeaders; setUp?: () => void } = {}
  ) {
    for (const it of [server, cdn]) {
      it.requests.length = 0
      it.headers.length = 0
      it.redirects.clear()
      it.override = null
    }
    const { setUp, ...options } = extra
    setUp?.()
    return fetchBlockMapV3({
      url: new URL(name, server.url),
      oldMap: old,
      httpExecutor,
      cancellationToken: new CancellationToken(),
      isUseMultipleRangeRequest,
      ...options,
    })
  }

  /** NEW map with a few edited groups, so a fetch against OLD issues several Range requests */
  function editedMap(tag: string): Buffer {
    const blocks = OLD_BLOCKS.map(b => ({ ...b }))
    for (const groupIndex of [40, 200]) {
      edit(blocks, firstBlockOf(groupIndex) + 1, tag)
    }
    return encode(reoffset(blocks))
  }

  /** first block index of group `groupIndex` */
  function firstBlockOf(groupIndex: number): number {
    let blockIndex = 0
    for (let i = 0; i < groupIndex; i++) {
      blockIndex += oldMap.groups[i].blockCount
    }
    return blockIndex
  }

  function edit(blocks: Array<BlockInput>, blockIndex: number, tag: string) {
    blocks[blockIndex] = { ...blocks[blockIndex], digest: blake2b(Buffer.from(`${tag}-${blockIndex}`), { dkLen: 18 }) }
  }

  test("map fixture has ~400 groups in ~25 super-groups and does not fit into the first range", () => {
    expect(oldMap.groups.length).toBeGreaterThan(300)
    expect(oldMap.groups.length).toBeLessThan(520)
    expect(oldMap.supers.length).toBeGreaterThan(12)
    expect(oldMap.supers.length).toBeLessThan(50)
    expect(OLD.length).toBeGreaterThan(FIRST_RANGE_SIZE)
    // the first range is sized from the old super-group table: covers it with margin, far from the whole map
    const first = firstRangeSize(oldMap.header)
    expect(first).toBeGreaterThan(oldMap.header.headerLen + oldMap.supers.length * SUPER_SIZE)
    expect(first).toBeLessThan(OLD.length / 10)
    expect(firstRangeSize({ ...oldMap.header, superCount: 1 })).toBe(MIN_FIRST_RANGE_SIZE)
    expect(firstRangeSize({ ...oldMap.header, superCount: 100000 })).toBe(FIRST_RANGE_SIZE)
  })

  test("no old map → one plain GET of the whole file", async () => {
    server.files.set("new.blockmap", OLD)
    const result = await fetchWith("new.blockmap", null)
    expect(result.buffer.equals(OLD)).toBe(true)
    expect(result.requests).toBe(1)
    expect(result.wireBytes).toBe(OLD.length)
    expect(server.requests).toEqual([{ method: "GET", range: null, status: 200 }])
    expect(result.matchedGroups).toBe(0)
    expect(result.fetchedGroups).toBe(oldMap.groups.length)
    expect(result.fetchedSupers).toBe(oldMap.supers.length)
  })

  test("old map sharing most groups → byte-identical reconstruction with wireBytes < 15 % of the file (3-group change)", async () => {
    // change one block in each of three groups spread over the map
    const blocks = OLD_BLOCKS.map(b => ({ ...b }))
    for (const groupIndex of [20, 100, oldMap.groups.length - 20]) {
      // the second block of a group can never be a group boundary (GROUP_MIN), so the grouping stays put
      edit(blocks, firstBlockOf(groupIndex) + 1, "edited")
    }
    const NEW = encode(reoffset(blocks))
    const newMap = decodeBlockMapV3(NEW)
    server.files.set("new.blockmap", NEW)

    const result = await fetchWith("new.blockmap", OLD, false)
    expect(result.buffer.equals(NEW)).toBe(true)
    expect(result.fetchedGroups).toBe(3)
    expect(result.matchedGroups).toBe(newMap.groups.length - 3)
    // the super-group of every edited group changed (a changed group hash can also move a content-defined
    // super-group boundary, which costs one more); every other super-group was reused whole
    expect(result.fetchedSupers).toBeGreaterThanOrEqual(3)
    expect(result.fetchedSupers).toBeLessThanOrEqual(6)
    expect(result.matchedSupers).toBe(newMap.supers.length - result.fetchedSupers)
    // first range (header + super-groups + first group entries) + group entries of ≤ 3 super-groups + 3 groups' records
    expect(result.wireBytes).toBeLessThan(NEW.length * 0.15)
    expect(result.wireBytes).toBeGreaterThanOrEqual(firstRangeSize(oldMap.header))
    // single-range host: 1 + up to 6 group entry ranges (fewer when the first range already covered them) + 3 record ranges
    expect(result.requests).toBeGreaterThanOrEqual(4)
    expect(result.requests).toBeLessThanOrEqual(10)
    expect(server.requests.every(it => it.status === 206)).toBe(true)
    console.log(
      `blockMapV3Fetcher: partial fetch ${result.wireBytes} of ${NEW.length} bytes (${((100 * result.wireBytes) / NEW.length).toFixed(1)} %) in ${result.requests} requests`
    )
    expect(server.requests[0].range).toBe(`bytes=0-${firstRangeSize(oldMap.header) - 1}`)
  })

  test("multipart host: unmatched groups fetched in one multipart/byteranges request", async () => {
    const blocks = OLD_BLOCKS.map(b => ({ ...b }))
    for (const groupIndex of [30, 90, 150]) {
      edit(blocks, firstBlockOf(groupIndex) + 1, "multipart")
    }
    const NEW = encode(reoffset(blocks))
    server.files.set("new.blockmap", NEW)

    const result = await fetchWith("new.blockmap", OLD, true)
    expect(result.buffer.equals(NEW)).toBe(true)
    expect(result.fetchedGroups).toBe(3)
    // first range + (one multipart request for the group entries, unless the first range covered them) + one for the records
    expect(result.requests).toBeGreaterThanOrEqual(2)
    expect(result.requests).toBeLessThanOrEqual(3)
    expect(server.requests[server.requests.length - 1].range!.split(",").length).toBe(3)
    expect(result.wireBytes).toBeLessThan(NEW.length * 0.15)
  })

  test("adjacent unmatched groups are coalesced into one request", async () => {
    // edit one block in each of four consecutive groups
    const blocks = OLD_BLOCKS.map(b => ({ ...b }))
    for (let g = 50; g < 54; g++) {
      edit(blocks, firstBlockOf(g) + 1, "adjacent")
    }
    const NEW = encode(reoffset(blocks))
    server.files.set("new.blockmap", NEW)

    const result = await fetchWith("new.blockmap", OLD, false)
    expect(result.buffer.equals(NEW)).toBe(true)
    expect(result.fetchedGroups).toBe(4)
    // the four groups sit in one or two adjacent super-groups: at most one group entry range and exactly one record range
    expect(result.fetchedSupers).toBeLessThanOrEqual(2)
    expect(result.requests).toBeLessThanOrEqual(3)
    const rangeRequests = server.requests.filter(it => it.range != null)
    expect(rangeRequests[rangeRequests.length - 1].range!.includes(",")).toBe(false)
  })

  test("server without Range support → whole file from the (ignored) Range request, no extra GET", async () => {
    server.files.set("new.blockmap", OLD)
    server.rangeSupport = false
    try {
      const result = await fetchWith("new.blockmap", OLD, false)
      expect(result.buffer.equals(OLD)).toBe(true)
      expect(result.requests).toBe(1)
      expect(result.wireBytes).toBe(OLD.length)
      expect(server.requests[0].status).toBe(200)
    } finally {
      server.rangeSupport = true
    }
  })

  test("small map fits into the first range → one request, no record fetch", async () => {
    const small = encode(makeBlocks(120, 5))
    expect(small.length).toBeLessThan(MIN_FIRST_RANGE_SIZE)
    server.files.set("small.blockmap", small)
    const result = await fetchWith("small.blockmap", OLD, false)
    expect(result.buffer.equals(small)).toBe(true)
    expect(result.requests).toBe(1)
  })

  test("a file without the v3 magic is not treated as a broken v3 map: it is downloaded whole and returned for the caller to decode", async () => {
    // AppUpdater then reads it as a v2 (gzipped JSON) map: here that fails too, so the update falls back to a full download
    const corrupt = Buffer.from(OLD)
    corrupt.write("XXXX", 0, 4, "latin1")
    server.files.set("corrupt.blockmap", corrupt)
    for (const old of [OLD, null]) {
      const result = await fetchWith("corrupt.blockmap", old, false)
      expect(result.buffer.equals(corrupt)).toBe(true)
      expect(isBlockMapV3(result.buffer)).toBe(false)
    }
  })

  describe('a v2 map (gzipped JSON) published under the URL, e.g. by a release built with blockmap: "v2"', () => {
    // incompressible, so the gzipped file is larger than the first Range request
    const V2 = gzipSync(
      Buffer.from(
        makeBlocks(4000, 77)
          .map(b => Buffer.from(b.digest).toString("base64"))
          .join(",")
      ),
      { level: 0 }
    )

    test("the first Range response is not a v3 map → the rest of the file is fetched, and the v2 map is returned unverified", async () => {
      expect(V2.length).toBeGreaterThan(firstRangeSize(oldMap.header))
      server.files.set("v2.blockmap", V2)
      const result = await fetchWith("v2.blockmap", OLD, false)
      expect(result.buffer.equals(V2)).toBe(true)
      expect(isBlockMapV3(result.buffer)).toBe(false)
      const first = firstRangeSize(oldMap.header)
      expect(server.requests).toEqual([
        { method: "GET", range: `bytes=0-${first - 1}`, status: 206 },
        { method: "GET", range: `bytes=${first}-${V2.length - 1}`, status: 206 },
      ])
      expect(result.wireBytes).toBe(V2.length)
    })

    test("a v2 map smaller than the first Range request arrives in one response", async () => {
      const small = gzipSync(Buffer.from("[]"))
      server.files.set("v2-small.blockmap", small)
      const result = await fetchWith("v2-small.blockmap", OLD, false)
      expect(result.buffer.equals(small)).toBe(true)
      expect(server.requests).toHaveLength(1)
    })

    test("a server that ignores Range returns the v2 map whole in one response", async () => {
      server.files.set("v2.blockmap", V2)
      server.rangeSupport = false
      try {
        const result = await fetchWith("v2.blockmap", OLD, false)
        expect(result.buffer.equals(V2)).toBe(true)
        expect(server.requests).toEqual([{ method: "GET", range: expect.stringMatching(/^bytes=0-/), status: 200 }])
      } finally {
        server.rangeSupport = true
      }
    })

    test("no old map → one plain GET, and the v2 map is returned as is", async () => {
      server.files.set("v2.blockmap", V2)
      const result = await fetchWith("v2.blockmap", null, false)
      expect(result.buffer.equals(V2)).toBe(true)
      expect(server.requests).toEqual([{ method: "GET", range: null, status: 200 }])
    })
  })

  test("corrupted records (group hash mismatch) → throws", async () => {
    // full download path: verification catches a flipped byte in the last record
    const corrupt = Buffer.from(OLD)
    corrupt[corrupt.length - RECORD_SIZE] ^= 0xff
    server.files.set("corrupt.blockmap", corrupt)
    await expect(fetchWith("corrupt.blockmap", null, false)).rejects.toThrow(/hash mismatch/)

    // partial path: the last group is unmatched (its second block changed) and its records come from the server, corrupted there
    const blocks = OLD_BLOCKS.map(b => ({ ...b }))
    edit(blocks, firstBlockOf(oldMap.groups.length - 1) + 1, "last")
    const corruptNew = encode(reoffset(blocks))
    corruptNew[corruptNew.length - RECORD_SIZE] ^= 0xff
    server.files.set("corrupt.blockmap", corruptNew)
    await expect(fetchWith("corrupt.blockmap", OLD, false)).rejects.toThrow(/hash mismatch/)

    // a matched group's records come from the old map, so corruption there is never fetched and the result is the valid map
    server.files.set("corrupt.blockmap", corrupt)
    const result = await fetchWith("corrupt.blockmap", OLD, false)
    expect(result.buffer.equals(OLD)).toBe(true)
  })

  test("404 → throws", async () => {
    await expect(fetchWith("missing.blockmap", OLD, false)).rejects.toThrow(/404/)
    await expect(fetchWith("missing.blockmap", null, false)).rejects.toThrow(/404/)
  })

  test("coalesce merges adjacent and near ranges only", () => {
    expect(
      coalesce(
        [
          { start: 0, end: 10 },
          { start: 10, end: 20 },
          { start: 25, end: 30 },
          { start: 5000, end: 5010 },
        ],
        8
      )
    ).toEqual([
      { start: 0, end: 30 },
      { start: 5000, end: 5010 },
    ])
  })

  test("parseMultipartByteRanges locates parts by Content-Range", () => {
    const boundary = "b"
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Range: bytes 10-12/100\r\n\r\n`),
      Buffer.from("abc"),
      Buffer.from(`\r\n--${boundary}\r\nContent-Type: x\r\nContent-Range: bytes 50-50/100\r\n\r\n`),
      Buffer.from("z"),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    const parts = parseMultipartByteRanges(body, boundary, [
      { start: 10, end: 13 },
      { start: 50, end: 51 },
    ])
    expect(parts.map(it => [it.start, it.end, it.data.toString()])).toEqual([
      [10, 13, "abc"],
      [50, 51, "z"],
    ])
  })
  test("parseMultipartByteRanges rejects a part that ends before it starts, an unexpected part and a repeated part", () => {
    const part = (range: string, data: string) => Buffer.from(`--b\r\nContent-Range: bytes ${range}/2000\r\n\r\n${data}\r\n`)
    const end = Buffer.from("--b--\r\n")
    // `bytes 1000-10` once made the parser find the same delimiter again and loop forever
    expect(() => parseMultipartByteRanges(Buffer.concat([part("1000-10", ""), end]), "b", [{ start: 1000, end: 1011 }])).toThrow(/unexpected part 1000-10/)
    expect(() => parseMultipartByteRanges(Buffer.concat([part("0-2", "abc"), end]), "b", [{ start: 0, end: 2 }])).toThrow(/unexpected part 0-2/)
    expect(() => parseMultipartByteRanges(Buffer.concat([part("0-2", "abc"), part("0-2", "abc"), end]), "b", [{ start: 0, end: 3 }])).toThrow(/unexpected part 0-2/)
  })

  test("a cross-origin redirect drops the credential headers for that and every later request; a relative Location resolves against the current URL", async () => {
    const NEW = editedMap("redirect")
    cdn.files.set("cdn/new.blockmap", NEW)
    const result = await fetchWith("new.blockmap", OLD, false, {
      requestHeaders: { authorization: "token secret", "x-custom": "kept" },
      setUp: () => {
        server.redirects.set("new.blockmap", new URL("redirect/hop.blockmap", cdn.url).href)
        cdn.redirects.set("redirect/hop.blockmap", "../cdn/new.blockmap")
      },
    })
    expect(result.buffer.equals(NEW)).toBe(true)

    // the feed's origin got the credentials once, then every range went to the CDN without them
    expect(server.requests).toHaveLength(1)
    expect(server.headers[0].authorization).toBe("token secret")
    expect(cdn.requests.length).toBeGreaterThan(2)
    expect(cdn.requests.filter(it => it.status === 302)).toHaveLength(1)
    for (const headers of cdn.headers) {
      expect(headers.authorization).toBeUndefined()
      expect(headers["x-custom"]).toBe("kept")
    }
  })

  test("a malformed Location rejects the fetch instead of throwing from the response listener", async () => {
    const pending = fetchWith("new.blockmap", OLD, false, { setUp: () => server.redirects.set("new.blockmap", "http://[::1") })
    await expect(pending).rejects.toThrow(/Invalid URL/)
  })

  test("a redirect to another protocol is rejected", async () => {
    const pending = fetchWith("new.blockmap", OLD, false, { setUp: () => server.redirects.set("new.blockmap", "file:///etc/passwd") })
    await expect(pending).rejects.toThrow(/"file:" protocol/)
  })

  test("a map for a file of another size than the update is rejected before anything else is requested", async () => {
    server.files.set("new.blockmap", OLD)
    await expect(fetchWith("new.blockmap", OLD, false, { expectedFileSize: oldMap.header.fileSize + 1 })).rejects.toThrow(/describes a \d+-byte file, the update is/)
    expect(server.requests).toHaveLength(1)
    await expect(fetchWith("new.blockmap", null, false, { expectedFileSize: oldMap.header.fileSize + 1 })).rejects.toThrow(/describes a/)
    await expect(fetchWith("new.blockmap", OLD, false, { expectedFileSize: oldMap.header.fileSize })).resolves.toMatchObject({ requests: 1 })
  })

  test("a header whose counts cannot fit the file is rejected before its tables are requested or allocated", async () => {
    const corrupt = Buffer.from(OLD)
    // 2^32 - 1 blocks would make the map ~40 GB
    corrupt.writeUInt32LE(0xffffffff, 20)
    server.files.set("corrupt.blockmap", corrupt)
    await expect(fetchWith("corrupt.blockmap", OLD, false)).rejects.toThrow(/inconsistent counts/)
    expect(server.requests).toHaveLength(1)
  })

  test("a single-range answer must name the requested range in Content-Range", async () => {
    const NEW = editedMap("content-range")
    server.files.set("new.blockmap", NEW)
    let count = 0
    // answer the second range request with the right length from the wrong offset
    const wrongOffset = (req: http.IncomingMessage, res: http.ServerResponse) => {
      if (++count !== 2) {
        return false
      }
      const [start, end] = /bytes=(\d+)-(\d+)/
        .exec(req.headers.range!)!
        .slice(1)
        .map(it => parseInt(it, 10))
      const shifted = start + 10
      res.writeHead(206, { "Content-Range": `bytes ${shifted}-${end + 10}/${NEW.length}` })
      res.end(NEW.subarray(shifted, end + 11))
      return true
    }
    await expect(fetchWith("new.blockmap", OLD, false, { setUp: () => (server.override = wrongOffset) })).rejects.toThrow(/Content-Range of the answer is/)
  })

  test("a 206 body larger than the requested range is cut off at the limit", async () => {
    server.files.set("big.blockmap", OLD)
    // claims the requested range, then streams far more
    const oversized = (_req: http.IncomingMessage, res: http.ServerResponse) => {
      res.writeHead(206, { "Content-Range": `bytes 0-${firstRangeSize(oldMap.header) - 1}/${OLD.length}` })
      res.end(Buffer.alloc(4 * 1024 * 1024))
      return true
    }
    await expect(fetchWith("big.blockmap", OLD, false, { setUp: () => (server.override = oversized) })).rejects.toThrow(/response exceeds \d+ bytes/)
  })

  test("verification rejects empty super-groups, groups and blocks", () => {
    const map = decodeBlockMapV3(OLD)
    const zeroSize = Buffer.from(OLD)
    zeroSize.writeUInt16LE(0, recordsStart(map.header) + 8)
    expect(() => verifyBlockMapV3(zeroSize, map.header, map.supers, map.groups)).toThrow(/empty block/)
    expect(() => decodeBlockMapV3(zeroSize)).toThrow(/empty block/)

    const groups = map.groups.map((it, i) => (i === 0 ? { ...it, blockCount: 0 } : it))
    expect(() => verifyBlockMapV3(OLD, map.header, map.supers, groups)).toThrow(/group 0 is empty/)
    const supers = map.supers.map((it, i) => (i === 0 ? { ...it, groupCount: 0 } : it))
    expect(() => verifyBlockMapV3(OLD, map.header, supers, map.groups)).toThrow(/super-group 0 is empty/)
  })

  test("a map without blocks is rejected, whether its header comes from a Range request or a whole download", async () => {
    server.files.set("empty.blockmap", encodeBlockMapV3([], { fileSize: 0, defaultChunker: { min: 8192, avg: 16384, max: 32768 } }))
    await expect(fetchWith("empty.blockmap", OLD, false)).rejects.toThrow(/empty map \(fileSize 0, blocks 0\)/)
    await expect(fetchWith("empty.blockmap", null, false)).rejects.toThrow(/empty map \(fileSize 0, blocks 0\)/)
  })

  test("a map larger than the limit for the update's size is rejected before it is allocated or downloaded whole", async () => {
    // 1-byte blocks: ~10 bytes of map per byte of file, far past the 64 bytes per KiB the limit allows
    const fileSize = 120_000
    const blocks: Array<BlockInput> = []
    for (let i = 0; i < fileSize; i++) {
      blocks.push({ digest: blake2b(Buffer.from(`dense-${i}`), { dkLen: 18 }), size: 1, offset: i })
    }
    const dense = encode(blocks)
    expect(dense.length).toBeGreaterThan(blockMapSizeLimit(fileSize))
    server.files.set("dense.blockmap", dense)

    await expect(fetchWith("dense.blockmap", OLD, false, { expectedFileSize: fileSize })).rejects.toThrow(
      `the header declares a ${dense.length}-byte map, more than the ${blockMapSizeLimit(fileSize)}-byte limit`
    )
    await expect(fetchWith("dense.blockmap", null, false, { expectedFileSize: fileSize })).rejects.toThrow(`response exceeds ${blockMapSizeLimit(fileSize)} bytes`)
    // the size of the update is not known: only MAX_BLOCK_MAP_SIZE applies
    await expect(fetchWith("dense.blockmap", null, false)).resolves.toMatchObject({ buffer: dense })
  })
})
