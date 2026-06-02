import { afterEach, beforeEach, describe, test, vi } from "vitest"
import { resolveEnvToolsetPath } from "builder-util"
import { getBinFromUrl } from "app-builder-lib/src/binDownload"
import { getWixBin, wixChecksums } from "app-builder-lib/src/toolsets/wix"

// vi.mock is hoisted before imports by vitest. Importing the SUT from src/
// ensures vitest's transform pipeline handles module interception so mocks
// for "builder-util" and "app-builder-lib/src/binDownload" take effect.
vi.mock("builder-util", async importActual => {
  const actual = await importActual<typeof import("builder-util")>()
  return { ...actual, resolveEnvToolsetPath: vi.fn() }
})

vi.mock("app-builder-lib/src/binDownload", async importActual => {
  const actual = await importActual<typeof import("app-builder-lib/src/binDownload")>()
  return { ...actual, getBinFromUrl: vi.fn() }
})

beforeEach(() => {
  vi.mocked(resolveEnvToolsetPath).mockClear()
  vi.mocked(resolveEnvToolsetPath).mockResolvedValue(null)
  vi.mocked(getBinFromUrl).mockClear()
  vi.mocked(getBinFromUrl).mockResolvedValue("/fake/wix/path")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe.sequential("wixToolset", () => {
  describe("wixChecksums", () => {
    test("0.0.0 archive checksum is a valid sha256 hex string", ({ expect }) => {
      const checksum = wixChecksums["0.0.0"]["wix-4.0.0.5512.2.7z"]
      expect(checksum).toMatch(/^[0-9a-f]{64}$/)
    })

    test("0.0.0 archive is the expected wix-4.0.0.5512.2 release", ({ expect }) => {
      expect(Object.keys(wixChecksums["0.0.0"])).toContain("wix-4.0.0.5512.2.7z")
    })

    test("version keys are exactly 0.0.0 and 1.0.0", ({ expect }) => {
      expect(Object.keys(wixChecksums)).toEqual(["0.0.0", "1.0.0"])
    })
  })

  describe("getWixBin", () => {
    test("resolveEnvToolsetPath is always called with ELECTRON_BUILDER_WIX_PATH and 'directory'", async ({ expect }) => {
      await getWixBin(null)
      expect(resolveEnvToolsetPath).toHaveBeenCalledWith("ELECTRON_BUILDER_WIX_PATH", "directory")
    })

    test("null → downloads wix-4.0.0.5512.2 (defaults to 0.0.0)", async ({ expect }) => {
      const result = await getWixBin(null)

      expect(getBinFromUrl).toHaveBeenCalledOnce()
      expect(getBinFromUrl).toHaveBeenCalledWith("wix-4.0.0.5512.2", "wix-4.0.0.5512.2.7z", wixChecksums["0.0.0"]["wix-4.0.0.5512.2.7z"])
      expect(result).toBe("/fake/wix/path")
    })

    test("undefined → downloads wix-4.0.0.5512.2 (defaults to 0.0.0)", async ({ expect }) => {
      const result = await getWixBin(undefined)

      expect(getBinFromUrl).toHaveBeenCalledOnce()
      expect(getBinFromUrl).toHaveBeenCalledWith("wix-4.0.0.5512.2", "wix-4.0.0.5512.2.7z", wixChecksums["0.0.0"]["wix-4.0.0.5512.2.7z"])
      expect(result).toBe("/fake/wix/path")
    })

    test("'0.0.0' → downloads wix-4.0.0.5512.2", async ({ expect }) => {
      const result = await getWixBin("0.0.0")

      expect(getBinFromUrl).toHaveBeenCalledOnce()
      expect(getBinFromUrl).toHaveBeenCalledWith("wix-4.0.0.5512.2", "wix-4.0.0.5512.2.7z", wixChecksums["0.0.0"]["wix-4.0.0.5512.2.7z"])
      expect(result).toBe("/fake/wix/path")
    })

    test("ELECTRON_BUILDER_WIX_PATH set → returns override path, skips getBinFromUrl", async ({ expect }) => {
      vi.mocked(resolveEnvToolsetPath).mockResolvedValue("/custom/wix/dir")

      const result = await getWixBin("0.0.0")

      expect(result).toBe("/custom/wix/dir")
      expect(getBinFromUrl).not.toHaveBeenCalled()
    })

    test("env override takes priority even when version would throw ('1.0.0')", async ({ expect }) => {
      vi.mocked(resolveEnvToolsetPath).mockResolvedValue("/local/wix")

      const result = await getWixBin("1.0.0")

      expect(result).toBe("/local/wix")
      expect(getBinFromUrl).not.toHaveBeenCalled()
    })

    describe("version '1.0.0' without env override", () => {
      test("throws an error mentioning the version", async ({ expect }) => {
        await expect(getWixBin("1.0.0")).rejects.toThrow(/"1.0.0"/)
      })

      test("error message mentions ELECTRON_BUILDER_WIX_PATH as the workaround", async ({ expect }) => {
        await expect(getWixBin("1.0.0")).rejects.toThrow(/ELECTRON_BUILDER_WIX_PATH/)
      })

      test("error message mentions toolsets.wix as the config key", async ({ expect }) => {
        await expect(getWixBin("1.0.0")).rejects.toThrow(/toolsets\.wix/)
      })

      test("getBinFromUrl is never called", async ({ expect }) => {
        await expect(getWixBin("1.0.0")).rejects.toThrow()
        expect(getBinFromUrl).not.toHaveBeenCalled()
      })
    })

    test("each call re-checks the env override (no caching of resolveEnvToolsetPath result)", async ({ expect }) => {
      await getWixBin("0.0.0")
      await getWixBin("0.0.0")

      expect(resolveEnvToolsetPath).toHaveBeenCalledTimes(2)
    })
  })
})
