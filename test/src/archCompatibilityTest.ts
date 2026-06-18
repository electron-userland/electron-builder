import { Arch } from "builder-util"
import { archToNodeCpu, buildSingleArchFilesPattern, collectSingleArchPackageNames, isPackageCompatible, isSingleArchPackage } from "app-builder-lib/src/util/archCompatibility"
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
  const esbuildFile = "node_modules/@esbuild/darwin-arm64/bin/esbuild"
  const swcFile = "node_modules/foo/node_modules/@swc/core-darwin-arm64/swc.darwin-arm64.node"
  const plainFile = "node_modules/lodash/index.js"

  test("no names returns the user pattern unchanged (undefined when none)", ({ expect }) => {
    expect(buildSingleArchFilesPattern([], undefined)).toBeUndefined()
    expect(buildSingleArchFilesPattern([], "custom/**")).toBe("custom/**")
  })

  test("single package pattern matches that package anywhere, not others", ({ expect }) => {
    const pattern = buildSingleArchFilesPattern(["@esbuild/darwin-arm64"], undefined)
    expect(matches(pattern, esbuildFile)).toBe(true)
    expect(matches(pattern, swcFile)).toBe(false)
    expect(matches(pattern, plainFile)).toBe(false)
  })

  test("multiple packages are combined into one brace pattern", ({ expect }) => {
    const pattern = buildSingleArchFilesPattern(["@esbuild/darwin-arm64", "@swc/core-darwin-arm64"], undefined)
    expect(matches(pattern, esbuildFile)).toBe(true)
    expect(matches(pattern, swcFile)).toBe(true)
    expect(matches(pattern, plainFile)).toBe(false)
  })

  test("merges with a user-provided pattern (both still match)", ({ expect }) => {
    const pattern = buildSingleArchFilesPattern(["@esbuild/darwin-arm64"], "node_modules/custom-tool/**")
    expect(matches(pattern, esbuildFile)).toBe(true)
    expect(matches(pattern, "node_modules/custom-tool/bin/run")).toBe(true)
    expect(matches(pattern, plainFile)).toBe(false)
  })

  test("dedups and sorts names", ({ expect }) => {
    expect(buildSingleArchFilesPattern(["b", "a", "b"], undefined)).toBe("**/{a,b}/**")
  })
})
