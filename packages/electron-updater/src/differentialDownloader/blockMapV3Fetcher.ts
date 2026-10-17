import {
  BlockMapV3,
  BlockMapV3Group,
  BlockMapV3Header,
  BlockMapV3Super,
  blockMapV3Size,
  CancellationToken,
  configureRequestOptions,
  configureRequestUrl,
  createHttpError,
  decodeBlockMapV3,
  GROUP_SIZE,
  groupEntryRanges,
  groupHashOfRecords,
  groupTableStart,
  HttpExecutor,
  IndexRange,
  parseBlockMapV3Groups,
  parseBlockMapV3Header,
  parseBlockMapV3Records,
  parseBlockMapV3Supers,
  RECORD_SIZE,
  recordRanges,
  recordsStart,
  safeGetHeader,
  SUPER_SIZE,
  superHashOfGroups,
} from "builder-util-runtime"
import { IncomingMessage, OutgoingHttpHeaders, RequestOptions } from "http"
import { URL } from "url"
import { Logger } from "../types.js"

/** Upper bound of the first Range request: header + super-group table of maps up to ~4k super-groups (≈ 2 GB of 16 KiB blocks). */
export const FIRST_RANGE_SIZE = 64 * 1024
/** Lower bound of the first Range request: the header, the super-group table and the first group entries of a typical map. */
export const MIN_FIRST_RANGE_SIZE = 2 * 1024
/** Unmatched record ranges separated by a gap up to this size are fetched as one range (a request costs ~1 KB of headers + 1 RTT). */
export const COALESCE_GAP_BYTES = 1024
/** Apache's default MaxRanges is 200 and header buffers are 8 KB; stay under both. */
export const MAX_RANGES_PER_REQUEST = 200
const MAX_REDIRECTS = 10

export interface BlockMapV3FetchOptions {
  /** URL of the NEW `.blockmap3` */
  readonly url: URL
  /** the cached OLD v3 map (complete file), or null when there is none — then the whole new map is downloaded with a plain GET */
  readonly oldMap: Buffer | null
  readonly httpExecutor: HttpExecutor<any>
  readonly requestHeaders?: OutgoingHttpHeaders | null
  readonly cancellationToken: CancellationToken
  /** same decision as the installer download (`Provider.isUseMultipleRangeRequest`) */
  readonly isUseMultipleRangeRequest?: boolean
  readonly logger?: Logger | null
}

export interface BlockMapV3FetchResult {
  /** the complete NEW v3 map, byte-identical to the remote file */
  readonly buffer: Buffer
  /** response body bytes received (headers excluded) */
  readonly wireBytes: number
  /** HTTP requests issued (redirects included) */
  readonly requests: number
  /** super-groups whose group entries (and records) were taken from the old map */
  readonly matchedSupers: number
  /** super-groups whose group entries were fetched */
  readonly fetchedSupers: number
  /** groups whose records were taken from the old map */
  readonly matchedGroups: number
  /** groups whose records were fetched */
  readonly fetchedGroups: number
}

type ByteRange = IndexRange

interface RangeResponse {
  status: number
  body: Buffer
  contentType: string | null
  /** total size from `Content-Range: bytes a-b/size`, or null */
  totalSize: number | null
}

/**
 * Fetches the NEW v3 block map with minimal wire cost:
 * 1. Range-GET the first `firstRangeSize` bytes → header + super-group table (+ the first group entries).
 * 2. Match new super-groups against the old map by (hash, groupCount, blockCount) → their group entries and records
 *    are copied from the old map; Range-fetch the group entries of the unmatched super-groups.
 * 3. Match the remaining groups against the old map by (hash, byteLength, blockCount) → their records are copied;
 *    Range-fetch the records of unmatched groups (adjacent/near ranges coalesced; multipart requests of ≤ 200 ranges
 *    on hosts that support them).
 * 4. Assemble and verify every super-group and group hash before returning.
 *
 * Any HTTP error, 416, missing range support that cannot be recovered by a full GET, parse error or verification
 * mismatch throws — the caller (AppUpdater) falls back to the v2 path.
 */
export async function fetchBlockMapV3(options: BlockMapV3FetchOptions): Promise<BlockMapV3FetchResult> {
  const fetcher = new BlockMapV3Fetcher(options)
  return await fetcher.fetch()
}

