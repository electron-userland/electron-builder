import { afterEach, describe, test } from "vitest"
import * as fse from "fs-extra"
import * as path from "path"
import { ModuleManager, LogMessageByKey } from "app-builder-lib/src/node-module-collector/moduleManager"
import { TmpDir } from "temp-file"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Writes a minimal package.json tree under a temp root and returns the root
 * path. The `packages` map is keyed by relative path from the root.
 */
const projectTmpDir = new TmpDir("eb-mm-test")

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
// Tests
// ---------------------------------------------------------------------------

describe("ModuleManager.locatePackageVersion", () => {
  describe("basic resolution", () => {
    test("returns null when parentDir is undefined", async ({ expect }) => {
      const manager = new ModuleManager()
      const result = await manager.locatePackageVersion({ pkgName: "foo", requiredRange: "^1.0.0" })
      expect(result).toBeNull()
    })

    test("returns null when pkgName is undefined", async ({ expect }) => {
      const manager = new ModuleManager()
      const result = await manager.locatePackageVersion({ parentDir: "/some/dir", requiredRange: "^1.0.0" })
      expect(result).toBeNull()
    })

    test("finds package in direct parent node_modules when version satisfies range", async ({ expect }) => {
      const root = await buildTempTree({
        "node_modules/my-pkg/package.json": { name: "my-pkg", version: "1.2.3" },
      })
      try {
        const manager = new ModuleManager()
        const result = await manager.locatePackageVersion({ parentDir: root, pkgName: "my-pkg", requiredRange: "^1.0.0" })
        expect(result).not.toBeNull()
        expect(result!.packageJson.version).toBe("1.2.3")
        expect(result!.packageDir).toBe(path.join(root, "node_modules", "my-pkg"))
      } finally {
        await fse.rm(root, { recursive: true, force: true })
      }
    })

    test("returns null when package is absent from the tree", async ({ expect }) => {
      const root = await buildTempTree({})
      try {
        const manager = new ModuleManager()
        const result = await manager.locatePackageVersion({ parentDir: root, pkgName: "missing-pkg", requiredRange: "^1.0.0" })
        expect(result).toBeNull()
      } finally {
        await fse.rm(root, { recursive: true, force: true })
      }
    })

    test("accepts any installed version when no range is given", async ({ expect }) => {
      const root = await buildTempTree({
        "node_modules/any-pkg/package.json": { name: "any-pkg", version: "99.0.0" },
      })
      try {
        const manager = new ModuleManager()
        const result = await manager.locatePackageVersion({ parentDir: root, pkgName: "any-pkg" })
        expect(result).not.toBeNull()
        expect(result!.packageJson.version).toBe("99.0.0")
      } finally {
        await fse.rm(root, { recursive: true, force: true })
      }
    })
  })

  describe("upward (hoisted) resolution", { sequential: true }, () => {
    let root = ""
    afterEach(async () => {
      if (root) {
        await fse.rm(root, { recursive: true, force: true })
      }
    })

    test("finds hoisted package that satisfies range", async ({ expect }) => {
      root = await buildTempTree({
        // hoisted at root
        "node_modules/hoisted/package.json": { name: "hoisted", version: "2.0.0" },
        // nested package that requires hoisted
        "node_modules/consumer/package.json": { name: "consumer", version: "1.0.0" },
      })
      const manager = new ModuleManager()
      const result = await manager.locatePackageVersion({
        parentDir: path.join(root, "node_modules", "consumer"),
        pkgName: "hoisted",
        requiredRange: "^2.0.0",
      })
      expect(result).not.toBeNull()
      expect(result!.packageJson.version).toBe("2.0.0")
    })
  })

  describe("override fallback (two-pass search)", { sequential: true }, () => {
    let root = ""
    afterEach(async () => {
      if (root) {
        await fse.rm(root, { recursive: true, force: true })
      }
    })

    test("accepts package whose installed version is outside the declared range", async ({ expect }) => {
      // Simulates: keyv-better-sqlite3 declares better-sqlite3@^7.1.1 but bun
      // resolves it to 12.6.0 via overrides. The installed version is outside the
      // declared range but should still be accepted.
      root = await buildTempTree({
        "node_modules/transitive/package.json": { name: "transitive", version: "12.0.0" },
        "node_modules/consumer/package.json": { name: "consumer", version: "1.0.0" },
      })
      const manager = new ModuleManager()
      const result = await manager.locatePackageVersion({
        parentDir: path.join(root, "node_modules", "consumer"),
        pkgName: "transitive",
        requiredRange: "^7.0.0", // declared range, does NOT match installed 12.0.0
      })
      expect(result).not.toBeNull()
      expect(result!.packageJson.version).toBe("12.0.0")
    })

    test("records overridden dependency in logSummary", async ({ expect }) => {
      root = await buildTempTree({
        "node_modules/transitive/package.json": { name: "transitive", version: "12.0.0" },
        "node_modules/consumer/package.json": { name: "consumer", version: "1.0.0" },
      })
      const manager = new ModuleManager()
      await manager.locatePackageVersion({
        parentDir: path.join(root, "node_modules", "consumer"),
        pkgName: "transitive",
        requiredRange: "^7.0.0",
      })
      const overridden = manager.logSummary[LogMessageByKey.PKG_VERSION_OVERRIDDEN]
      expect(overridden).toHaveLength(1)
      expect(overridden[0]).toContain("transitive@12.0.0")
      expect(overridden[0]).toContain("^7.0.0")
    })

    test("does NOT add to override log when version satisfies range normally", async ({ expect }) => {
      root = await buildTempTree({
        "node_modules/dep/package.json": { name: "dep", version: "7.5.0" },
        "node_modules/consumer/package.json": { name: "consumer", version: "1.0.0" },
      })
      const manager = new ModuleManager()
      await manager.locatePackageVersion({
        parentDir: path.join(root, "node_modules", "consumer"),
        pkgName: "dep",
        requiredRange: "^7.0.0", // 7.5.0 satisfies this
      })
      const overridden = manager.logSummary[LogMessageByKey.PKG_VERSION_OVERRIDDEN]
      expect(overridden).toHaveLength(0)
    })

    test("returns null when package is genuinely absent (not just mismatched version)", async ({ expect }) => {
      root = await buildTempTree({
        "node_modules/consumer/package.json": { name: "consumer", version: "1.0.0" },
        // 'transitive' is deliberately absent
      })
      const manager = new ModuleManager()
      const result = await manager.locatePackageVersion({
        parentDir: path.join(root, "node_modules", "consumer"),
        pkgName: "transitive",
        requiredRange: "^7.0.0",
      })
      expect(result).toBeNull()
    })

    test("does not trigger fallback when requiredRange is undefined", async ({ expect }) => {
      // When no range is given the first-pass already accepts any version;
      // the fallback should never fire and the logSummary should stay empty.
      root = await buildTempTree({
        "node_modules/dep/package.json": { name: "dep", version: "5.0.0" },
      })
      const manager = new ModuleManager()
      await manager.locatePackageVersion({ parentDir: root, pkgName: "dep" })
      const overridden = manager.logSummary[LogMessageByKey.PKG_VERSION_OVERRIDDEN]
      expect(overridden).toHaveLength(0)
    })
  })
})

