import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { afterAll, afterEach, beforeAll, vi } from "vitest"
import { ArtifactDownloadOptions, ElectronDownloadOptions, downloadBuilderToolset, downloadElectronArtifact, getCacheDirectory } from "app-builder-lib/out/util/electronGet"
import { ELECTRON_VERSION } from "./helpers/testConfig"

// ─── getCacheDirectory ────────────────────────────────────────────────────────

describe("getCacheDirectory", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("returns ELECTRON_BUILDER_CACHE when set", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_CACHE", "/custom/cache")
    expect(getCacheDirectory()).toBe("/custom/cache")
  })

  test("trims whitespace from ELECTRON_BUILDER_CACHE", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_CACHE", "  /padded/path  ")
    expect(getCacheDirectory()).toBe("/padded/path")
  })

  test("returns platform-appropriate default when env var is absent", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_CACHE", "")
    const result = getCacheDirectory()
    expect(typeof result).toBe("string")
    expect(result.length).toBeGreaterThan(0)
    if (process.platform === "darwin") {
      expect(result).toContain("Library/Caches/electron-builder")
    } else if (process.platform === "win32") {
      expect(result.toLowerCase()).toContain("electron-builder")
    } else {
      expect(result).toContain("electron-builder")
    }
  })

  test("respects XDG_CACHE_HOME on linux", ({ expect }) => {
    if (process.platform !== "linux") {
      expect(true).toBe(true) // skip assertion on non-linux
      return
    }
    vi.stubEnv("ELECTRON_BUILDER_CACHE", "")
    vi.stubEnv("XDG_CACHE_HOME", "/xdg/cache")
    expect(getCacheDirectory()).toBe("/xdg/cache/electron-builder")
  })

  test("isAvoidSystemOnWindows falls back to tmpdir for system users", ({ expect }) => {
    if (process.platform !== "win32") {
      expect(true).toBe(true)
      return
    }
    vi.stubEnv("ELECTRON_BUILDER_CACHE", "")
    vi.stubEnv("LOCALAPPDATA", "")
    const result = getCacheDirectory(true)
    expect(result).toContain(os.tmpdir())
  })
})

// ─── Shared temp cache dir for functional tests ───────────────────────────────

let testCacheDir: string

beforeAll(async () => {
  testCacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "eb-electronGet-test-"))
  process.env.ELECTRON_BUILDER_CACHE = testCacheDir
})

afterAll(async () => {
  await fs.rm(testCacheDir, { recursive: true, force: true })
})

// ─── downloadArtifact: generic artifacts (.tar.gz) ───────────────────────────

// https://github.com/electron-userland/electron-builder-binaries/releases/tag/appimage%401.0.3
const APPIMAGE_RELEASE = "appimage@1.0.3"
const APPIMAGE_FILE = "appimage-tools-runtime-20251108.tar.gz"
const APPIMAGE_SHA256 = "84021a78ee214ae6fd33a2d62a92ba25542dd10bc86bf117a9b2d0bba44e7665"
const DOWNLOAD_TIMEOUT = { timeout: 120_000 }

// sequential: tests share the same extractDir (same release + file + mirror → same hash suffix).
// Running them concurrently causes proper-lockfile contention: the first download holds the lock
// longer than the retry budget allows. Sequential order ensures test 1 writes the .complete marker
// before tests 2 and 3 run, so they hit the pre-lock cache fast-path instead of waiting on the lock.
describe("downloadBuilderToolset", { sequential: true }, () => {
  test("downloadArtifact: downloads and extracts appimage@1.0.3 tar.gz with sha256 checksum", DOWNLOAD_TIMEOUT, async ({ expect }) => {
    const result = await downloadBuilderToolset({
      releaseName: APPIMAGE_RELEASE,
      filenameWithExt: APPIMAGE_FILE,
      checksums: { [APPIMAGE_FILE]: APPIMAGE_SHA256 },
    })

    expect(typeof result).toBe("string")

    const stat = await fs.stat(result)
    expect(stat.isDirectory()).toBe(true)

    const entries = await fs.readdir(result)
    expect(entries.length).toBeGreaterThan(0)

    // appimage-tools always contains these binaries
    expect(entries).toContain("mksquashfs")
    expect(entries).toContain("desktop-file-validate")
  })

  test("downloadArtifact: second call returns same cached path without re-downloading", DOWNLOAD_TIMEOUT, async ({ expect }) => {
    const first = await downloadBuilderToolset({
      releaseName: APPIMAGE_RELEASE,
      filenameWithExt: APPIMAGE_FILE,
      checksums: { [APPIMAGE_FILE]: APPIMAGE_SHA256 },
    })
    const second = await downloadBuilderToolset({
      releaseName: APPIMAGE_RELEASE,
      filenameWithExt: APPIMAGE_FILE,
      checksums: { [APPIMAGE_FILE]: APPIMAGE_SHA256 },
    })

    expect(first).toBe(second)
    // completion marker must exist to prove it was not re-extracted
    await expect(fs.access(`${first}.complete`)).resolves.toBeUndefined()
  })

  test("downloadArtifact: respects ELECTRON_BUILDER_BINARIES_MIRROR env var", DOWNLOAD_TIMEOUT, async ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_BINARIES_MIRROR", "https://github.com/electron-userland/electron-builder-binaries/releases/download/")

    const result = await downloadBuilderToolset({
      releaseName: APPIMAGE_RELEASE,
      filenameWithExt: APPIMAGE_FILE,
      checksums: { [APPIMAGE_FILE]: APPIMAGE_SHA256 },
    })

    vi.unstubAllEnvs()

    expect(typeof result).toBe("string")
    const stat = await fs.stat(result)
    expect(stat.isDirectory()).toBe(true)
  })

  test("downloadArtifact: rejects when sha256 checksum does not match", DOWNLOAD_TIMEOUT, async ({ expect }) => {
    // Use a different release name (1.0.2 vs 1.0.3) so this test gets its own cold cache entry.
    // The cache-hit path skips checksum validation entirely, so we must avoid a pre-populated cache.
    await expect(
      downloadBuilderToolset({
        releaseName: "appimage@1.0.2",
        filenameWithExt: APPIMAGE_FILE,
        checksums: { [APPIMAGE_FILE]: "0000000000000000000000000000000000000000000000000000000000000000" },
      })
    ).rejects.toThrow()
  })
})