class BlockMapV3Fetcher {
  private wireBytes = 0
  private requests = 0
  private readonly requestOptions: RequestOptions

  constructor(private readonly options: BlockMapV3FetchOptions) {
    const requestOptions: RequestOptions = {
      headers: {
        ...options.requestHeaders,
        accept: "*/*",
      },
    }
    configureRequestUrl(options.url, requestOptions)
    configureRequestOptions(requestOptions)
    ;(requestOptions as any).redirect = "manual"
    this.requestOptions = requestOptions
  }

  private result(buffer: Buffer, matched: { supers: number; groups: number }, fetched: { supers: number; groups: number }): BlockMapV3FetchResult {
    return {
      buffer,
      wireBytes: this.wireBytes,
      requests: this.requests,
      matchedSupers: matched.supers,
      fetchedSupers: fetched.supers,
      matchedGroups: matched.groups,
      fetchedGroups: fetched.groups,
    }
  }

  async fetch(): Promise<BlockMapV3FetchResult> {
    const oldMap = this.decodeOldMap()
    if (oldMap == null) {
      const buffer = await this.fetchWhole()
      return this.verifiedWhole(buffer)
    }

    // 1. header + super-group table (+ whatever group entries / records fit into the first request)
    const first = await this.rangeRequest([{ start: 0, end: firstRangeSize(oldMap.header) }], true)
    if (first.status === 200) {
      // server ignored Range — the body is the whole file
      return this.verifiedWhole(first.body)
    }
    const header = parseBlockMapV3Header(first.body)
    const fileSize = blockMapV3Size(header)
    if (first.totalSize != null && first.totalSize !== fileSize) {
      throw new Error(`block map v3: remote size ${first.totalSize} does not match header (expected ${fileSize})`)
    }
    let prefix = first.body
    if (prefix.length >= fileSize) {
      // the whole file fit into the first request
      return this.verifiedWhole(prefix.subarray(0, fileSize))
    }
    const supersEnd = groupTableStart(header)
    if (prefix.length < supersEnd) {
      const rest = await this.rangeRequest([{ start: prefix.length, end: supersEnd }])
      if (rest.status === 200) {
        return this.verifiedWhole(rest.body)
      }
      prefix = Buffer.concat([prefix, rest.body])
    }
    const supers = parseBlockMapV3Supers(header, prefix)
    const buffer = Buffer.alloc(fileSize)
    const prefetched = Math.min(prefix.length, fileSize)
    prefix.copy(buffer, 0, 0, prefetched)

    // 2. super-groups: copy the group entries of matched ones from the old map, fetch the rest
    const superStage = planSuperStage(oldMap, header, supers, prefetched)
    const oldGroupEntryRanges = groupEntryRanges(oldMap.header, oldMap.supers)
    const newGroupEntryRanges = groupEntryRanges(header, supers)
    superStage.superMatch.forEach((oldIndex, index) => {
      if (oldIndex >= 0) {
        const from = oldGroupEntryRanges[oldIndex]
        this.options.oldMap!.copy(buffer, newGroupEntryRanges[index].start, from.start, from.end)
      }
    })
    const groupRanges = coalesce(superStage.fetch)
    if (groupRanges.length > 0) {
      const full = await this.fetchRanges(groupRanges, buffer)
      if (full != null) {
        return this.verifiedWhole(full)
      }
    }
    const groups = parseBlockMapV3Groups(header, buffer)

    // 3. groups: copy the records of matched ones from the old map, fetch the rest
    const recordStage = planRecordStage(oldMap, header, supers, groups, superStage.superMatch, prefetched)
    const oldRecordRanges = recordRanges(oldMap.header, oldMap.groups)
    const newRecordRanges = recordRanges(header, groups)
    recordStage.groupMatch.forEach((oldIndex, index) => {
      if (oldIndex >= 0) {
        const from = oldRecordRanges[oldIndex]
        this.options.oldMap!.copy(buffer, newRecordRanges[index].start, from.start, from.end)
      }
    })
    const ranges = coalesce(recordStage.fetch)
    if (ranges.length > 0) {
      const full = await this.fetchRanges(ranges, buffer)
      if (full != null) {
        return this.verifiedWhole(full)
      }
    }

    // 4. verify
    verifyBlockMapV3(buffer, header, supers, groups)
    const matched = { supers: superStage.matchedSupers, groups: recordStage.matchedGroups }
    const fetched = { supers: supers.length - superStage.matchedSupers, groups: groups.length - recordStage.matchedGroups }
    this.options.logger?.info?.(
      `Block map v3: ${matched.supers} of ${supers.length} super-groups and ${matched.groups} of ${groups.length} groups reused from the old map; ` +
        `${fetched.supers} super-group(s) fetched in ${groupRanges.length} range(s), ${fetched.groups} group(s) in ${ranges.length} range(s); ` +
        `${this.wireBytes} bytes / ${this.requests} request(s) for a ${fileSize}-byte map`
    )
    return this.result(buffer, matched, fetched)
  }

