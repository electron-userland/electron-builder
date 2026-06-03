import * as path from "path"
import { describe, expect } from "vitest"
import { Platform } from "app-builder-lib/src/core"
import { getLaunchUiDownloadParams, getNodeJsDownloadParams, LAUNCHUI_DEFAULT_VERSION, validateShellEmbeddable } from "app-builder-lib/src/frameworks/LibUiFramework"

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
