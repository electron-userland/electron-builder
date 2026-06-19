import { Arch } from "builder-util"
import {
  archToNodeCpu,
  buildSingleArchFilesPattern,
  collectIdenticalSingleArchMachOFiles,
  collectSingleArchPackageNames,
  isPackageCompatible,
  isSingleArchPackage,
} from "app-builder-lib/src/util/archCompatibility"
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import * as path from "path"

describe("archToNodeCpu", () => {
  const cases: Array<[Arch, string | null]> = [
    [Arch.ia32, "ia32"],
    [Arch.x64, "x64"],
    [Arch.armv7l, "arm"],
    [Arch.arm64, "arm64"],
    [Arch.universal, null],
  ]
  for (const [arch, expected] of cases) {
    test(`${Arch[arch]} -> ${expected}`, ({ expect }) => {
      expect(archToNodeCpu(arch)).toBe(expected)
    })
  }
})

describe("isPackageCompatible", () => {
  // @esbuild/darwin-arm64 — the package from issue #9865
  const esbuildArm = { os: ["darwin"], cpu: ["arm64"] }

  test("single-arch package incompatible with mismatched cpu (x64 slice drops arm64 binary)", ({ expect }) => {
    expect(isPackageCompatible(esbuildArm, "x64", "darwin")).toBe(false)
  })
  test("single-arch package compatible with matching cpu", ({ expect }) => {
    expect(isPackageCompatible(esbuildArm, "arm64", "darwin")).toBe(true)
  })
  test("os mismatch excludes the package regardless of cpu", ({ expect }) => {
    expect(isPackageCompatible(esbuildArm, "x64", "win32")).toBe(false)
  })
  test("plain JS package (no cpu/os) is always compatible", ({ expect }) => {
    expect(isPackageCompatible({}, "x64", "darwin")).toBe(true)
    expect(isPackageCompatible({ os: null, cpu: null }, "x64", "linux")).toBe(true)
  })
  test("multi-arch native package is compatible with both arches", ({ expect }) => {
    const both = { cpu: ["x64", "arm64"], os: ["darwin"] }
    expect(isPackageCompatible(both, "x64", "darwin")).toBe(true)
    expect(isPackageCompatible(both, "arm64", "darwin")).toBe(true)
  })
  test("negation `!ia32` excludes only ia32", ({ expect }) => {
    expect(isPackageCompatible({ cpu: ["!ia32"] }, "x64", "darwin")).toBe(true)
    expect(isPackageCompatible({ cpu: ["!ia32"] }, "ia32", "darwin")).toBe(false)
  })
  test("`any` cpu is always compatible", ({ expect }) => {
    expect(isPackageCompatible({ cpu: ["any"] }, "ia32", "darwin")).toBe(true)
  })
  test("string (non-array) cpu/os values are supported", ({ expect }) => {
    expect(isPackageCompatible({ cpu: "arm64", os: "darwin" }, "x64", "darwin")).toBe(false)
    expect(isPackageCompatible({ cpu: "arm64", os: "darwin" }, "arm64", "darwin")).toBe(true)
  })
  test("null target cpu (e.g. universal) skips cpu filtering", ({ expect }) => {
    expect(isPackageCompatible(esbuildArm, null, "darwin")).toBe(true)
  })
})

describe("isSingleArchPackage", () => {
  test("arm64-only package is single-arch", ({ expect }) => {
    expect(isSingleArchPackage({ os: ["darwin"], cpu: ["arm64"] })).toBe(true)
  })
  test("x64-only package is single-arch", ({ expect }) => {
    expect(isSingleArchPackage({ cpu: ["x64"] })).toBe(true)
  })
  test("package covering both x64 and arm64 is NOT single-arch", ({ expect }) => {
    expect(isSingleArchPackage({ cpu: ["x64", "arm64"] })).toBe(false)
  })
  test("package with no cpu constraint is NOT single-arch", ({ expect }) => {
    expect(isSingleArchPackage({})).toBe(false)
    expect(isSingleArchPackage({ os: ["darwin"] })).toBe(false)
  })
  test("negation `!ia32` covers both x64 and arm64, so NOT single-arch", ({ expect }) => {
    expect(isSingleArchPackage({ cpu: ["!ia32"] })).toBe(false)
  })
})

async function writePackage(nodeModulesDir: string, name: string, fields: Record<string, unknown>): Promise<void> {
  const dir = path.join(nodeModulesDir, ...name.split("/"))
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, "package.json"), JSON.stringify({ name, version: "1.0.0", ...fields }))
}