describe("ModuleManager downward search", { sequential: true }, () => {
  let root = ""
  afterEach(async () => {
    if (root) {
      await fse.rm(root, { recursive: true, force: true })
    }
  })

  test("finds package nested under another package's node_modules", async ({ expect }) => {
    // Simulates: root/node_modules/consumer/node_modules/target (hoisted layout with version conflict)
    root = await buildTempTree({
      "node_modules/consumer/package.json": { name: "consumer", version: "1.0.0" },
      "node_modules/consumer/node_modules/target/package.json": { name: "target", version: "3.0.0" },
      // a different version is hoisted at root so upward search finds the wrong one
      "node_modules/target/package.json": { name: "target", version: "2.0.0" },
    })
    const manager = new ModuleManager()
    const result = await manager.locatePackageVersion({
      parentDir: root,
      pkgName: "target",
      requiredRange: "^3.0.0",
      skipDownwardSearch: false,
    })
    expect(result).not.toBeNull()
    expect(result!.packageJson.version).toBe("3.0.0")
    expect(result!.packageDir).toBe(path.join(root, "node_modules", "consumer", "node_modules", "target"))
  })

  test("skipDownwardSearch: true does NOT find a package nested under another package's node_modules", async ({ expect }) => {
    root = await buildTempTree({
      "node_modules/consumer/package.json": { name: "consumer", version: "1.0.0" },
      "node_modules/consumer/node_modules/target/package.json": { name: "target", version: "3.0.0" },
    })
    const manager = new ModuleManager()
    const result = await manager.locatePackageVersion({
      parentDir: root,
      pkgName: "target",
      requiredRange: "^3.0.0",
      skipDownwardSearch: true,
    })
    expect(result).toBeNull()
  })

  test("finds scoped package (@scope/name) nested under another package's node_modules", async ({ expect }) => {
    root = await buildTempTree({
      "node_modules/consumer/package.json": { name: "consumer", version: "1.0.0" },
      "node_modules/consumer/node_modules/@scope/target/package.json": { name: "@scope/target", version: "5.0.0" },
    })
    const manager = new ModuleManager()
    const result = await manager.locatePackageVersion({
      parentDir: root,
      pkgName: "@scope/target",
      requiredRange: "^5.0.0",
      skipDownwardSearch: false,
    })
    expect(result).not.toBeNull()
    expect(result!.packageJson.version).toBe("5.0.0")
  })

  test("upward search finds the hoisted version when the nested version does not satisfy the range", async ({ expect }) => {
    // consumer/node_modules/target = 2.0.0 (direct check, fails range ^2.5.0)
    // root/node_modules/target    = 2.5.0 (found by upward search, satisfies range)
    root = await buildTempTree({
      "node_modules/target/package.json": { name: "target", version: "2.5.0" },
      "node_modules/consumer/package.json": { name: "consumer", version: "1.0.0" },
      "node_modules/consumer/node_modules/target/package.json": { name: "target", version: "2.0.0" },
    })
    const manager = new ModuleManager()
    const result = await manager.locatePackageVersion({
      parentDir: path.join(root, "node_modules", "consumer"),
      pkgName: "target",
      requiredRange: "^2.5.0",
    })
    expect(result).not.toBeNull()
    expect(result!.packageJson.version).toBe("2.5.0")
  })

  test("dot-prefixed directories inside node_modules are skipped", async ({ expect }) => {
    // Ensures hidden dirs like .pnpm are never explored
    root = await buildTempTree({
      "node_modules/.hidden/node_modules/target/package.json": { name: "target", version: "1.0.0" },
    })
    const manager = new ModuleManager()
    const result = await manager.locatePackageVersion({
      parentDir: root,
      pkgName: "target",
      requiredRange: "^1.0.0",
      skipDownwardSearch: false,
    })
    expect(result).toBeNull()
  })
})