  private decodeOldMap() {
    const oldMap = this.options.oldMap
    if (oldMap == null || oldMap.length === 0) {
      return null
    }
    try {
      return decodeBlockMapV3(oldMap)
    } catch (e: any) {
      this.options.logger?.warn?.(`Cannot parse cached block map v3, downloading the whole new map: ${e.message || e}`)
      return null
    }
  }

  private verifiedWhole(body: Buffer): BlockMapV3FetchResult {
    const map = decodeBlockMapV3(body)
    const expected = blockMapV3Size(map.header)
    if (body.length !== expected) {
      throw new Error(`block map v3: file size ${body.length} does not match header (expected ${expected})`)
    }
    verifyBlockMapV3(body, map.header, map.supers, map.groups)
    return this.result(body, { supers: 0, groups: 0 }, { supers: map.supers.length, groups: map.groups.length })
  }

  private async fetchWhole(): Promise<Buffer> {
    const response = await this.doRequest(null)
    if (response.status !== 200 && response.status !== 206) {
      throw new Error(`block map v3: unexpected status ${response.status} for a full download`)
    }
    if (response.body.length === 0) {
      throw new Error(`Blockmap "${this.options.url.href}" is empty`)
    }
    return response.body
  }

  /**
   * Fetches `ranges` into `target`. Returns the whole file if the server answered a Range request with 200 (no Range support), else null.
   */
  private async fetchRanges(ranges: Array<ByteRange>, target: Buffer): Promise<Buffer | null> {
    const useMultipart = this.options.isUseMultipleRangeRequest !== false
    if (!useMultipart || ranges.length === 1) {
      for (const range of ranges) {
        const response = await this.rangeRequest([range])
        if (response.status === 200) {
          return response.body
        }
        response.body.copy(target, range.start)
      }
      return null
    }

    for (let i = 0; i < ranges.length; i += MAX_RANGES_PER_REQUEST) {
      const batch = ranges.slice(i, i + MAX_RANGES_PER_REQUEST)
      const response = await this.rangeRequest(batch)
      if (response.status === 200) {
        return response.body
      }
      if (batch.length === 1) {
        response.body.copy(target, batch[0].start)
        continue
      }
      const contentType = response.contentType || ""
      const m = /^multipart\/.+?\s*;\s*boundary=(?:"([^"]+)"|([^\s";]+))\s*$/i.exec(contentType)
      if (m == null) {
        throw new Error(`Content-Type "multipart/byteranges" is expected, but got "${contentType}"`)
      }
      const parts = parseMultipartByteRanges(response.body, m[1] || m[2])
      const expected = new Map<number, number>(batch.map(it => [it.start, it.end]))
      for (const part of parts) {
        const end = expected.get(part.start)
        if (end == null || part.end !== end) {
          throw new Error(`block map v3: unexpected part ${part.start}-${part.end - 1} in a multipart response`)
        }
        part.data.copy(target, part.start)
        expected.delete(part.start)
      }
      if (expected.size !== 0) {
        throw new Error(`block map v3: multipart response is missing ${expected.size} of ${batch.length} requested ranges`)
      }
    }
    return null
  }

  /**
   * Issues one Range request. A 206 body of a single range must have the requested length, unless `allowShort`
   * (the first request, which may exceed a small file and is then answered with the file's tail).
   */
  private async rangeRequest(ranges: Array<ByteRange>, allowShort = false): Promise<RangeResponse> {
    const response = await this.doRequest(ranges)
    if (response.status === 206) {
      if (ranges.length === 1) {
        const requested = ranges[0].end - ranges[0].start
        const received = response.body.length
        if (received > requested || (received < requested && !allowShort)) {
          throw new Error(`Received data length ${received} is not equal to expected ${requested}`)
        }
      }
      return response
    }
    if (response.status === 200) {
      this.options.logger?.warn?.(`Server ignored the Range request for ${this.options.url.href}, downloaded the whole block map`)
      return response
    }
    throw new Error(`block map v3: unexpected status ${response.status} for a Range request`)
  }

  private doRequest(ranges: Array<ByteRange> | null, redirectCount = 0): Promise<RangeResponse> {
    const { cancellationToken, httpExecutor } = this.options
    return cancellationToken.createPromise<RangeResponse>((resolve, reject, onCancel) => {
      const requestOptions: RequestOptions = { ...this.requestOptions, headers: { ...this.requestOptions.headers } }
      if (ranges == null) {
        delete requestOptions.headers!.range
      } else {
        requestOptions.headers!.range = `bytes=${ranges.map(it => `${it.start}-${it.end - 1}`).join(", ")}`
      }
      this.requests++
      const request = httpExecutor.createRequest(requestOptions, (response: IncomingMessage) => {
        response.on("error", reject)
        response.on("aborted", () => reject(new Error("response has been aborted by the server")))

        const status = response.statusCode || 0
        // NodeJS executor: redirects arrive as responses (Electron's net emits the "redirect" event below instead)
        const location = safeGetHeader(response, "location")
        if (status >= 300 && status < 400 && location != null) {
          response.resume()
          if (redirectCount >= MAX_REDIRECTS) {
            reject(new Error(`Too many redirects (> ${MAX_REDIRECTS})`))
            return
          }
          this.followRedirect(location)
          this.doRequest(ranges, redirectCount + 1).then(resolve, reject)
          return
        }
        if (status >= 400) {
          response.resume()
          reject(createHttpError(response))
          return
        }

        const chunks: Array<Buffer> = []
        response.on("data", (chunk: Buffer) => {
          this.wireBytes += chunk.length
          chunks.push(chunk)
        })
        response.on("end", () => {
          const contentRange = safeGetHeader(response, "content-range")
          const m = contentRange == null ? null : /bytes\s+(\d+)-(\d+)\/(\d+|\*)/i.exec(contentRange)
          resolve({
            status,
            body: Buffer.concat(chunks),
            contentType: safeGetHeader(response, "content-type"),
            totalSize: m != null && m[3] !== "*" ? parseInt(m[3], 10) : null,
          })
        })
      })
      request.on("redirect", (_statusCode: number, _method: string, redirectUrl: string) => {
        this.followRedirect(redirectUrl)
        request.followRedirect()
      })
      httpExecutor.addErrorAndTimeoutHandlers(request, reject)
      onCancel(() => request.abort())
      request.end()
    })
  }

  private followRedirect(redirectUrl: string) {
    this.options.logger?.info?.(`Redirect to ${redirectUrl.replace(/\?.*$/, "")}`)
    // later ranges go directly to the redirected location (e.g. GitHub → CDN)
    configureRequestUrl(new URL(redirectUrl), this.requestOptions)
  }
}

