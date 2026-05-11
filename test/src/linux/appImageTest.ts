import { validateCriticalPathString } from "app-builder-lib/src/targets/appimage/appImageUtil"
import { copyMimeTypes } from "app-builder-lib/src/targets/appimage/appLauncher"
import { InvalidConfigurationError } from "builder-util"
import * as fs from "fs-extra"
import * as os from "os"
import * as path from "path"

describe("validateCriticalPathString", () => {
  test("rejects double quotes", ({ expect }) => {
    expect(() => validateCriticalPathString('my"app', "executableName")).toThrow(InvalidConfigurationError)
  })

  test("rejects single quotes", ({ expect }) => {
    expect(() => validateCriticalPathString("my'app", "executableName")).toThrow(InvalidConfigurationError)
  })

  test("rejects dollar sign", ({ expect }) => {
    expect(() => validateCriticalPathString("my$app", "executableName")).toThrow(InvalidConfigurationError)
  })

  test("rejects forward slash", ({ expect }) => {
    expect(() => validateCriticalPathString("my/app", "executableName")).toThrow(InvalidConfigurationError)
  })

  test("rejects backtick", ({ expect }) => {
    expect(() => validateCriticalPathString("my`app", "executableName")).toThrow(InvalidConfigurationError)
  })

  test("rejects colon", ({ expect }) => {
    expect(() => validateCriticalPathString("my:app", "executableName")).toThrow(InvalidConfigurationError)
  })

  test("rejects @", ({ expect }) => {
    expect(() => validateCriticalPathString("my@app", "executableName")).toThrow(InvalidConfigurationError)
  })

  test("rejects empty string", ({ expect }) => {
    expect(() => validateCriticalPathString("", "executableName")).toThrow(InvalidConfigurationError)
  })

  test("allows alphanumeric, hyphens, underscores, dots, and spaces", ({ expect }) => {
    expect(() => validateCriticalPathString("My App-1.0_beta", "executableName")).not.toThrow()
  })

  test("allows Unicode letters (e.g. German ß)", ({ expect }) => {
    expect(() => validateCriticalPathString("Test App ßW", "productFilename")).not.toThrow()
  })
})

describe("copyMimeTypes - invalid extension handling", () => {
  test("skips extension containing a space", async ({ expect }) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eb-test-"))
    try {
      const result = await copyMimeTypes({
        stageDir: tmpDir,
        options: {
          fileAssociations: [{ mimeType: "application/x-test", ext: "my ext" }],
          productName: "TestApp",
          executableName: "testapp",
        },
      } as any)
      if (result) {
        const xml = await fs.readFile(path.join(tmpDir, result), "utf8")
        expect(xml).not.toContain('<glob pattern="*.my ext"/>')
      }
    } finally {
      await fs.remove(tmpDir)
    }
  })

  test("includes valid alphanumeric extensions in the XML glob", async ({ expect }) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eb-test-"))
    try {
      const result = await copyMimeTypes({
        stageDir: tmpDir,
        options: {
          fileAssociations: [{ mimeType: "application/x-test", ext: "txt" }],
          productName: "TestApp",
          executableName: "testapp",
        },
      } as any)
      expect(result).not.toBeNull()
      const xml = await fs.readFile(path.join(tmpDir, result!), "utf8")
      expect(xml).toContain('<glob pattern="*.txt"/>')
    } finally {
      await fs.remove(tmpDir)
    }
  })
})
