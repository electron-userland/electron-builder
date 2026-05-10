import * as os from "os"
import * as path from "path"
import { afterEach, beforeEach, describe, test, vi } from "vitest"
import { getBin, getBinFromCustomLoc, getBinFromUrl } from "app-builder-lib/src/binDownload"
import { downloadBuilderToolset } from "app-builder-lib/src/util/electronGet"

// vi.mock is hoisted before imports by vitest. Importing from `src/` (TypeScript
// sources) ensures vitest's transform pipeline handles module interception.
// We inline getBinariesMirrorUrl so we don't need importActual.
vi.mock("app-builder-lib/src/util/electronGet", () => ({
  downloadBuilderToolset: vi.fn(),
  getBinariesMirrorUrl: vi.fn((repo = "electron-userland/electron-builder-binaries") => {
    for (const k of [
      "NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR",
      "npm_config_electron_builder_binaries_mirror",
      "npm_package_config_electron_builder_binaries_mirror",
      "ELECTRON_BUILDER_BINARIES_MIRROR",
    ]) {
      const v = process.env[k]
      if (v) {
        return v.endsWith("/") ? v : `${v}/`
      }
    }
    return `https://github.com/${repo}/releases/download/`
  }),
}))

// Unique ELECTRON_BUILDER_CACHE per test prevents the module-level
// versionToPromise Map from returning a cached promise from a prior test.
// Explicit mockClear() because vi.clearAllMocks() does not flush vi.fn()
// instances created inside a vi.mock() factory.
beforeEach(() => {
  vi.stubEnv("ELECTRON_BUILDER_CACHE", path.join(os.tmpdir(), `eb-test-${Date.now()}-${Math.random()}`))
  vi.mocked(downloadBuilderToolset).mockClear()
  vi.mocked(downloadBuilderToolset).mockResolvedValue("/fake/path")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// sequence.concurrent is enabled globally; describe.sequential opts this suite
// back to serial execution so mock call counts don't bleed between tests.
describe.sequential("binDownload", () => {
  // ─── getBinFromUrl ──────────────────────────────────────────────────────────

  describe("getBinFromUrl", () => {
    test("constructs default GitHub URL and calls downloadBuilderToolset", async ({ expect }) => {
      await getBinFromUrl("linux-tools-mac-10.12.3", "linux-tools-mac-10.12.3.7z", "fakechecksum123")

      expect(downloadBuilderToolset).toHaveBeenCalledOnce()
      const call = vi.mocked(downloadBuilderToolset).mock.calls[0][0]
      expect(call.releaseName).toBe("linux-tools-mac-10.12.3")
      expect(call.filenameWithExt).toBe("linux-tools-mac-10.12.3.7z")
      expect(call.checksums).toEqual({ "linux-tools-mac-10.12.3.7z": "fakechecksum123" })
      expect(call.overrideUrl).toContain("linux-tools-mac-10.12.3")
    })

    test("uses ELECTRON_BUILDER_BINARIES_MIRROR when set", async ({ expect }) => {
      vi.stubEnv("ELECTRON_BUILDER_BINARIES_MIRROR", "https://mirror.example.com/")

      await getBinFromUrl("nsis-3.0.4.1", "nsis-3.0.4.1.7z", "fakechecksum")

      expect(downloadBuilderToolset).toHaveBeenCalledOnce()
      const call = vi.mocked(downloadBuilderToolset).mock.calls[0][0]
      expect(call.overrideUrl).toContain("mirror.example.com")
    })

    test("uses ELECTRON_BUILDER_BINARIES_CUSTOM_DIR when set", async ({ expect }) => {
      vi.stubEnv("ELECTRON_BUILDER_BINARIES_CUSTOM_DIR", "my-custom-dir")

      await getBinFromUrl("nsis-3.0.4.1", "nsis-3.0.4.1.7z", "fakechecksum")

      expect(downloadBuilderToolset).toHaveBeenCalledOnce()
      const call = vi.mocked(downloadBuilderToolset).mock.calls[0][0]
      expect(call.overrideUrl).toContain("my-custom-dir")
    })

    test("uses ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL when set", async ({ expect }) => {
      vi.stubEnv("ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL", "https://override.example.com/custom-path")

      await getBinFromUrl("nsis-3.0.4.1", "nsis-3.0.4.1.7z", "fakechecksum")

      expect(downloadBuilderToolset).toHaveBeenCalledOnce()
      const call = vi.mocked(downloadBuilderToolset).mock.calls[0][0]
      expect(call.overrideUrl).toBe("https://override.example.com/custom-path")
    })

    test("deduplicates concurrent calls for the same artifact", async ({ expect }) => {
      let resolveDownload!: (v: string) => void
      vi.mocked(downloadBuilderToolset).mockReturnValueOnce(new Promise(r => (resolveDownload = r)))

      const p1 = getBinFromUrl("fpm-dedup", "fpm-dedup.7z", "fakechecksum")
      const p2 = getBinFromUrl("fpm-dedup", "fpm-dedup.7z", "fakechecksum")

      resolveDownload("/resolved/path")
      const [r1, r2] = await Promise.all([p1, p2])

      expect(downloadBuilderToolset).toHaveBeenCalledOnce()
      expect(r1).toBe(r2)
    })
  })

  // ─── getBin ─────────────────────────────────────────────────────────────────

  describe("getBin", () => {
    test("throws when called without a URL", ({ expect }) => {
      expect(() => getBin("someKey")).toThrow(/download URL is required/)
    })

    test("routes URL-based call through downloadBuilderToolset", async ({ expect }) => {
      const result = await getBin("my-cache-key", "https://example.com/releases/tool-1.0/tool-1.0.7z", "sha256abc")

      expect(downloadBuilderToolset).toHaveBeenCalledOnce()
      const call = vi.mocked(downloadBuilderToolset).mock.calls[0][0]
      expect(call.filenameWithExt).toBe("tool-1.0.7z")
      expect(call.releaseName).toBe("tool-1.0")
      expect(call.overrideUrl).toBe("https://example.com/releases/tool-1.0")
      expect(call.checksums).toEqual({ "tool-1.0.7z": "sha256abc" })
      expect(result).toBe("/fake/path")
    })

    test("passes checksums: undefined when no checksum given", async ({ expect }) => {
      await getBin("my-cache-key-2", "https://example.com/releases/tool-2.0/tool-2.0.7z")

      const call = vi.mocked(downloadBuilderToolset).mock.calls[0][0]
      expect(call.checksums).toBeUndefined()
    })
  })

  // ─── getBinFromCustomLoc ────────────────────────────────────────────────────

  describe("getBinFromCustomLoc", () => {
    test("decomposes custom URL and routes through downloadBuilderToolset", async ({ expect }) => {
      const result = await getBinFromCustomLoc("nsis", "3.0.4.1", "https://custom.host/dist/nsis-3.0.4.1/nsis-3.0.4.1.7z", "sha256custom")

      expect(downloadBuilderToolset).toHaveBeenCalledOnce()
      const call = vi.mocked(downloadBuilderToolset).mock.calls[0][0]
      expect(call.filenameWithExt).toBe("nsis-3.0.4.1.7z")
      expect(call.overrideUrl).toBe("https://custom.host/dist/nsis-3.0.4.1")
      expect(call.checksums).toEqual({ "nsis-3.0.4.1.7z": "sha256custom" })
      expect(result).toBe("/fake/path")
    })
  })
})
