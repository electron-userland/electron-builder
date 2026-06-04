import * as https from "https"
import { EventEmitter } from "events"
import * as path from "path"
import { afterEach, describe, expect, vi } from "vitest"
import { Platform } from "app-builder-lib/src/core"
import {
  fetchNodeJsChecksum,
  getLaunchUiDownloadParams,
  getNodeJsDownloadParams,
  LAUNCHUI_DEFAULT_VERSION,
  validateShellEmbeddable,
} from "app-builder-lib/src/frameworks/LibUiFramework"

vi.mock("https")

// Pure mapping functions — no mocking required.
// The async downloadNodeJsBinary / downloadLaunchUiDir wrappers are covered by protonTest.ts.

describe.sequential("LibUiFramework helpers", () => {
  describe("getNodeJsDownloadParams", () => {
    describe("macOS", () => {
      test("darwin platform, tar.gz format, bin/node binary path", ({ expect }) => {
        const p = getNodeJsDownloadParams("18.0.0", Platform.MAC, "x64")

        expect(p.filenameWithExt).toBe("node-v18.0.0-darwin-x64.tar.gz")
        expect(p.overrideUrl).toBe("https://nodejs.org/dist/v18.0.0")
        expect(p.releaseName).toBe("nodejs-v18.0.0")
        expect(p.binaryRelPath).toBe(path.join("bin", "node"))
      })
    })

    describe("Linux", () => {
      test("linux platform, tar.gz format, bin/node binary path", ({ expect }) => {
        const p = getNodeJsDownloadParams("18.0.0", Platform.LINUX, "x64")

        expect(p.filenameWithExt).toBe("node-v18.0.0-linux-x64.tar.gz")
        expect(p.binaryRelPath).toBe(path.join("bin", "node"))
      })

      test("arm64 arch is passed through unchanged", ({ expect }) => {
        const p = getNodeJsDownloadParams("18.0.0", Platform.LINUX, "arm64")

        expect(p.filenameWithExt).toBe("node-v18.0.0-linux-arm64.tar.gz")
      })
    })

    describe("Windows", () => {
      test("win platform, zip format, node.exe under version subdirectory", ({ expect }) => {
        const p = getNodeJsDownloadParams("18.0.0", Platform.WINDOWS, "x64")

        expect(p.filenameWithExt).toBe("node-v18.0.0-win-x64.zip")
        expect(p.binaryRelPath).toBe(path.join("node-v18.0.0-win-x64", "node.exe"))
      })

      test("ia32 arch maps to x86 in URL and binary subdirectory", ({ expect }) => {
        const p = getNodeJsDownloadParams("18.0.0", Platform.WINDOWS, "ia32")

        expect(p.filenameWithExt).toBe("node-v18.0.0-win-x86.zip")
        expect(p.binaryRelPath).toBe(path.join("node-v18.0.0-win-x86", "node.exe"))
      })
    })

    test("version is embedded in releaseName, filename, and URL", ({ expect }) => {
      const p = getNodeJsDownloadParams("20.5.1", Platform.LINUX, "x64")

      expect(p.releaseName).toContain("20.5.1")
      expect(p.filenameWithExt).toContain("20.5.1")
      expect(p.overrideUrl).toContain("20.5.1")
    })
  })

  describe("getLaunchUiDownloadParams", () => {
    test("uses develar/launchui GitHub repo", ({ expect }) => {
      const p = getLaunchUiDownloadParams(LAUNCHUI_DEFAULT_VERSION, Platform.WINDOWS, "x64")

      expect(p.githubOrgRepo).toBe("develar/launchui")
    })

    test("Windows platform maps to win32 in filename", ({ expect }) => {
      const p = getLaunchUiDownloadParams(LAUNCHUI_DEFAULT_VERSION, Platform.WINDOWS, "x64")

      expect(p.filenameWithExt).toBe(`launchui-v${LAUNCHUI_DEFAULT_VERSION}-win32-x64.7z`)
      expect(p.releaseName).toBe(`v${LAUNCHUI_DEFAULT_VERSION}`)
    })

    test("macOS platform maps to mac in filename", ({ expect }) => {
      const p = getLaunchUiDownloadParams(LAUNCHUI_DEFAULT_VERSION, Platform.MAC, "x64")

      expect(p.filenameWithExt).toBe(`launchui-v${LAUNCHUI_DEFAULT_VERSION}-mac-x64.7z`)
    })

    test("Linux platform maps to linux in filename", ({ expect }) => {
      const p = getLaunchUiDownloadParams(LAUNCHUI_DEFAULT_VERSION, Platform.LINUX, "x64")

      expect(p.filenameWithExt).toBe(`launchui-v${LAUNCHUI_DEFAULT_VERSION}-linux-x64.7z`)
    })

    test("custom version is forwarded to release name and filename", ({ expect }) => {
      const p = getLaunchUiDownloadParams("0.2.0-12.0.0", Platform.LINUX, "x64")

      expect(p.releaseName).toBe("v0.2.0-12.0.0")
      expect(p.filenameWithExt).toBe("launchui-v0.2.0-12.0.0-linux-x64.7z")
    })
  })

  describe("LAUNCHUI_DEFAULT_VERSION", () => {
    test("matches the version hardcoded in the original Go binary", ({ expect }) => {
      expect(LAUNCHUI_DEFAULT_VERSION).toBe("0.1.4-10.13.0")
    })
  })

  describe("fetchNodeJsChecksum", () => {
    function makeFakeResponse(statusCode: number, body: string) {
      const res = new EventEmitter() as any
      res.statusCode = statusCode
      res.resume = vi.fn()
      // Emit data + end asynchronously so callers have time to attach listeners
      setImmediate(() => {
        if (statusCode === 200) {
          res.emit("data", Buffer.from(body))
          res.emit("end")
        }
      })
      return res
    }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    test("resolves with the hex SHA-256 when the filename is found", async ({ expect }) => {
      const sha = "a".repeat(64)
      const shasums = `${sha}  node-v20.0.0-linux-x64.tar.gz\n`
      vi.spyOn(https, "get").mockImplementation((_url: any, _opts: any, cb: any) => {
        cb(makeFakeResponse(200, shasums))
        return { on: vi.fn().mockReturnThis() } as any
      })

      const result = await fetchNodeJsChecksum("20.0.0", "node-v20.0.0-linux-x64.tar.gz")
      expect(result).toBe(sha)
    })

    test("rejects when the filename is not present in SHASUMS256.txt", async ({ expect }) => {
      const shasums = `${"b".repeat(64)}  node-v20.0.0-darwin-x64.tar.gz\n`
      vi.spyOn(https, "get").mockImplementation((_url: any, _opts: any, cb: any) => {
        cb(makeFakeResponse(200, shasums))
        return { on: vi.fn().mockReturnThis() } as any
      })

      await expect(fetchNodeJsChecksum("20.0.0", "node-v20.0.0-linux-x64.tar.gz")).rejects.toThrow("No checksum for")
    })

    test("rejects with an HTTP error when the server returns a non-200 status", async ({ expect }) => {
      vi.spyOn(https, "get").mockImplementation((_url: any, _opts: any, cb: any) => {
        cb(makeFakeResponse(404, ""))
        return { on: vi.fn().mockReturnThis() } as any
      })

      await expect(fetchNodeJsChecksum("20.0.0", "node-v20.0.0-linux-x64.tar.gz")).rejects.toThrow("HTTP 404")
    })

    test("rejects when the https request itself errors", async ({ expect }) => {
      const req = new EventEmitter() as any
      vi.spyOn(https, "get").mockImplementation((_url: any, _opts: any, _cb: any) => {
        setImmediate(() => req.emit("error", new Error("ENOTFOUND")))
        return req
      })

      await expect(fetchNodeJsChecksum("20.0.0", "node-v20.0.0-linux-x64.tar.gz")).rejects.toThrow("ENOTFOUND")
    })

    test("request URL contains the correct Node.js version and path", async ({ expect }) => {
      const sha = "c".repeat(64)
      const shasums = `${sha}  node-v18.12.0-linux-arm64.tar.gz\n`
      let capturedUrl = ""
      vi.spyOn(https, "get").mockImplementation((url: any, _opts: any, cb: any) => {
        capturedUrl = url as string
        cb(makeFakeResponse(200, shasums))
        return { on: vi.fn().mockReturnThis() } as any
      })

      await fetchNodeJsChecksum("18.12.0", "node-v18.12.0-linux-arm64.tar.gz")
      expect(capturedUrl).toBe("https://nodejs.org/dist/v18.12.0/SHASUMS256.txt")
    })
  })

  describe("validateShellEmbeddable", () => {
    describe("safe values pass", () => {
      test.each([
        ["index.js", "package.json main"],
        ["src/main.js", "package.json main"],
        ["dist/app.js", "package.json main"],
        ["my-app.js", "package.json main"],
        ["app_main.js", "package.json main"],
        ["", "empty string"],
      ])("allows %j", (value, field) => {
        expect(() => validateShellEmbeddable(value as string, field as string)).not.toThrow()
      })
    })

    describe("shell metacharacters are rejected", () => {
      test.each([
        ["index.js$(evil)", "$"],
        ["index.js`evil`", "backtick"],
        ['index.js"evil"', "double-quote"],
        ["index.js\\evil", "backslash"],
        ["index.js\nevil", "newline"],
        ["$(rm -rf /)", "command substitution"],
        ["`id`", "backtick substitution"],
      ])("rejects %j (contains %s)", value => {
        expect(() => validateShellEmbeddable(value as string, "test field")).toThrow()
      })
    })
  })
})
