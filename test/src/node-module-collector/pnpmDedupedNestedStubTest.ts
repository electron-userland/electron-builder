import { describe, test } from "vitest"
import * as os from "os"
import * as path from "path"
import { PnpmNodeModulesCollector } from "app-builder-lib/internal"
import { TmpDir } from "temp-file"

const makeCollector = (rootDir: string): any => new (PnpmNodeModulesCollector as any)(rootDir, new TmpDir("deduped-stub-test"))

// ---------------------------------------------------------------------------
// Unit: pnpm 10.29.3+ prints a repeated subtree once and every later occurrence as a
// childless deduped stub. A package whose only occurrences sit beneath other stubs
// (e.g. `wrappy` under `once`) is never visited, so it has no allDependencies entry.
// resolveOmittedDependency must then register it straight from disk instead of
// falling through to a name-only match (wrong version) or to nothing (dropped from asar).
// ---------------------------------------------------------------------------

describe("PnpmNodeModulesCollector.resolveOmittedDependency", () => {
  const rootDir = path.join(os.tmpdir(), "eb-deduped-stub-root")
  const storeDir = path.join(rootDir, "node_modules", ".pnpm", "wrappy@1.0.2", "node_modules", "wrappy")

  test("registers a dependency that was never collected, using the copy located on disk", async ({ expect }) => {
    const collector = makeCollector(rootDir)
    collector.locateFromDepOrRoot = async (pkgName: string) => (pkgName === "wrappy" ? { packageDir: storeDir, packageJson: { name: "wrappy", version: "1.0.2" } } : null)

    const resolved = await collector.resolveOmittedDependency("wrappy", "1", path.join(rootDir, "node_modules", ".pnpm", "once@1.4.0", "node_modules", "once"))

    expect(resolved).toMatchObject({ name: "wrappy", from: "wrappy", version: "1.0.2", path: storeDir })
    expect(collector.allDependencies.get("wrappy@1.0.2")).toBe(resolved)
  })

  test("prefers the already-collected exact name@version entry", async ({ expect }) => {
    const collector = makeCollector(rootDir)
    const collected = { name: "wrappy", from: "wrappy", version: "1.0.2", path: storeDir, resolved: "" }
    collector.allDependencies.set("wrappy@1.0.2", collected)
    collector.locateFromDepOrRoot = async () => ({ packageDir: storeDir, packageJson: { name: "wrappy", version: "1.0.2" } })

    expect(await collector.resolveOmittedDependency("wrappy", "1", undefined)).toBe(collected)
  })

  test("falls back to the name-only lookup only when nothing is found on disk", async ({ expect }) => {
    const collector = makeCollector(rootDir)
    const byName = { name: "wrappy", from: "wrappy", version: "1.0.1", path: storeDir, resolved: "" }
    collector.allDependencies.set("wrappy@1.0.1", byName)
    collector.locateFromDepOrRoot = async () => null

    expect(await collector.resolveOmittedDependency("wrappy", "1", undefined)).toBe(byName)
  })
})