describe("ModuleManager.semverSatisfies (via locatePackageVersion)", { sequential: true }, () => {
  let root = ""
  afterEach(async () => {
    if (root) {
      await fse.rm(root, { recursive: true, force: true })
    }
  })

  async function locateWith(version: string, range: string): Promise<{ found: boolean; usedFallback: boolean }> {
    root = await buildTempTree({
      "node_modules/pkg/package.json": { name: "pkg", version },
    })
    const manager = new ModuleManager()
    const result = await manager.locatePackageVersion({ parentDir: root, pkgName: "pkg", requiredRange: range })
    const usedFallback = (manager.logSummary[LogMessageByKey.PKG_VERSION_OVERRIDDEN] ?? []).length > 0
    await fse.rm(root, { recursive: true, force: true })
    root = ""
    return { found: result !== null, usedFallback }
  }

  test("caret range: matching major", async ({ expect }) => {
    expect((await locateWith("1.5.0", "^1.0.0")).found).toBe(true)
  })

  test("tilde range: matching minor", async ({ expect }) => {
    expect((await locateWith("1.2.3", "~1.2.0")).found).toBe(true)
  })

  test("exact match", async ({ expect }) => {
    expect((await locateWith("2.3.4", "2.3.4")).found).toBe(true)
  })

  test("non-semver range (git URL) is treated as match", async ({ expect }) => {
    expect((await locateWith("1.0.0", "git+https://github.com/foo/bar.git")).found).toBe(true)
  })

  test("wildcard range (*) matches any version", async ({ expect }) => {
    expect((await locateWith("99.0.0", "*")).found).toBe(true)
  })

  test("major mismatch triggers override fallback and still resolves", async ({ expect }) => {
    const { found, usedFallback } = await locateWith("12.0.0", "^7.0.0")
    expect(found).toBe(true)
    expect(usedFallback).toBe(true)
  })
})