/**
 * Size of the first Range request: enough for the header, a super-group table 25 % (+16 super-groups) larger than the old
 * map's and the first few group entries — the new map is usually about the same size — clamped to
 * [MIN_FIRST_RANGE_SIZE, FIRST_RANGE_SIZE]. Bytes beyond the super-group table are group entry / record bytes and are
 * used; if the super-group table is larger than guessed, its rest costs one more request.
 */
export function firstRangeSize(oldHeader: BlockMapV3Header): number {
  const estimate = oldHeader.headerLen + Math.ceil(oldHeader.superCount * 1.25 + 16) * SUPER_SIZE + 8 * GROUP_SIZE
  return Math.min(FIRST_RANGE_SIZE, Math.max(MIN_FIRST_RANGE_SIZE, estimate))
}

function superKey(sup: BlockMapV3Super): string {
  return `${sup.hash}:${sup.groupCount}:${sup.blockCount}`
}

function groupKey(group: BlockMapV3Group): string {
  return `${group.hash}:${group.byteLength}:${group.blockCount}`
}

export interface SuperStagePlan {
  /** per new super-group: the index of the old super-group with the same (hash, groupCount, blockCount), or -1 */
  superMatch: Array<number>
  matchedSupers: number
  /** group entry byte ranges of the unmatched super-groups that the first request did not already cover (file order, uncoalesced) */
  fetch: Array<ByteRange>
}

