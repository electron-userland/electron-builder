import SquirrelWindowsTarget from "electron-builder-squirrel-windows/src/SquirrelWindowsTarget"
import { realpath } from "fs/promises"
import * as path from "path"
import { beforeEach, describe, expect, test } from "vitest"

describe("SquirrelWindowsTarget.assertShellSafePath", () => {
  let t: any
  beforeEach(() => {
    t = Object.create(SquirrelWindowsTarget.prototype)
  })

  test.each([
    ["newline \\n", "C:\\foo\nbar"],
    ["carriage return \\r", "C:\\foo\rbar"],
    ["backtick", "C:\\foo`bar"],
    ["dollar sign", "C:\\foo$bar"],
    ["semicolon", "C:\\foo;bar"],
    ["ampersand", "C:\\foo&bar"],
    ["pipe", "C:\\foo|bar"],
    ["less-than", "C:\\foo<bar"],
    ["greater-than", "C:\\foo>bar"],
  ])("throws for %s", (_label, p) => {
    expect(() => t.assertShellSafePath(p, "test path")).toThrow("unsafe shell characters")
  })

  test("accepts a normal Windows-style path", () => {
    expect(() => t.assertShellSafePath("C:\\Program Files\\MyApp\\app.exe", "test path")).not.toThrow()
  })

  test("accepts a normal posix-style path", () => {
    expect(() => t.assertShellSafePath("/usr/local/bin/myapp", "test path")).not.toThrow()
  })
})

describe("SquirrelWindowsTarget.ensurePathInside", { sequential: true }, () => {
  let t: any
  let base: string

  beforeEach(async context => {
    t = Object.create(SquirrelWindowsTarget.prototype)
    base = await context.tmpDir.createTempDir()
  })

  test("accepts a path inside base", async () => {
    // realpath is needed because on macOS the temp dir resolves through a symlink (/tmp → /private/tmp)
    const resolvedBase = await realpath(base)
    const result = await t.ensurePathInside(base, path.join(base, "file.exe"), "file")
    expect(result).toBe(path.join(resolvedBase, "file.exe"))
  })

  test("rejects path traversal via ..", async () => {
    await expect(t.ensurePathInside(base, path.join(base, "..", "outside.exe"), "file")).rejects.toThrow("must be inside")
  })

  test("rejects absolute path outside base", async () => {
    const outside = process.platform === "win32" ? "C:\\Windows\\System32\\cmd.exe" : "/etc/passwd"
    await expect(t.ensurePathInside(base, outside, "file")).rejects.toThrow("must be inside")
  })

  test("rejects path containing shell-unsafe characters", async () => {
    await expect(t.ensurePathInside(base, path.join(base, "file$evil.exe"), "file")).rejects.toThrow("unsafe shell characters")
  })
})
