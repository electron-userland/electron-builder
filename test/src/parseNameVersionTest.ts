import { PnpmNodeModulesCollector } from "app-builder-lib/out/node-module-collector/pnpmNodeModulesCollector"
import { TmpDir } from "temp-file"
import { describe, expect, test } from "vitest"

// Access protected method via cast for unit testing
function parseNameVersion(identifier: string): { name: string; version: string } {
  const collector = new (PnpmNodeModulesCollector as any)(".", new TmpDir("test"))
  return (collector as any).parseNameVersion(identifier)
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
