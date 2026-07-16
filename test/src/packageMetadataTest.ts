import { checkMetadata } from "app-builder-lib/internal"
import { describe, expect, test } from "vitest"

function checkDependencies(dependencies: Record<string, string>) {
  const metadata: any = {
    name: "test-app",
    version: "1.0.0",
    description: "test",
    author: "test",
    dependencies,
  }
  checkMetadata(metadata, metadata, "package.json", "package.json")
}

describe("checkMetadata electron-updater version validation", () => {
  test("accepts pnpm catalog: specifier", () => {
    expect(() => checkDependencies({ "electron-updater": "catalog:" })).not.toThrow()
  })

  test("accepts pnpm named catalog specifier", () => {
    expect(() => checkDependencies({ "electron-updater": "catalog:default" })).not.toThrow()
  })

  test("accepts workspace: specifier", () => {
    expect(() => checkDependencies({ "electron-updater": "workspace:*" })).not.toThrow()
  })

  test("accepts semver version satisfying the minimum", () => {
    expect(() => checkDependencies({ "electron-updater": "^6.2.1" })).not.toThrow()
  })

  test("rejects too-old electron-updater version", () => {
    expect(() => checkDependencies({ "electron-updater": "^3.0.0" })).toThrow(/At least electron-updater 4\.0\.0 is recommended/)
  })
})
