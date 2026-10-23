import { BlockMap } from "builder-util-runtime/internal"
import {
  coalesceDownloadGaps,
  computeOperations,
  DOWNLOAD_GAP_COALESCE_THRESHOLD,
  downloadGapCoalesceThreshold,
  MULTIPART_DOWNLOAD_GAP_COALESCE_THRESHOLD,
  Operation,
  OperationKind,
} from "electron-updater/src/differentialDownloader/downloadPlanBuilder"
import { describe, expect, test } from "vitest"
import type { Logger } from "electron-updater/src/types"

function makeBlockMap(checksums: string[], sizes: number[], offset = 0, name = "file"): BlockMap {
  return { version: "2", files: [{ name, offset, checksums, sizes }] }
}

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

function captureLogger(): Logger & { warns: string[]; debugs: string[] } {
  const warns: string[] = []
  const debugs: string[] = []
  return {
    info: () => {},
    warn: (msg: string) => warns.push(msg),
    error: () => {},
    debug: (msg: string) => debugs.push(msg),
    warns,
    debugs,
  }
}

describe("computeOperations", () => {
  test("all blocks match produces a single merged COPY operation", () => {
    const bm = makeBlockMap(["a", "b", "c"], [100, 100, 100])
    const ops = computeOperations(bm, bm, noopLogger)
    expect(ops).toHaveLength(1)
    expect(ops[0].kind).toBe(OperationKind.COPY)
    expect(ops[0].start).toBe(0)
    expect(ops[0].end).toBe(300)
  })

  test("no blocks match produces a single merged DOWNLOAD operation", () => {
    const old = makeBlockMap(["a", "b", "c"], [100, 100, 100])
    const next = makeBlockMap(["x", "y", "z"], [100, 100, 100])
    const ops = computeOperations(old, next, noopLogger)
    expect(ops).toHaveLength(1)
    expect(ops[0].kind).toBe(OperationKind.DOWNLOAD)
    expect(ops[0].start).toBe(0)
    expect(ops[0].end).toBe(300)
  })

  test("alternating match / no-match produces interleaved COPY and DOWNLOAD ops", () => {
    const old = makeBlockMap(["a", "b", "c", "d"], [100, 100, 100, 100])
    // blocks "a" and "c" match; "x" and "y" do not
    const next = makeBlockMap(["a", "x", "c", "y"], [100, 100, 100, 100])
    const ops = computeOperations(old, next, noopLogger)
    expect(ops).toHaveLength(4)
    expect(ops[0]).toMatchObject({ kind: OperationKind.COPY, start: 0, end: 100 })
    expect(ops[1]).toMatchObject({ kind: OperationKind.DOWNLOAD, start: 100, end: 200 })
    expect(ops[2]).toMatchObject({ kind: OperationKind.COPY, start: 200, end: 300 })
    expect(ops[3]).toMatchObject({ kind: OperationKind.DOWNLOAD, start: 300, end: 400 })
  })

  test("consecutive matching blocks are merged into one COPY op", () => {
    const old = makeBlockMap(["a", "b"], [100, 200])
    const next = makeBlockMap(["a", "b"], [100, 200])
    const ops = computeOperations(old, next, noopLogger)
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: OperationKind.COPY, start: 0, end: 300 })
  })

  test("consecutive non-matching blocks are merged into one DOWNLOAD op", () => {
    const old = makeBlockMap(["a", "b"], [100, 200])
    const next = makeBlockMap(["x", "y"], [100, 200])
    const ops = computeOperations(old, next, noopLogger)
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: OperationKind.DOWNLOAD, start: 0, end: 300 })
  })

  test("checksum match with different block size logs warning and forces DOWNLOAD", () => {
    const log = captureLogger()
    const old = makeBlockMap(["a"], [100])
    const next = makeBlockMap(["a"], [200]) // same checksum, different size
    const ops = computeOperations(old, next, log)
    expect(ops).toHaveLength(1)
    expect(ops[0].kind).toBe(OperationKind.DOWNLOAD)
    expect(log.warns.some(w => w.includes("size differs"))).toBe(true)
  })

  test("missing file name in old blockmap throws", () => {
    const old = makeBlockMap(["a"], [100], 0, "file")
    const next = makeBlockMap(["a"], [100], 0, "other-file")
    expect(() => computeOperations(old, next, noopLogger)).toThrow("no file other-file in old blockmap")
  })

  test("single-block file that matches is a COPY", () => {
    const bm = makeBlockMap(["abc123"], [512])
    const ops = computeOperations(bm, bm, noopLogger)
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: OperationKind.COPY, start: 0, end: 512 })
  })

  test("single-block file that doesn't match is a DOWNLOAD", () => {
    const old = makeBlockMap(["abc123"], [512])
    const next = makeBlockMap(["xyz999"], [512])
    const ops = computeOperations(old, next, noopLogger)
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: OperationKind.DOWNLOAD, start: 0, end: 512 })
  })

  test("non-zero blockmap file offset is respected in COPY start position", () => {
    // Old file starts at byte offset 1000 in its container
    const old = makeBlockMap(["a", "b"], [100, 100], 1000)
    const next = makeBlockMap(["a", "b"], [100, 100], 0)
    const ops = computeOperations(old, next, noopLogger)
    // new offset starts at 0; COPY refers to OLD positions (1000, 1200)
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: OperationKind.COPY, start: 1000, end: 1200 })
  })
})