/** Stage 2 of the fetch, as a pure function of the old map and the new header + super-group table (`prefetched` = bytes of the new file already in hand). */
export function planSuperStage(oldMap: BlockMapV3, header: BlockMapV3Header, supers: Array<BlockMapV3Super>, prefetched: number): SuperStagePlan {
  const oldByKey = new Map<string, number>()
  oldMap.supers.forEach((sup, index) => {
    if (!oldByKey.has(superKey(sup))) {
      oldByKey.set(superKey(sup), index)
    }
  })
  const ranges = groupEntryRanges(header, supers)
  const superMatch: Array<number> = []
  const fetch: Array<ByteRange> = []
  let matchedSupers = 0
  supers.forEach((sup, index) => {
    const oldIndex = oldByKey.get(superKey(sup))
    if (oldIndex != null) {
      matchedSupers++
      superMatch.push(oldIndex)
    } else {
      superMatch.push(-1)
      const range = ranges[index]
      if (range.end > prefetched) {
        fetch.push({ start: Math.max(range.start, prefetched), end: range.end })
      }
    }
  })
  return { superMatch, matchedSupers, fetch }
}

export interface RecordStagePlan {
  /** per new group: the index of the old group whose records are byte-identical, or -1 */
  groupMatch: Array<number>
  matchedGroups: number
  /** record byte ranges of the unmatched groups that earlier requests did not already cover (file order, uncoalesced) */
  fetch: Array<ByteRange>
}

/**
 * Stage 3 of the fetch, as a pure function of the old map and the complete new group table. Groups of a matched
 * super-group are matched to the old super-group's groups positionally (their entries are byte-identical); every
 * other group is matched by (hash, byteLength, blockCount) against all old groups.
 */
export function planRecordStage(
  oldMap: BlockMapV3,
  header: BlockMapV3Header,
  supers: Array<BlockMapV3Super>,
  groups: Array<BlockMapV3Group>,
  superMatch: Array<number>,
  prefetched: number
): RecordStagePlan {
  const oldByKey = new Map<string, number>()
  oldMap.groups.forEach((group, index) => {
    if (!oldByKey.has(groupKey(group))) {
      oldByKey.set(groupKey(group), index)
    }
  })
  const oldSuperFirstGroup: Array<number> = []
  let g = 0
  for (const sup of oldMap.supers) {
    oldSuperFirstGroup.push(g)
    g += sup.groupCount
  }
  const ranges = recordRanges(header, groups)
  const groupMatch: Array<number> = new Array(groups.length).fill(-1)
  let matchedGroups = 0
  let groupIndex = 0
  supers.forEach((sup, superIndex) => {
    const oldSuper = superMatch[superIndex]
    for (let i = 0; i < sup.groupCount; i++, groupIndex++) {
      let oldIndex = oldSuper >= 0 ? oldSuperFirstGroup[oldSuper] + i : -1
      if (oldIndex < 0) {
        oldIndex = oldByKey.get(groupKey(groups[groupIndex])) ?? -1
      }
      if (oldIndex >= 0) {
        matchedGroups++
        groupMatch[groupIndex] = oldIndex
      }
    }
  })
  const fetch: Array<ByteRange> = []
  groups.forEach((_group, index) => {
    const range = ranges[index]
    if (groupMatch[index] < 0 && range.end > prefetched) {
      fetch.push({ start: Math.max(range.start, prefetched), end: range.end })
    }
  })
  return { groupMatch, matchedGroups, fetch }
}

/** Merges adjacent ranges and ranges separated by at most COALESCE_GAP_BYTES (ranges must be sorted and non-overlapping). */
export function coalesce(ranges: Array<ByteRange>, maxGap = COALESCE_GAP_BYTES): Array<ByteRange> {
  const result: Array<ByteRange> = []
  for (const range of ranges) {
    const last = result[result.length - 1]
    if (last != null && range.start - last.end <= maxGap) {
      last.end = Math.max(last.end, range.end)
    } else {
      result.push({ start: range.start, end: range.end })
    }
  }
  return result
}

