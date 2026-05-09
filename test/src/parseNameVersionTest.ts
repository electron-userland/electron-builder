import { PnpmNodeModulesCollector } from "app-builder-lib/src/node-module-collector/pnpmNodeModulesCollector"
import { TmpDir } from "temp-file"
import { describe, expect, test } from "vitest"

type TestablePnpmNodeModulesCollector = {
  parseNameVersion(identifier: string): { name: string; version: string }
  parseDependenciesTree(dependencyTree: string, packageName?: string): { name: string; version: string; path: string }
}

function createTestableCollector(): TestablePnpmNodeModulesCollector {
  return new PnpmNodeModulesCollector(".", new TmpDir("test")) as unknown as TestablePnpmNodeModulesCollector
}

// Access protected method via cast for unit testing
function parseNameVersion(identifier: string): { name: string; version: string } {
  return createTestableCollector().parseNameVersion(identifier)
}

function parsePnpmDependenciesTree(dependencyTree: Array<{ name: string; version: string; path: string }>, packageName?: string) {
  return createTestableCollector().parseDependenciesTree(JSON.stringify(dependencyTree), packageName)
}

describe("parseNameVersion", () => {
  test("regular package", () => {
    expect(parseNameVersion("lodash@4.17.21")).toEqual({ name: "lodash", version: "4.17.21" })
  })

  test("scoped package", () => {
    expect(parseNameVersion("@scope/pkg@1.2.3")).toEqual({ name: "@scope/pkg", version: "1.2.3" })
  })

  test("scoped package with pnpm link: path containing @", () => {
    expect(parseNameVersion("@myorg/addon-a@link:../packages/@myorg/addon-a")).toEqual({
      name: "@myorg/addon-a",
      version: "link:../packages/@myorg/addon-a",
    })
  })

  test("scoped package with link: path without @", () => {
    expect(parseNameVersion("@myorg/addon-a@link:../packages/addon-a")).toEqual({
      name: "@myorg/addon-a",
      version: "link:../packages/addon-a",
    })
  })

  test("regular package with link: path containing @", () => {
    expect(parseNameVersion("addon@link:../packages/@myorg/addon")).toEqual({
      name: "addon",
      version: "link:../packages/@myorg/addon",
    })
  })

  test("package without version", () => {
    expect(parseNameVersion("lodash")).toEqual({ name: "lodash", version: "unknown" })
  })

  test("scoped package without version", () => {
    expect(parseNameVersion("@scope/pkg")).toEqual({ name: "@scope/pkg", version: "unknown" })
  })

  test("malformed scoped package without slash", () => {
    expect(parseNameVersion("@malformed")).toEqual({ name: "@malformed", version: "unknown" })
  })

  test("empty string", () => {
    expect(parseNameVersion("")).toEqual({ name: "", version: "unknown" })
  })

  test("scoped package with workspace: protocol", () => {
    expect(parseNameVersion("@myorg/core@workspace:*")).toEqual({ name: "@myorg/core", version: "workspace:*" })
  })
})

describe("PnpmNodeModulesCollector.parseDependenciesTree", () => {
  const dependencyTree = [
    { name: "workspace-root", version: "1.0.0", path: "/workspace" },
    { name: "test-app", version: "1.0.0", path: "/workspace/packages/test-app" },
  ]

  test("returns dependency tree matching package name", () => {
    expect(parsePnpmDependenciesTree(dependencyTree, "test-app")).toEqual(dependencyTree[1])
  })

  test("returns first dependency tree when package name is omitted", () => {
    expect(parsePnpmDependenciesTree(dependencyTree)).toEqual(dependencyTree[0])
  })

  test("falls back to first dependency tree when package name does not match", () => {
    expect(parsePnpmDependenciesTree(dependencyTree, "unknown-app")).toEqual(dependencyTree[0])
  })

  test("throws when pnpm returns no dependency trees", () => {
    expect(() => parsePnpmDependenciesTree([])).toThrow("pnpm list returned no dependency trees")
  })
})