describe("buildChecksumMap (via computeOperations duplicate-checksum behavior)", () => {
  test("duplicate checksum in old blockmap uses first occurrence offset", () => {
    const log = captureLogger()
    // Old: two blocks with same checksum "dup" at offsets 0 and 100
    const old = makeBlockMap(["dup", "dup"], [100, 100])
    // New: one block with checksum "dup" — should copy from offset 0 (first occurrence)
    const next = makeBlockMap(["dup"], [100])
    const ops = computeOperations(old, next, log)
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: OperationKind.COPY, start: 0, end: 100 })
    // debug log emitted for the duplicate
    expect(log.debugs.some(d => d.includes("duplicated"))).toBe(true)
  })

  test("duplicate checksum with same size logs same-size note", () => {
    const log = captureLogger()
    const old = makeBlockMap(["dup", "dup"], [100, 100])
    const next = makeBlockMap(["dup"], [100])
    computeOperations(old, next, log)
    expect(log.debugs.some(d => d.includes("same size"))).toBe(true)
  })

  test("duplicate checksum with different sizes logs different-size note", () => {
    const log = captureLogger()
    // Two blocks with same checksum but different sizes (unusual but possible)
    const old = makeBlockMap(["dup", "dup"], [100, 200])
    const next = makeBlockMap(["dup"], [100])
    computeOperations(old, next, log)
    expect(log.debugs.some(d => d.includes("size:"))).toBe(true)
  })
})

describe("downloadGapCoalesceThreshold", () => {
  test("single-range hosts download through gaps up to 8 KiB, multipart hosts only through a few hundred bytes", () => {
    expect(downloadGapCoalesceThreshold(false)).toBe(DOWNLOAD_GAP_COALESCE_THRESHOLD)
    expect(downloadGapCoalesceThreshold(undefined)).toBe(DOWNLOAD_GAP_COALESCE_THRESHOLD)
    expect(downloadGapCoalesceThreshold(true)).toBe(MULTIPART_DOWNLOAD_GAP_COALESCE_THRESHOLD)
    // a multipart range costs ~120 B of part framing: never worth more than a few hundred bytes of re-download
    expect(MULTIPART_DOWNLOAD_GAP_COALESCE_THRESHOLD).toBeLessThan(1024)
    expect(MULTIPART_DOWNLOAD_GAP_COALESCE_THRESHOLD).toBeLessThan(DOWNLOAD_GAP_COALESCE_THRESHOLD)
  })

  test("a 3 KiB gap is downloaded through on a single-range host and kept as a COPY on a multipart host", () => {
    // contiguous in the new file: DOWNLOAD [0,1000) COPY [1000,4072) DOWNLOAD [4072,6000)
    const ops: Array<Operation> = [
      { kind: OperationKind.DOWNLOAD, start: 0, end: 1000 },
      { kind: OperationKind.COPY, start: 1000, end: 4072 },
      { kind: OperationKind.DOWNLOAD, start: 4072, end: 6000 },
    ]
    expect(coalesceDownloadGaps(ops, downloadGapCoalesceThreshold(false))).toEqual([{ kind: OperationKind.DOWNLOAD, start: 0, end: 6000 }])
    expect(coalesceDownloadGaps(ops, downloadGapCoalesceThreshold(true))).toEqual(ops)
  })
})

