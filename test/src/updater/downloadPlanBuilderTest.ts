import { BlockMap } from "builder-util-runtime/src/blockMapApi"
import { computeOperations, OperationKind } from "electron-updater/src/differentialDownloader/downloadPlanBuilder"
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
