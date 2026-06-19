import { afterEach, describe, expect, test, vi } from "vitest"
import { downloadBuilderToolset, resolveBuilderBinaryUrl } from "app-builder-lib/internal"

const BASE_URL = "https://github.com/electron-userland/electron-builder-binaries/releases/download/"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("resolveBuilderBinaryUrl", { sequential: true }, () => {
  describe("default URL (no env vars)", () => {
    test("builds the standard GitHub release URL", () => {
      const url = resolveBuilderBinaryUrl("nsis-3.0.4.1", "nsis-3.0.4.1.7z", BASE_URL)
      expect(url).toBe(`${BASE_URL}nsis-3.0.4.1/nsis-3.0.4.1.7z`)
    })

    test("uses caller-supplied overrideUrl when no env vars are set", () => {
      const url = resolveBuilderBinaryUrl("nsis-3.0.4.1", "nsis-3.0.4.1.7z", BASE_URL, "https://override.example.com/custom-path")
      expect(url).toBe("https://override.example.com/custom-path/nsis-3.0.4.1.7z")
    })
  })

  describe("ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL", () => {
    test("overrides the full URL directory", () => {
      vi.stubEnv("ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL", "https://override.example.com/custom-path")
      const url = resolveBuilderBinaryUrl("nsis-3.0.4.1", "nsis-3.0.4.1.7z", BASE_URL)
      expect(url).toBe("https://override.example.com/custom-path/nsis-3.0.4.1.7z")
    })

    test("env override takes precedence over caller-supplied overrideUrl", () => {
      vi.stubEnv("ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL", "https://env.example.com/path")
      const url = resolveBuilderBinaryUrl("nsis-3.0.4.1", "nsis-3.0.4.1.7z", BASE_URL, "https://caller.example.com/path")
      expect(url).toBe("https://env.example.com/path/nsis-3.0.4.1.7z")
    })

    test("throws when the value is not a valid URL", () => {
      vi.stubEnv("ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL", "not-a-url")
      expect(() => resolveBuilderBinaryUrl("nsis-3.0.4.1", "nsis-3.0.4.1.7z", BASE_URL)).toThrow(/not a valid URL/)
    })

    test("throws when the value uses http:// instead of https://", () => {
      vi.stubEnv("ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL", "http://insecure.example.com/")
      expect(() => resolveBuilderBinaryUrl("nsis-3.0.4.1", "nsis-3.0.4.1.7z", BASE_URL)).toThrow(/must use https/)
    })
  })

  describe("ELECTRON_BUILDER_BINARIES_CUSTOM_DIR", () => {
    test("replaces the releaseName segment in the URL", () => {
      vi.stubEnv("ELECTRON_BUILDER_BINARIES_CUSTOM_DIR", "my-custom-dir")
      const url = resolveBuilderBinaryUrl("nsis-3.0.4.1", "nsis-3.0.4.1.7z", BASE_URL)
      expect(url).toBe(`${BASE_URL}my-custom-dir/nsis-3.0.4.1.7z`)
    })

    test("NPM_CONFIG_ELECTRON_BUILDER_BINARIES_CUSTOM_DIR is respected", () => {
      vi.stubEnv("NPM_CONFIG_ELECTRON_BUILDER_BINARIES_CUSTOM_DIR", "npm-cfg-dir")
      const url = resolveBuilderBinaryUrl("nsis-3.0.4.1", "nsis-3.0.4.1.7z", BASE_URL)
      expect(url).toBe(`${BASE_URL}npm-cfg-dir/nsis-3.0.4.1.7z`)
    })

    describe("rejects unsafe custom dir values", () => {
      test.each([
        ["contains ://", "http://evil.com/dir"],
        ["contains ..", "../../etc"],
        ["starts with /", "/absolute/path"],
      ])("%s", (_label, value) => {
        vi.stubEnv("ELECTRON_BUILDER_BINARIES_CUSTOM_DIR", value)
        expect(() => resolveBuilderBinaryUrl("nsis-3.0.4.1", "nsis-3.0.4.1.7z", BASE_URL)).toThrow()
      })
    })
  })
})

describe("downloadBuilderToolset", { sequential: true }, () => {
  describe("rejects unsafe filenameWithExt before any download attempt", () => {
    test.each([
      ["Unix path separator", "a/b.7z"],
      ["Windows path separator", "a\\b.7z"],
      ["leading traversal", "../evil.7z"],
      ["embedded traversal", "foo/../bar.7z"],
    ])("%s", async (_label, filename) => {
      await expect(
        downloadBuilderToolset({
          releaseName: "some-release",
          filenameWithExt: filename,
          checksums: { [filename]: "fakechecksum" },
        })
      ).rejects.toThrow(/unsafe filenameWithExt/)
    })
  })
})