describe("coalesceDownloadGaps", () => {
  const D = (start: number, end: number): Operation => ({ kind: OperationKind.DOWNLOAD, start, end })
  const C = (start: number, end: number): Operation => ({ kind: OperationKind.COPY, start, end })
  const totalLength = (ops: Array<Operation>) => ops.reduce((sum, op) => sum + (op.end - op.start), 0)
  const downloadLength = (ops: Array<Operation>) => ops.filter(op => op.kind === OperationKind.DOWNLOAD).reduce((sum, op) => sum + (op.end - op.start), 0)

  test("default threshold is 8 KiB", () => {
    expect(DOWNLOAD_GAP_COALESCE_THRESHOLD).toBe(8 * 1024)
  })

  test("a COPY gap below the threshold between two DOWNLOADs is downloaded through", () => {
    // new-file layout: [0,100) download, [100,200) copied from old offset 5000, [200,300) download
    const ops = [D(0, 100), C(5000, 5100), D(200, 300)]
    const result = coalesceDownloadGaps(ops, 1000)
    expect(result).toEqual([D(0, 300)])
    expect(totalLength(result)).toBe(totalLength(ops))
    expect(downloadLength(result)).toBe(300)
  })

  test("a COPY gap at or above the threshold is kept", () => {
    const ops = [D(0, 100), C(5000, 6000), D(1100, 1200)]
    expect(coalesceDownloadGaps(ops, 1000)).toEqual(ops)
    // strictly below: a gap of exactly the threshold is not merged
    expect(coalesceDownloadGaps(ops, 1000)[1]).toBe(ops[1])
    expect(coalesceDownloadGaps(ops, 1001)).toEqual([D(0, 1200)])
  })

  test("uses the 8 KiB default threshold", () => {
    const small = [D(0, 100), C(0, 8 * 1024 - 1), D(100 + 8 * 1024 - 1, 8 * 1024 + 200)]
    expect(coalesceDownloadGaps(small)).toEqual([D(0, 8 * 1024 + 200)])
    const large = [D(0, 100), C(0, 8 * 1024), D(100 + 8 * 1024, 8 * 1024 + 200)]
    expect(coalesceDownloadGaps(large)).toEqual(large)
  })

  test("chains of small gaps collapse into one DOWNLOAD and totals are preserved", () => {
    const ops = [C(0, 1000), D(1000, 1100), C(9000, 9050), D(1150, 1250), C(3000, 3010), C(7000, 7020), D(1280, 1400), C(1400, 2000)]
    const result = coalesceDownloadGaps(ops, 100)
    expect(result).toEqual([C(0, 1000), D(1000, 1400), C(1400, 2000)])
    expect(totalLength(result)).toBe(totalLength(ops))
    // downloaded bytes grow by exactly the gaps that were downloaded through
    expect(downloadLength(result)).toBe(downloadLength(ops) + 50 + 10 + 20)
  })

  test("several COPY ops between two DOWNLOADs count as one gap", () => {
    const ops = [D(0, 100), C(10, 60), C(500, 560), D(210, 300)]
    expect(coalesceDownloadGaps(ops, 200)).toEqual([D(0, 300)])
    // ... and are kept when their sum reaches the threshold
    expect(coalesceDownloadGaps(ops, 110)).toEqual(ops)
  })

  test("COPY-only and DOWNLOAD-only plans are returned untouched", () => {
    const copyOnly = [C(0, 100), C(5000, 5100)]
    expect(coalesceDownloadGaps(copyOnly)).toEqual(copyOnly)
    const downloadOnly = [D(0, 100)]
    expect(coalesceDownloadGaps(downloadOnly)).toEqual(downloadOnly)
    expect(coalesceDownloadGaps([])).toEqual([])
  })

  test("leading and trailing COPY ops are never merged", () => {
    const ops = [C(100, 110), D(10, 20), C(300, 310)]
    expect(coalesceDownloadGaps(ops, 1000)).toEqual(ops)
  })

  test("does not merge when the operations are not contiguous in the new file", () => {
    // defensive: the second DOWNLOAD does not start where the gap ends
    const ops = [D(0, 100), C(5000, 5010), D(500, 600)]
    expect(coalesceDownloadGaps(ops, 1000)).toEqual(ops)
  })

  test("a non-positive threshold disables coalescing", () => {
    const ops = [D(0, 100), C(0, 10), D(110, 200)]
    expect(coalesceDownloadGaps(ops, 0)).toBe(ops)
  })

  test("works on the output of computeOperations and keeps the size invariant", () => {
    const sizes = [100, 100, 100, 100, 100, 100]
    const old = makeBlockMap(["a", "b", "c", "d", "e", "f"], sizes)
    // x and y are new; b, c (a 200 B gap) are reused, then e, f are reused
    const next = makeBlockMap(["x", "b", "c", "y", "e", "f"], sizes)
    const ops = computeOperations(old, next, noopLogger)
    expect(ops).toEqual([D(0, 100), C(100, 300), D(300, 400), C(400, 600)])
    const merged = coalesceDownloadGaps(ops, 201)
    expect(merged).toEqual([D(0, 400), C(400, 600)])
    expect(totalLength(merged)).toBe(600)
    expect(coalesceDownloadGaps(ops, 200)).toEqual(ops)
  })
})
