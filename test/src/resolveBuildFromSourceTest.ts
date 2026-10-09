import { describe, test } from "vitest"
import { resolveBuildFromSource } from "app-builder-lib/src/util/installOrRebuild.js"

describe("resolveBuildFromSource", () => {
  test("is false when buildDependenciesFromSource is not set", ({ expect }) => {
    expect(resolveBuildFromSource({}, "linux", "linux")).toBe(false)
    expect(resolveBuildFromSource({ nativeModules: {} }, "win32", "darwin")).toBe(false)
    expect(resolveBuildFromSource({ nativeModules: { buildDependenciesFromSource: false } }, "darwin", "darwin")).toBe(false)
  })

  test("builds from source when the target platform matches the host", ({ expect }) => {
    const config = { nativeModules: { buildDependenciesFromSource: true } }
    expect(resolveBuildFromSource(config, "darwin", "darwin")).toBe(true)
    expect(resolveBuildFromSource(config, "linux", "linux")).toBe(true)
    expect(resolveBuildFromSource(config, "win32", "win32")).toBe(true)
  })

  test("falls back to prebuilt binaries (still rebuilds) for a cross-platform target", ({ expect }) => {
    // Previously the rebuild was skipped entirely here, shipping whatever (host) binary was in node_modules.
    const config = { nativeModules: { buildDependenciesFromSource: true } }
    expect(resolveBuildFromSource(config, "win32", "darwin")).toBe(false)
    expect(resolveBuildFromSource(config, "linux", "darwin")).toBe(false)
    expect(resolveBuildFromSource(config, "darwin", "linux")).toBe(false)
  })

  test("defaults the host platform to process.platform", ({ expect }) => {
    const config = { nativeModules: { buildDependenciesFromSource: true } }
    expect(resolveBuildFromSource(config, process.platform)).toBe(true)
    const other: NodeJS.Platform = process.platform === "win32" ? "linux" : "win32"
    expect(resolveBuildFromSource(config, other)).toBe(false)
  })
})
