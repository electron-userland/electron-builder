import * as fs from "fs"
import * as path from "path"
import { expect } from "vitest"

const WORKSPACE_ROOT = path.resolve(__dirname, "../../")

// eslint-disable-next-line @typescript-eslint/no-require-imports
const helper = require("../../packages/app-builder-lib/helpers/dynamic-import") as {
  dynamicImport(modulePath: string): Promise<any>
  dynamicImportMaybe(modulePath: string): Promise<any>
}

describe("dynamicImport", () => {
  test("imports a package root specifier", async () => {
    const mod = await helper.dynamicImport("@electron/osx-sign")
    expect(mod).toBeDefined()
    expect(typeof mod.signAsync).toBe("function")
  })

  test("imports a package subpath specifier (no .js extension)", async () => {
    // This is the scenario reported in issue #9816 — pnpm fails without .js
    const mod = await helper.dynamicImport("@electron/osx-sign/dist/cjs/util-identities")
    expect(mod).toBeDefined()
    expect(typeof mod.Identity).toBe("function")
  })

  test("imports a package subpath specifier (with .js extension)", async () => {
    const mod = await helper.dynamicImport("@electron/osx-sign/dist/cjs/util-identities.js")
    expect(mod).toBeDefined()
    expect(typeof mod.Identity).toBe("function")
  })

  test("imports an absolute file path", async () => {
    const tempDir = path.join(WORKSPACE_ROOT, "temp")
    fs.mkdirSync(tempDir, { recursive: true })
    const tmpFile = path.join(tempDir, `dynamic-import-test-${Date.now()}-${Math.random().toString(16).slice(2)}.js`)
    fs.writeFileSync(tmpFile, "exports.value = 42")
    try {
      const mod = await helper.dynamicImport(tmpFile)
      expect(mod.value).toBe(42)
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })

  test("imports a Node built-in module", async () => {
    // Built-ins must not be routed through pathToFileURL — require.resolve("fs") === "fs"
    const mod = await helper.dynamicImport("fs")
    expect(typeof mod.readFileSync).toBe("function")
  })

  test("rejects for a nonexistent module", async () => {
    await expect(helper.dynamicImport("__nonexistent_pkg_that_does_not_exist__")).rejects.toThrow()
  })
})

describe("dynamicImportMaybe", () => {
  test("loads a CJS-compatible package via require", async () => {
    const mod = await helper.dynamicImportMaybe("@electron/osx-sign")
    expect(mod).toBeDefined()
    expect(typeof mod.signAsync).toBe("function")
  })

  test("rejects with combined error message for a nonexistent module", async () => {
    // Require both markers in order: "\n1. <cjs error>\n2. <esm error>"
    await expect(helper.dynamicImportMaybe("__nonexistent_pkg_that_does_not_exist__")).rejects.toThrow(/1\.[\s\S]*2\./)
  })
})