/**
 * Verifies that every super-group's group entries hash to its super hash and sum to its group/block counts, that every
 * group's records hash to its group hash and sum to its byteLength/blockCount, and that the map covers fileSize.
 */
export function verifyBlockMapV3(buffer: Buffer, header: BlockMapV3Header, supers: Array<BlockMapV3Super>, groups: Array<BlockMapV3Group>): void {
  if (supers.length !== header.superCount) {
    throw new Error(`block map v3: super-group count ${supers.length} does not match header ${header.superCount}`)
  }
  if (groups.length !== header.groupCount) {
    throw new Error(`block map v3: group count ${groups.length} does not match header ${header.groupCount}`)
  }
  if (buffer.length !== blockMapV3Size(header)) {
    throw new Error(`block map v3: file size ${buffer.length} does not match header (expected ${blockMapV3Size(header)})`)
  }
  let entryOffset = groupTableStart(header)
  let groupIndex = 0
  supers.forEach((sup, index) => {
    const end = entryOffset + sup.groupCount * GROUP_SIZE
    if (superHashOfGroups(buffer.subarray(entryOffset, end)) !== sup.hash) {
      throw new Error(`block map v3: super-group ${index} hash mismatch`)
    }
    let blockCount = 0
    for (let i = 0; i < sup.groupCount; i++, groupIndex++) {
      blockCount += groups[groupIndex]?.blockCount ?? 0
    }
    if (blockCount !== sup.blockCount) {
      throw new Error(`block map v3: super-group ${index} block count ${blockCount} does not match ${sup.blockCount}`)
    }
    entryOffset = end
  })
  if (groupIndex !== groups.length) {
    throw new Error("block map v3: super-group group counts do not sum to groupCount")
  }
  let offset = recordsStart(header)
  let blocks = 0
  let bytes = 0
  groups.forEach((group, index) => {
    const end = offset + group.blockCount * RECORD_SIZE
    const recordBytes = buffer.subarray(offset, end)
    if (groupHashOfRecords(recordBytes) !== group.hash) {
      throw new Error(`block map v3: group ${index} hash mismatch`)
    }
    let byteLength = 0
    for (const record of parseBlockMapV3Records(recordBytes, 0, group.blockCount)) {
      byteLength += record.size
    }
    if (byteLength !== group.byteLength) {
      throw new Error(`block map v3: group ${index} byte length ${byteLength} does not match ${group.byteLength}`)
    }
    blocks += group.blockCount
    bytes += byteLength
    offset = end
  })
  if (blocks !== header.blockCount) {
    throw new Error("block map v3: group block counts do not sum to blockCount")
  }
  if (bytes !== header.fileSize) {
    throw new Error(`block map v3: blocks cover ${bytes} bytes, file size is ${header.fileSize}`)
  }
}

interface MultipartPart {
  start: number
  /** exclusive */
  end: number
  data: Buffer
}

/** Parses a buffered `multipart/byteranges` body; parts are located by their Content-Range headers. */
export function parseMultipartByteRanges(body: Buffer, boundary: string): Array<MultipartPart> {
  const delimiter = Buffer.from(`--${boundary}`, "latin1")
  const parts: Array<MultipartPart> = []
  let position = body.indexOf(delimiter)
  while (position !== -1) {
    position += delimiter.length
    if (body[position] === 0x2d && body[position + 1] === 0x2d) {
      // closing delimiter "--boundary--"
      break
    }
    const headerEnd = body.indexOf("\r\n\r\n", position, "latin1")
    if (headerEnd === -1) {
      throw new Error("block map v3: malformed multipart part (no header terminator)")
    }
    const headers = body.toString("latin1", position, headerEnd)
    const m = /content-range:\s*bytes\s+(\d+)-(\d+)\/(\d+|\*)/i.exec(headers)
    if (m == null) {
      throw new Error("block map v3: multipart part without Content-Range")
    }
    const start = parseInt(m[1], 10)
    const end = parseInt(m[2], 10) + 1
    const dataStart = headerEnd + 4
    const dataEnd = dataStart + (end - start)
    if (dataEnd > body.length) {
      throw new Error("block map v3: truncated multipart part")
    }
    parts.push({ start, end, data: body.subarray(dataStart, dataEnd) })
    position = body.indexOf(delimiter, dataEnd)
  }
  return parts
}
