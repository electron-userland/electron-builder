import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { afterAll, afterEach, beforeAll, vi } from "vitest"
import {
  ArtifactDownloadOptions,
  ElectronDownloadOptions,
  ElectronGetOptions,
  downloadBuilderToolset,
  downloadElectronArtifact,
  getCacheDirectory,
  getBinariesMirrorUrl,
} from "app-builder-lib/out/util/electronGet"
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

describe("getBinariesMirrorUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // Belt-and-suspenders: vi.unstubAllEnvs() may silently no-op on Windows when the OS
  // normalises env var names to a different case than the key stored in Vitest's registry.
  // Explicit delete guarantees nothing leaks into the functional download tests below.
  afterAll(() => {
    for (const key of [
      "NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR",
      "npm_config_electron_builder_binaries_mirror",
      "npm_package_config_electron_builder_binaries_mirror",
      "ELECTRON_BUILDER_BINARIES_MIRROR",
    ]) {
      delete process.env[key]
    }
  })

  test("returns GitHub default when no env var is set", ({ expect }) => {
    expect(getBinariesMirrorUrl("my-org/my-repo")).toBe("https://github.com/my-org/my-repo/releases/download/")
  })

  test("uses the provided githubOrgRepo in the default URL", ({ expect }) => {
    expect(getBinariesMirrorUrl("electron-userland/electron-builder-binaries")).toBe("https://github.com/electron-userland/electron-builder-binaries/releases/download/")
  })

  test("ELECTRON_BUILDER_BINARIES_MIRROR overrides the GitHub default", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_BINARIES_MIRROR", "https://mirror.example.com/")
    expect(getBinariesMirrorUrl("any/repo")).toBe("https://mirror.example.com/")
  })

  test("npm_package_config_electron_builder_binaries_mirror is recognised", ({ expect }) => {
    vi.stubEnv("npm_package_config_electron_builder_binaries_mirror", "https://package-config.example.com/")
    expect(getBinariesMirrorUrl("any/repo")).toBe("https://package-config.example.com/")
  })

  test("npm_config_electron_builder_binaries_mirror (lowercase) is recognised", ({ expect }) => {
    vi.stubEnv("npm_config_electron_builder_binaries_mirror", "https://lowercase.example.com/")
    expect(getBinariesMirrorUrl("any/repo")).toBe("https://lowercase.example.com/")
  })

  test("NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR (uppercase) is recognised", ({ expect }) => {
    vi.stubEnv("NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR", "https://uppercase.example.com/")
    expect(getBinariesMirrorUrl("any/repo")).toBe("https://uppercase.example.com/")
  })

  test("priority: NPM_CONFIG_ > npm_config_ > npm_package_config_ > ELECTRON_BUILDER_BINARIES_MIRROR", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_BINARIES_MIRROR", "https://priority-4.example.com/")
    vi.stubEnv("npm_package_config_electron_builder_binaries_mirror", "https://priority-3.example.com/")
    vi.stubEnv("npm_config_electron_builder_binaries_mirror", "https://priority-2.example.com/")
    vi.stubEnv("NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR", "https://priority-1.example.com/")
    expect(getBinariesMirrorUrl("any/repo")).toBe("https://priority-1.example.com/")
  })

  test("npm_config_ beats npm_package_config_ when NPM_CONFIG_ is absent", ({ expect }) => {
    vi.stubEnv("NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR", "") // ensure higher-priority var is absent
    vi.stubEnv("npm_package_config_electron_builder_binaries_mirror", "https://priority-3.example.com/")
    vi.stubEnv("npm_config_electron_builder_binaries_mirror", "https://priority-2.example.com/")
    expect(getBinariesMirrorUrl("any/repo")).toBe("https://priority-2.example.com/")
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

// sequential: tests that download the same GitHub artifact (same URL → same @electron/get cache key)
// must not run concurrently. @electron/get's putFileInCache has no internal locking; concurrent moves
// to the same cache path produce "dest already exists." from fs-extra. Sequential order ensures the
// first test populates the cache, and subsequent tests get a cache hit.
describe("downloadElectronArtifact", { sequential: true }, () => {
  test("downloads and extracts electron ffmpeg zip for current platform", DOWNLOAD_TIMEOUT, async ({ expect }) => {
    const options: ArtifactDownloadOptions = {
      artifactName: "ffmpeg",
      platformName: electronPlatform,
      arch: electronArch,
      version: ELECTRON_VERSION,
    }

    const result = await downloadElectronArtifact(options)

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
    const [a, b, c] = await Promise.all([downloadElectronArtifact(options), downloadElectronArtifact(options), downloadElectronArtifact(options)])

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

    const result = await downloadElectronArtifact(options)

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

    const result = await downloadElectronArtifact(options)
    expect(typeof result).toBe("string")
    await expect(fs.stat(result)).resolves.toBeDefined()
  })

  // Addresses #9205: electronDownload.customDir was not being mapped to mirrorOptions.customDir
  // in the @electron/get call. Setting it to the canonical "v${version}" directory verifies
  // the mapping is honoured without needing a custom server.
  test("downloadElectronArtifact: maps electronDownload.customDir to mirrorOptions.customDir", DOWNLOAD_TIMEOUT, async ({ expect }) => {
    const options: ArtifactDownloadOptions = {
      artifactName: "ffmpeg",
      platformName: electronPlatform,
      arch: electronArch,
      version: ELECTRON_VERSION,
      electronDownload: {
        mirror: "https://github.com/electron/electron/releases/download/",
        customDir: `v${ELECTRON_VERSION}`,
      } satisfies ElectronDownloadOptions,
    }

    const result = await downloadElectronArtifact(options)
    expect(typeof result).toBe("string")
    const stat = await fs.stat(result)
    expect(stat.isDirectory()).toBe(true)
    const libPath = path.join(result, ffmpegLibName)
    await expect(fs.stat(libPath)).resolves.toBeDefined()
  })

  // Addresses #9205 (new-style config): verifies the isElectronGetOptions() discriminator
  // correctly routes ElectronGetOptions through the new path.
  // Uses unsafelyDisableChecksums (another ELECTRON_GET_EXCLUSIVE_KEY) rather than mirrorOptions
  // so that the effective download URL and @electron/get cache key are identical to the baseline
  // download — avoiding a redundant network request in CI environments with a pre-warmed cache.
  test("downloadElectronArtifact: routes ElectronGetOptions through the isElectronGetOptions discriminator", DOWNLOAD_TIMEOUT, async ({ expect }) => {
    const options: ArtifactDownloadOptions = {
      artifactName: "ffmpeg",
      platformName: electronPlatform,
      arch: electronArch,
      version: ELECTRON_VERSION,
      electronDownload: {
        unsafelyDisableChecksums: false, // same behaviour as default; key presence triggers ElectronGetOptions path
      } satisfies ElectronGetOptions,
    }

    const result = await downloadElectronArtifact(options)
    expect(typeof result).toBe("string")
    const stat = await fs.stat(result)
    expect(stat.isDirectory()).toBe(true)
  })

  // Addresses #8687: building for arm64 on an x64 host (or vice-versa) failed because
  // electron.exe was not found after extraction. Verifies cross-arch downloads succeed.
  test("downloadElectronArtifact: downloads ffmpeg for non-host arch (cross-arch build)", DOWNLOAD_TIMEOUT, async ({ expect }) => {
    if (electronPlatform === "win32") {
      // arm64 ffmpeg is not published separately for win32 in the same zip layout
      expect(true).toBe(true)
      return
    }
    const crossArch = electronArch === "arm64" ? "x64" : "arm64"
    const options: ArtifactDownloadOptions = {
      artifactName: "ffmpeg",
      platformName: electronPlatform,
      arch: crossArch,
      version: ELECTRON_VERSION,
    }

    const result = await downloadElectronArtifact(options)
    expect(typeof result).toBe("string")
    const stat = await fs.stat(result)
    expect(stat.isDirectory()).toBe(true)
  })

  // ─── downloadElectronArtifact: electron distribution zip (heavy) ──────────────

  test.heavy("downloadElectronArtifact: downloads and extracts full electron distribution zip", { timeout: 300_000 }, async ({ expect }) => {
    const options: ArtifactDownloadOptions = {
      artifactName: "electron",
      platformName: electronPlatform,
      arch: electronArch,
      version: ELECTRON_VERSION,
    }

    const result = await downloadElectronArtifact(options)

    expect(typeof result).toBe("string")
    const stat = await fs.stat(result)
    expect(stat.isDirectory()).toBe(true)

    const entries = await fs.readdir(result)
    expect(entries.length).toBeGreaterThan(0)

    // electron distribution always ships a version file
    expect(entries).toContain("version")
  })
})
