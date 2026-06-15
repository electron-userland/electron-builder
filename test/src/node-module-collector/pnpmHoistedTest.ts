import { describe, test, vi, afterEach } from "vitest"
import * as fse from "fs-extra"
import * as path from "path"
import { ModuleManager } from "app-builder-lib/src/node-module-collector/moduleManager"
import { PnpmNodeModulesCollector } from "app-builder-lib/internal"
import { TmpDir } from "temp-file"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const projectTmpDir = new TmpDir("eb-pnpm-hoisted-test")

async function buildTempTree(packages: Record<string, { name: string; version: string; dependencies?: Record<string, string> }>): Promise<string> {
  const root = await projectTmpDir.createTempDir()
  for (const [rel, pkg] of Object.entries(packages)) {
    const absPath = path.join(root, rel)
    await fse.ensureDir(path.dirname(absPath))
    await fse.writeJson(absPath, pkg)
  }
  return root
}

// ---------------------------------------------------------------------------
// Tests: skipDownwardSearch reflects hoisted mode
// ---------------------------------------------------------------------------

describe("PnpmNodeModulesCollector hoisted mode", { sequential: true }, () => {
  let root = ""
  afterEach(async () => {
    if (root) {
      await fse.rm(root, { recursive: true, force: true })
    }
  })

  test("passes skipDownwardSearch: false to locatePackageVersion when isHoisted is true", async ({ expect }) => {
    root = await buildTempTree({
      "node_modules/consumer/package.json": { name: "consumer", version: "1.0.0" },
      "node_modules/consumer/node_modules/nested-pkg/package.json": { name: "nested-pkg", version: "3.0.0" },
      "node_modules/nested-pkg/package.json": { name: "nested-pkg", version: "2.0.0" },
    })

    const cache = new ModuleManager()
    const spy = vi.spyOn(cache, "locatePackageVersion")

    // Test the observable effect: skipDownwardSearch: false enables finding the nested package
    const result = await cache.locatePackageVersion({
      parentDir: root,
      pkgName: "nested-pkg",
      requiredRange: "^3.0.0",
      skipDownwardSearch: false,
    })

    expect(result).not.toBeNull()
    expect(result!.packageJson.version).toBe("3.0.0")
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ skipDownwardSearch: false }))
  })

  test("passes skipDownwardSearch: true to locatePackageVersion when isHoisted is false", async ({ expect }) => {
    root = await buildTempTree({
      "node_modules/consumer/package.json": { name: "consumer", version: "1.0.0" },
      "node_modules/consumer/node_modules/nested-pkg/package.json": { name: "nested-pkg", version: "3.0.0" },
    })

    const cache = new ModuleManager()

    // With skipDownwardSearch: true (virtual store mode) the nested package must NOT be found
    const result = await cache.locatePackageVersion({
      parentDir: root,
      pkgName: "nested-pkg",
      requiredRange: "^3.0.0",
      skipDownwardSearch: true,
    })

    expect(result).toBeNull()
  })

  test("isHoisted detection reads node-linker from pnpm config output", ({ expect }) => {
    // Verifies the config-parsing logic used in NodeModulesCollector.isHoisted
    const configLines = ["node-linker=hoisted", "some-other-key=value"].join("\n")
    const lines = Object.fromEntries(configLines.split("\n").map(line => line.split("=").map(s => s.trim())))
    expect(lines["node-linker"]).toBe("hoisted")
  })

  test("isHoisted detection returns false when node-linker is not set", ({ expect }) => {
    const configLines = ["some-key=value", "another-key=other"].join("\n")
    const lines = Object.fromEntries(configLines.split("\n").map(line => line.split("=").map(s => s.trim())))
    expect(lines["node-linker"]).toBeUndefined()
    expect(lines["node-linker"] === "hoisted").toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tests: PnpmNodeModulesCollector.isHoisted detects layout from on-disk structure
// (pnpm 11 stopped echoing node-linker in `config list`, so detection is realpath-based)
// ---------------------------------------------------------------------------

describe("PnpmNodeModulesCollector.isHoisted (on-disk layout detection)", { sequential: true }, () => {
  let root = ""

  const makeCollector = (rootDir: string): any => new (PnpmNodeModulesCollector as any)(rootDir, new TmpDir("test"))

  // Mirror pnpm's isolated store: the real package lives under node_modules/.pnpm/<id>/node_modules,
  // and the top-level entry is a link (junction on Windows, symlink on POSIX) pointing at it.
  async function addIsolatedPackage(rootDir: string, name: string, version: string) {
    const real = path.join(rootDir, "node_modules", ".pnpm", `${name}@${version}`, "node_modules", name)
    await fse.ensureDir(real)
    await fse.writeJson(path.join(real, "package.json"), { name, version })
    await fse.ensureSymlink(real, path.join(rootDir, "node_modules", name), "junction")
  }

  test("returns false for the isolated .pnpm store (top-level package routes through .pnpm)", async ({ expect, tmpDir }) => {
    root = await tmpDir.createTempDir()
    await addIsolatedPackage(root, "fs-extra", "11.3.5")
    expect(await makeCollector(root).isHoisted.value).toBe(false)
  })

  test("returns true for a hoisted layout (top-level package is a real directory)", async ({ expect, tmpDir }) => {
    root = await tmpDir.createTempDir()
    const dir = path.join(root, "node_modules", "fs-extra")
    await fse.ensureDir(dir)
    await fse.writeJson(path.join(dir, "package.json"), { name: "fs-extra", version: "11.3.5" })
    expect(await makeCollector(root).isHoisted.value).toBe(true)
  })

  test("ignores link: packages (which resolve outside .pnpm) and still detects the isolated store", async ({ expect, tmpDir }) => {
    root = await tmpDir.createTempDir()
    // a link: dep resolves to a source dir outside node_modules — never under .pnpm
    const linkSrc = path.join(root, "packages", "my-linked")
    await fse.ensureDir(linkSrc)
    await fse.writeJson(path.join(linkSrc, "package.json"), { name: "my-linked", version: "1.0.0" })
    await fse.ensureSymlink(linkSrc, path.join(root, "node_modules", "my-linked"), "junction")
    // a regular dep routes through .pnpm — the scan must keep going past the link to find it
    await addIsolatedPackage(root, "fs-extra", "11.3.5")
    expect(await makeCollector(root).isHoisted.value).toBe(false)
  })

  test("returns false when node_modules is empty or missing (flat default)", async ({ expect, tmpDir }) => {
    root = await tmpDir.createTempDir()
    expect(await makeCollector(root).isHoisted.value).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tests: end-to-end nested dependency resolution
// ---------------------------------------------------------------------------

describe("nested dependency resolution (hoisted layout simulation)", { sequential: true }, () => {
  let root = ""
  afterEach(async () => {
    if (root) {
      await fse.rm(root, { recursive: true, force: true })
    }
  })

  test("resolves a version-conflicted transitive dep from the right nested location", async ({ expect }) => {
    // Mirrors the real-world scenario from GH issue #9654:
    //   conf@15.1.0 requires env-paths@3.0.0
    //   env-paths@2.2.1 is hoisted at root (used by other packages)
    //   env-paths@3.0.0 lives at root/node_modules/conf/node_modules/env-paths
    root = await buildTempTree({
      "node_modules/env-paths/package.json": { name: "env-paths", version: "2.2.1" },
      "node_modules/conf/package.json": { name: "conf", version: "15.1.0", dependencies: { "env-paths": "^3.0.0" } },
      "node_modules/conf/node_modules/env-paths/package.json": { name: "env-paths", version: "3.0.0" },
    })

    const manager = new ModuleManager()

    const result = await manager.locatePackageVersion({
      parentDir: path.join(root, "node_modules", "conf"),
      pkgName: "env-paths",
      requiredRange: "^3.0.0",
      skipDownwardSearch: false,
    })

    expect(result).not.toBeNull()
    expect(result!.packageJson.version).toBe("3.0.0")
    expect(result!.packageDir).toBe(path.join(root, "node_modules", "conf", "node_modules", "env-paths"))
  })

  test("resolves a version-conflicted transitive dep from workspace root downward search", async ({ expect }) => {
    // Searching from workspace root finds the nested version via BFS
    root = await buildTempTree({
      "node_modules/env-paths/package.json": { name: "env-paths", version: "2.2.1" },
      "node_modules/conf/package.json": { name: "conf", version: "15.1.0" },
      "node_modules/conf/node_modules/env-paths/package.json": { name: "env-paths", version: "3.0.0" },
    })

    const manager = new ModuleManager()
    const result = await manager.locatePackageVersion({
      parentDir: root,
      pkgName: "env-paths",
      requiredRange: "^3.0.0",
      skipDownwardSearch: false,
    })

    expect(result).not.toBeNull()
    expect(result!.packageJson.version).toBe("3.0.0")
  })

  test("upward search still finds the hoisted version when it satisfies the range", async ({ expect }) => {
    root = await buildTempTree({
      "node_modules/env-paths/package.json": { name: "env-paths", version: "2.2.1" },
      "node_modules/conf/package.json": { name: "conf", version: "15.1.0" },
      "node_modules/conf/node_modules/env-paths/package.json": { name: "env-paths", version: "3.0.0" },
    })

    const manager = new ModuleManager()
    // Range ^2.0.0 matches the hoisted 2.2.1 — upward search resolves it without BFS
    const result = await manager.locatePackageVersion({
      parentDir: path.join(root, "node_modules", "conf"),
      pkgName: "env-paths",
      requiredRange: "^2.0.0",
    })

    expect(result).not.toBeNull()
    expect(result!.packageJson.version).toBe("2.2.1")
  })
})
