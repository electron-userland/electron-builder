import { promises as fs } from "fs"
import * as path from "path"
import { describe, expect, test } from "vitest"

const packageRoot = path.join(__dirname, "..", "..", "packages", "electron-builder")

async function loadAssert(): Promise<(actual?: string) => void> {
  const { assertNodeVersion } = await import(path.join(packageRoot, "assert-node-version.js"))
  return assertNodeVersion
}

describe("assertNodeVersion", () => {
  test.each(["22.12.0", "22.12.1", "22.21.1", "23.0.0", "24.5.0", "v22.13.0"])("accepts %s", async version => {
    const assertNodeVersion = await loadAssert()
    expect(() => assertNodeVersion(version)).not.toThrow()
  })

  test.each(["18.20.4", "20.11.0", "20.19.0", "22.0.0", "22.11.0"])("rejects %s", async version => {
    const assertNodeVersion = await loadAssert()
    expect(() => assertNodeVersion(version)).toThrow(/requires Node\.js >= 22\.12\.0/)
  })

  test("the message names the running version and links the migration note", async () => {
    const assertNodeVersion = await loadAssert()
    try {
      assertNodeVersion("20.11.0")
      throw new Error("expected assertNodeVersion to throw")
    } catch (e: any) {
      expect(e.message).toContain("Node.js 20.11.0")
      expect(e.message).toContain("nodejs-22120-required")
    }
  })

  test("a prerelease is compared on its release part", async () => {
    const assertNodeVersion = await loadAssert()
    expect(() => assertNodeVersion("23.0.0-nightly20240101")).not.toThrow()
    expect(() => assertNodeVersion("22.11.0-nightly20240101")).toThrow()
  })
})

describe("CLI entrypoints", () => {
  // The check has to run before the dist import, otherwise the module graph fails first with a
  // message that names neither electron-builder nor the required version.
  test.each(["cli.js", "install-app-deps.js"])("%s asserts the version before importing dist", async stub => {
    const source = await fs.readFile(path.join(packageRoot, stub), "utf8")
    expect(source).toContain("assertNodeVersion()")
    expect(source.indexOf("assertNodeVersion()")).toBeLessThan(source.indexOf('import("./dist'))
  })

  test("assert-node-version.js is published", async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"))
    expect(pkg.files).toContain("assert-node-version.js")
    expect(pkg.engines.node).toBe(">=22.12.0")
  })

  test("the guard loads no modules — it must not drag in the machinery it is meant to protect", async () => {
    const source = await fs.readFile(path.join(packageRoot, "assert-node-version.js"), "utf8")
    // Only module loading matters. The prose and the error text both mention require(esm) by name,
    // so match import/require as statements rather than anywhere in the file.
    expect(source).not.toMatch(/^\s*import\s+[^(]/m)
    expect(source).not.toMatch(/^\s*(const|let|var)\s+.*=\s*require\(/m)
    expect(source).not.toMatch(/\bawait\s+import\(/)
  })
})