describe("collectSingleArchPackageNames", () => {
  test("finds single-arch packages, including scoped and nested, ignoring multi-arch/plain", async ({ expect }) => {
    const root = await mkdtemp(path.join(tmpdir(), "eb-arch-"))
    try {
      const nm = path.join(root, "node_modules")
      await writePackage(nm, "lodash", {}) // plain JS — ignored
      await writePackage(nm, "@scope/multi", { cpu: ["x64", "arm64"], os: ["darwin"] }) // universal-capable — ignored
      await writePackage(nm, "@esbuild/darwin-arm64", { cpu: ["arm64"], os: ["darwin"] }) // single-arch (scoped)
      await writePackage(nm, "esbuild", {}) // host package — plain
      await writePackage(path.join(nm, "esbuild", "node_modules"), "@swc/core-darwin-arm64", { cpu: ["arm64"], os: ["darwin"] }) // single-arch (nested)

      const names = await collectSingleArchPackageNames(nm)
      expect(Array.from(names).sort()).toEqual(["@esbuild/darwin-arm64", "@swc/core-darwin-arm64"])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("returns empty for a non-existent node_modules directory", async ({ expect }) => {
    const names = await collectSingleArchPackageNames(path.join(tmpdir(), "does-not-exist-eb-arch"))
    expect(names.size).toBe(0)
  })
})

describe("buildSingleArchFilesPattern", () => {
  // mirrors @electron/universal's matchGlob (node's path.matchesGlob), relative to app.asar.unpacked
  const matches = (pattern: string | undefined, file: string) => pattern != null && path.matchesGlob(file, pattern)
  // patterns as produced by computeSingleArchFiles: whole-package globs + exact Mach-O file paths
  const esbuildPkgPattern = "**/@esbuild/darwin-arm64/**"
  const esbuildBinFile = "node_modules/esbuild/bin/esbuild"
  const esbuildPkgFile = "node_modules/@esbuild/darwin-arm64/bin/esbuild"
  const swcPkgPattern = "**/@swc/core-darwin-arm64/**"
  const swcFile = "node_modules/foo/node_modules/@swc/core-darwin-arm64/swc.darwin-arm64.node"
  const plainFile = "node_modules/lodash/index.js"

  test("no patterns returns the user pattern unchanged (undefined when none)", ({ expect }) => {
    expect(buildSingleArchFilesPattern([], undefined)).toBeUndefined()
    expect(buildSingleArchFilesPattern([], "custom/**")).toBe("custom/**")
  })

  test("a single pattern is returned as-is", ({ expect }) => {
    const pattern = buildSingleArchFilesPattern([esbuildPkgPattern], undefined)
    expect(matches(pattern, esbuildPkgFile)).toBe(true)
    expect(matches(pattern, swcFile)).toBe(false)
    expect(matches(pattern, plainFile)).toBe(false)
  })

  test("combines a package glob and an exact Mach-O file path into one pattern", ({ expect }) => {
    const pattern = buildSingleArchFilesPattern([esbuildPkgPattern, esbuildBinFile], undefined)
    expect(matches(pattern, esbuildPkgFile)).toBe(true) // covered by package glob
    expect(matches(pattern, esbuildBinFile)).toBe(true) // covered by exact file path
    expect(matches(pattern, plainFile)).toBe(false)
  })

  test("combines multiple package globs", ({ expect }) => {
    const pattern = buildSingleArchFilesPattern([esbuildPkgPattern, swcPkgPattern], undefined)
    expect(matches(pattern, esbuildPkgFile)).toBe(true)
    expect(matches(pattern, swcFile)).toBe(true)
    expect(matches(pattern, plainFile)).toBe(false)
  })

  test("merges with a user-provided pattern (both still match)", ({ expect }) => {
    const pattern = buildSingleArchFilesPattern([esbuildPkgPattern], "node_modules/custom-tool/**")
    expect(matches(pattern, esbuildPkgFile)).toBe(true)
    expect(matches(pattern, "node_modules/custom-tool/bin/run")).toBe(true)
    expect(matches(pattern, plainFile)).toBe(false)
  })

  test("dedups and sorts patterns", ({ expect }) => {
    expect(buildSingleArchFilesPattern(["b/**", "a/**", "b/**"], undefined)).toBe("{a/**,b/**}")
  })
})

describe("collectIdenticalSingleArchMachOFiles", () => {
  // 64-bit Mach-O on disk starts with the little-endian magic CF FA ED FE; fat/universal starts with CA FE BA BE.
  const machoBytes = (suffix: string) => Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.from(suffix)])
  const fatBytes = Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x02])

  async function writeFileTree(root: string, files: Record<string, Buffer | string>) {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, rel)
      await mkdir(path.dirname(abs), { recursive: true })
      await writeFile(abs, content)
    }
  }

  test("flags single-arch Mach-O files identical in both slices; ignores per-arch, fat, and non-Mach-O", async ({ expect }) => {
    const base = await mkdtemp(path.join(tmpdir(), "eb-macho-"))
    try {
      const x64 = path.join(base, "x64")
      const arm64 = path.join(base, "arm64")
      // identical host binary in both slices (the esbuild/bin/esbuild case) -> flagged
      await writeFileTree(x64, { "node_modules/esbuild/bin/esbuild": machoBytes("HOST") })
      await writeFileTree(arm64, { "node_modules/esbuild/bin/esbuild": machoBytes("HOST") })
      // per-arch native addon (different content) -> NOT flagged (lipo-mergeable)
      await writeFileTree(x64, { "node_modules/native/build/Release/a.node": machoBytes("X64") })
      await writeFileTree(arm64, { "node_modules/native/build/Release/a.node": machoBytes("ARM64") })
      // fat/universal binary identical in both -> NOT flagged (already universal)
      await writeFileTree(x64, { "node_modules/fat/bin/tool": fatBytes })
      await writeFileTree(arm64, { "node_modules/fat/bin/tool": fatBytes })
      // plain JS identical in both -> NOT flagged (not Mach-O)
      await writeFileTree(x64, { "node_modules/lodash/index.js": "module.exports = {}" })
      await writeFileTree(arm64, { "node_modules/lodash/index.js": "module.exports = {}" })
      // single-arch Mach-O present only in one slice -> NOT flagged here (handled by the package scan)
      await writeFileTree(arm64, { "node_modules/@esbuild/darwin-arm64/bin/esbuild": machoBytes("ARM") })

      const flagged = await collectIdenticalSingleArchMachOFiles(x64, arm64)
      expect(flagged).toEqual(["node_modules/esbuild/bin/esbuild"])
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  test("returns empty when a slice directory does not exist", async ({ expect }) => {
    const flagged = await collectIdenticalSingleArchMachOFiles(path.join(tmpdir(), "missing-eb-a"), path.join(tmpdir(), "missing-eb-b"))
    expect(flagged).toEqual([])
  })
})