// ─── downloadElectronArtifact: electron platform artifacts (.zip) ────────────

// Resolve electron platform/arch naming from Node process values
const electronPlatform = process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux"
const electronArch = process.arch === "arm64" ? "arm64" : "x64"

// Expected ffmpeg library filename by platform
const ffmpegLibName = electronPlatform === "darwin" ? "libffmpeg.dylib" : electronPlatform === "linux" ? "libffmpeg.so" : "ffmpeg.dll"

test("downloadElectronArtifact: downloads and extracts electron ffmpeg zip for current platform", DOWNLOAD_TIMEOUT, async ({ expect }) => {
  const options: ArtifactDownloadOptions = {
    artifactName: "ffmpeg",
    platformName: electronPlatform,
    arch: electronArch,
    version: ELECTRON_VERSION,
  }

  const result = await downloadElectronArtifact(options, null)

  expect(typeof result).toBe("string")

  const stat = await fs.stat(result)
  expect(stat.isDirectory()).toBe(true)

  // ffmpeg zip puts the lib at the root of the archive
  const libPath = path.join(result, ffmpegLibName)
  const libStat = await fs.stat(libPath)
  expect(libStat.isFile()).toBe(true)
  expect(libStat.size).toBeGreaterThan(0)
})

test("downloadElectronArtifact: deduplicates concurrent calls for the same artifact", DOWNLOAD_TIMEOUT, async ({ expect }) => {
  const options: ArtifactDownloadOptions = {
    artifactName: "ffmpeg",
    platformName: electronPlatform,
    arch: electronArch,
    version: ELECTRON_VERSION,
  }

  // Fire three concurrent downloads; all must resolve to the same path
  const [a, b, c] = await Promise.all([downloadElectronArtifact(options, null), downloadElectronArtifact(options, null), downloadElectronArtifact(options, null)])

  expect(a).toBe(b)
  expect(b).toBe(c)
})

test("downloadElectronArtifact: applies legacy ElectronDownloadOptions mirror settings", DOWNLOAD_TIMEOUT, async ({ expect }) => {
  const legacyOptions: ElectronDownloadOptions = {
    mirror: "https://github.com/electron/electron/releases/download/",
  }

  const options: ArtifactDownloadOptions = {
    artifactName: "ffmpeg",
    platformName: electronPlatform,
    arch: electronArch,
    version: ELECTRON_VERSION,
    electronDownload: legacyOptions,
  }

  const result = await downloadElectronArtifact(options, null)

  expect(typeof result).toBe("string")
  const stat = await fs.stat(result)
  expect(stat.isDirectory()).toBe(true)
})

test("downloadElectronArtifact: isVerifyChecksum:false skips checksum validation", DOWNLOAD_TIMEOUT, async ({ expect }) => {
  const options: ArtifactDownloadOptions = {
    artifactName: "ffmpeg",
    platformName: electronPlatform,
    arch: electronArch,
    version: ELECTRON_VERSION,
    electronDownload: { isVerifyChecksum: false } satisfies ElectronDownloadOptions,
  }

  const result = await downloadElectronArtifact(options, null)
  expect(typeof result).toBe("string")
  await expect(fs.stat(result)).resolves.toBeDefined()
})

// ─── downloadElectronArtifact: electron distribution zip (heavy) ──────────────

test.heavy("downloadElectronArtifact: downloads and extracts full electron distribution zip", { timeout: 300_000 }, async ({ expect }) => {
  const options: ArtifactDownloadOptions = {
    artifactName: "electron",
    platformName: electronPlatform,
    arch: electronArch,
    version: ELECTRON_VERSION,
  }

  const result = await downloadElectronArtifact(options, null)

  expect(typeof result).toBe("string")
  const stat = await fs.stat(result)
  expect(stat.isDirectory()).toBe(true)

  const entries = await fs.readdir(result)
  expect(entries.length).toBeGreaterThan(0)

  // electron distribution always ships a version file
  expect(entries).toContain("version")
})
