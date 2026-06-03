import { afterEach, describe, test, vi } from "vitest"
import * as fse from "fs-extra"
import * as os from "os"
import * as path from "path"
import { TraversalNodeModulesCollector } from "app-builder-lib/src/node-module-collector/traversalNodeModulesCollector"
import { LogMessageByKey } from "app-builder-lib/src/node-module-collector/moduleManager"
import type { TmpDir } from "builder-util"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal TmpDir stub — traversal collector never needs actual temp files. */
const mockTmpDir = { getTempFile: vi.fn(), getTempDir: vi.fn() } as unknown as TmpDir

/**
 * Writes a package tree under a fresh temp directory.
 * Keys are relative paths to package.json files; values are the JSON contents.
 */
async function buildPackageTree(packages: Record<string, object>): Promise<string> {
  const root = await fse.mkdtemp(path.join(os.tmpdir(), "eb-traversal-test-"))
  for (const [rel, json] of Object.entries(packages)) {
    const abs = path.join(root, rel)
    await fse.ensureDir(path.dirname(abs))
    await fse.writeJson(abs, json)
  }
  return root
}

async function runCollector(rootDir: string, packageName: string) {
  const collector = new TraversalNodeModulesCollector(rootDir, mockTmpDir)
  return collector.getNodeModules({ packageName })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// sequence.concurrent is enabled globally; describe.sequential prevents concurrent tests from
// overwriting the shared `root` variable used across all sub-describe blocks.
describe.sequential("TraversalNodeModulesCollector", () => {
  let root = ""
  afterEach(async () => {
    if (root) {
      await fse.rm(root, { recursive: true, force: true })
      root = ""
    }
  })

  describe("basic dependency collection", () => {
    test("collects a simple direct dependency", async ({ expect }) => {
      root = await buildPackageTree({
        "package.json": {
          name: "my-app",
          version: "1.0.0",
          dependencies: { "prod-dep": "^1.0.0" },
        },
        "node_modules/prod-dep/package.json": {
          name: "prod-dep",
          version: "1.5.0",
        },
      })
      const { nodeModules } = await runCollector(root, "my-app")
      const names = nodeModules.map(m => m.name)
      expect(names).toContain("prod-dep")
    })

    test("does not include devDependencies", async ({ expect }) => {
      root = await buildPackageTree({
        "package.json": {
          name: "my-app",
          version: "1.0.0",
          dependencies: { "prod-dep": "^1.0.0" },
          devDependencies: { "dev-only": "^2.0.0" },
        },
        "node_modules/prod-dep/package.json": { name: "prod-dep", version: "1.0.0" },
        "node_modules/dev-only/package.json": { name: "dev-only", version: "2.0.0" },
      })
      const { nodeModules } = await runCollector(root, "my-app")
      const names = nodeModules.map(m => m.name)
      expect(names).toContain("prod-dep")
      expect(names).not.toContain("dev-only")
    })

    test("skips missing optional dependencies without throwing", async ({ expect }) => {
      root = await buildPackageTree({
        "package.json": {
          name: "my-app",
          version: "1.0.0",
          dependencies: { "prod-dep": "^1.0.0" },
          optionalDependencies: { "optional-native": "^1.0.0" },
        },
        "node_modules/prod-dep/package.json": { name: "prod-dep", version: "1.0.0" },
        // optional-native is intentionally absent
      })
      const { nodeModules } = await runCollector(root, "my-app")
      const names = nodeModules.map(m => m.name)
      expect(names).toContain("prod-dep")
      expect(names).not.toContain("optional-native")
    })

    test("throws for a genuinely missing production dependency", async ({ expect }) => {
      root = await buildPackageTree({
        "package.json": {
          name: "my-app",
          version: "1.0.0",
          dependencies: { "missing-dep": "^1.0.0" },
        },
        // missing-dep is deliberately absent
      })
      await expect(runCollector(root, "my-app")).rejects.toThrow(/missing-dep/)
    })
  })

  describe("package manager override resolution", () => {
    test("accepts transitive dep resolved to a version outside its declared range", async ({ expect }) => {
      // Reproduces the exact scenario from GitHub issue #9641:
      //   keyv-better-sqlite3 declares better-sqlite3@^7.1.1
      //   but the user has pinned better-sqlite3@12.6.0 via Bun overrides
      root = await buildPackageTree({
        "package.json": {
          name: "my-app",
          version: "1.0.0",
          dependencies: {
            "keyv-better-sqlite3": "^1.1.0",
            "better-sqlite3": "^12.6.0",
          },
          overrides: { "better-sqlite3": "^12.6.0" },
        },
        "node_modules/keyv-better-sqlite3/package.json": {
          name: "keyv-better-sqlite3",
          version: "1.1.0",
          dependencies: {
            // declares old range, but the override installs 12.x
            "better-sqlite3": "^7.1.1",
          },
        },
        "node_modules/better-sqlite3/package.json": {
          name: "better-sqlite3",
          version: "12.6.0", // installed via override, outside declared ^7.1.1
        },
      })

      // Must not throw; the overridden package must be included.
      const { nodeModules, logSummary } = await runCollector(root, "my-app")
      const names = nodeModules.map(m => m.name)
      expect(names).toContain("keyv-better-sqlite3")
      expect(names).toContain("better-sqlite3")

      // The override should be noted in the log summary at debug level.
      const overridden: string[] = logSummary[LogMessageByKey.PKG_VERSION_OVERRIDDEN] ?? []
      expect(Array.isArray(overridden)).toBe(true)
      expect(overridden.some(s => s.includes("better-sqlite3"))).toBe(true)
    })

    test("prefers the exact semver match over the override fallback", async ({ expect }) => {
      // If a version that DOES satisfy the range is installed alongside the
      // override candidate, the in-range version should be returned.
      root = await buildPackageTree({
        "package.json": {
          name: "my-app",
          version: "1.0.0",
          dependencies: { consumer: "^1.0.0" },
        },
        "node_modules/consumer/package.json": {
          name: "consumer",
          version: "1.0.0",
          dependencies: { dep: "^7.0.0" },
        },
        // A local version inside the consumer that satisfies the range
        "node_modules/consumer/node_modules/dep/package.json": {
          name: "dep",
          version: "7.1.0",
        },
        // A hoisted version that is outside the range (override candidate)
        "node_modules/dep/package.json": {
          name: "dep",
          version: "12.0.0",
        },
      })
      const { nodeModules, logSummary } = await runCollector(root, "my-app")
      const names = nodeModules.map(m => m.name)
      expect(names).toContain("dep")

      // Since 7.1.0 satisfies ^7.0.0, no override fallback should be recorded.
      const overridden: string[] = logSummary[LogMessageByKey.PKG_VERSION_OVERRIDDEN] ?? []
      expect(overridden.length).toBe(0)
    })

    test("handles multiple overridden transitive dependencies in the same tree", async ({ expect }) => {
      root = await buildPackageTree({
        "package.json": {
          name: "my-app",
          version: "1.0.0",
          dependencies: {
            "pkg-a": "^1.0.0",
            "pkg-b": "^1.0.0",
            "shared-dep": "^10.0.0",
            "other-dep": "^5.0.0",
          },
          overrides: {
            "shared-dep": "^10.0.0",
            "other-dep": "^5.0.0",
          },
        },
        "node_modules/pkg-a/package.json": {
          name: "pkg-a",
          version: "1.0.0",
          dependencies: { "shared-dep": "^3.0.0" }, // declared old, installed new via override
        },
        "node_modules/pkg-b/package.json": {
          name: "pkg-b",
          version: "1.0.0",
          dependencies: { "other-dep": "^2.0.0" }, // declared old, installed new via override
        },
        "node_modules/shared-dep/package.json": { name: "shared-dep", version: "10.1.0" },
        "node_modules/other-dep/package.json": { name: "other-dep", version: "5.2.0" },
      })
      const { nodeModules } = await runCollector(root, "my-app")
      const names = nodeModules.map(m => m.name)
      expect(names).toContain("pkg-a")
      expect(names).toContain("pkg-b")
      expect(names).toContain("shared-dep")
      expect(names).toContain("other-dep")
    })
  })

  describe("circular dependency and self-reference handling", () => {
    test("handles self-referential dependencies gracefully (does not loop)", async ({ expect }) => {
      root = await buildPackageTree({
        "package.json": {
          name: "my-app",
          version: "1.0.0",
          dependencies: { "my-lib": "^1.0.0" },
        },
        "node_modules/my-lib/package.json": {
          name: "my-lib",
          version: "1.0.0",
          dependencies: { "my-lib": "^1.0.0" }, // self-ref
        },
      })
      // Should complete without hanging or throwing.
      const { nodeModules } = await runCollector(root, "my-app")
      const names = nodeModules.map(m => m.name)
      expect(names).toContain("my-lib")
    })
  })
})
