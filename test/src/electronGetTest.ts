import * as get from "@electron/get"
import * as fs from "fs/promises"
import * as http from "http"
import * as net from "net"
import * as os from "os"
import * as path from "path"
import * as tar from "tar"
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest"
import {
  ArtifactDownloadOptions,
  CacheState,
  ElectronDownloadOptions,
  ElectronGetOptions,
  downloadBuilderToolset,
  downloadElectronArtifact,
  getCacheDirectory,
  getBinariesMirrorUrl,
} from "app-builder-lib/internal"
import { ELECTRON_VERSION } from "./helpers/testConfig"

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Creates a minimal tar.gz with a nested directory so tar.extract({ strip: 1 }) works.
 * Entry layout: inner/<name> — strip:1 extracts <name> directly into the target dir.
 */
async function createMinimalTarGz(archivePath: string, files: Record<string, string>): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eb-test-tar-"))
  try {
    const innerDir = path.join(tmpDir, "inner")
    await fs.mkdir(innerDir)
    for (const [name, content] of Object.entries(files)) {
      await fs.writeFile(path.join(innerDir, name), content)
    }
    await tar.create({ gzip: true, file: archivePath, cwd: tmpDir }, ["inner"])
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

// ─── getCacheDirectory ────────────────────────────────────────────────────────

describe("getCacheDirectory", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("returns ELECTRON_BUILDER_CACHE when set", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_CACHE", "/custom/cache")
    expect(getCacheDirectory({ allowEnvVarOverride: true })).toBe("/custom/cache")
  })

  test("trims whitespace from ELECTRON_BUILDER_CACHE", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_CACHE", "  /padded/path  ")
    expect(getCacheDirectory({ allowEnvVarOverride: true })).toBe("/padded/path")
  })

  test("returns platform-appropriate default when env var is absent", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_CACHE", "")
    const result = getCacheDirectory({ allowEnvVarOverride: true })
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
    expect(getCacheDirectory({ allowEnvVarOverride: true })).toBe("/xdg/cache/electron-builder")
  })

  test("falls back to tmpdir when LOCALAPPDATA is absent on Windows", ({ expect }) => {
    if (process.platform !== "win32") {
      expect(true).toBe(true)
      return
    }
    vi.stubEnv("LOCALAPPDATA", "")
    const result = getCacheDirectory({ isAvoidSystemOnWindows: true, allowEnvVarOverride: false })
    expect(result).toContain(os.tmpdir())
  })

  test("allowEnvVarOverride:false ignores ELECTRON_BUILDER_CACHE even when set", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_CACHE", "/custom/cache")
    const result = getCacheDirectory({ allowEnvVarOverride: false })
    expect(result).not.toBe("/custom/cache")
    expect(result).toContain("electron-builder")
  })

  test("ignores ELECTRON_BUILDER_CACHE when value has no filesystem root (relative path)", ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_CACHE", "relative/path/no-root")
    const result = getCacheDirectory({ allowEnvVarOverride: true })
    expect(result).not.toBe("relative/path/no-root")
    expect(result).toContain("electron-builder")
  })

  test("falls back to tmpdir when USERNAME is 'system' (isAvoidSystemOnWindows defaults to true)", ({ expect }) => {
    if (process.platform !== "win32") {
      expect(true).toBe(true)
      return
    }
    vi.stubEnv("LOCALAPPDATA", "C:\\Users\\system\\AppData\\Local")
    vi.stubEnv("USERNAME", "system")
    const result = getCacheDirectory({ allowEnvVarOverride: false })
    expect(result).toContain(os.tmpdir())
  })

  test("falls back to tmpdir when LOCALAPPDATA path contains \\windows\\system32\\", ({ expect }) => {
    if (process.platform !== "win32") {
      expect(true).toBe(true)
      return
    }
    vi.stubEnv("LOCALAPPDATA", "C:\\Windows\\System32\\config\\systemprofile\\AppData\\Local")
    vi.stubEnv("USERNAME", "not-system")
    const result = getCacheDirectory({ allowEnvVarOverride: false })
    expect(result).toContain(os.tmpdir())
  })

  test("isAvoidSystemOnWindows:false does not fall back to tmpdir for USERNAME=system", ({ expect }) => {
    if (process.platform !== "win32") {
      expect(true).toBe(true)
      return
    }
    vi.stubEnv("LOCALAPPDATA", "C:\\Users\\system\\AppData\\Local")
    vi.stubEnv("USERNAME", "system")
    const result = getCacheDirectory({ isAvoidSystemOnWindows: false, allowEnvVarOverride: false })
    expect(result).not.toContain(os.tmpdir())
    expect(result).toContain("electron-builder")
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
// longer than the retry budget allows. Sequential order ensures test 1 writes the complete state
// before tests 2 and 3 run, so they hit the pre-lock cache fast-path instead of waiting on the lock.
describe("downloadBuilderToolset", { sequential: true }, () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

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
    // state file must record complete to prove it was not re-extracted
    const stateRaw = await fs.readFile(`${first}.state`, "utf-8")
    expect(JSON.parse(stateRaw).state).toBe(CacheState.complete)
  })

  test("downloadArtifact: respects ELECTRON_BUILDER_BINARIES_MIRROR env var", DOWNLOAD_TIMEOUT, async ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_BINARIES_MIRROR", "https://github.com/electron-userland/electron-builder-binaries/releases/download/")

    const result = await downloadBuilderToolset({
      releaseName: APPIMAGE_RELEASE,
      filenameWithExt: APPIMAGE_FILE,
      checksums: { [APPIMAGE_FILE]: APPIMAGE_SHA256 },
    })

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

  // Regression test for https://github.com/electron-userland/electron-builder/issues/9752
  // @electron/get's mirrorVar() checks ELECTRON_MIRROR before opts.mirror, so passing
  // mirrorOptions.mirror would let ELECTRON_MIRROR silently override the builder-binaries URL.
  // Using resolveAssetURL bypasses that env var check entirely.
  // This test intercepts the config actually passed to get.downloadArtifact and verifies
  // that resolveAssetURL() returns the builder-binaries URL even when ELECTRON_MIRROR is set.
  test("ELECTRON_MIRROR env var does not corrupt builder-binaries download URL (#9752)", async ({ expect }) => {
    vi.stubEnv("ELECTRON_MIRROR", "https://cdn.npmmirror.com/binaries/electron/")

    let resolvedUrl: string | undefined
    const spy = vi.spyOn(get, "downloadArtifact").mockImplementationOnce(async config => {
      resolvedUrl = await (config.mirrorOptions?.resolveAssetURL as any)?.()
      throw new Error("mock-stop")
    })

    await expect(
      downloadBuilderToolset({
        releaseName: "dmg-builder@1.2.2",
        filenameWithExt: "dmgbuild-bundle-arm64-75c8a6c.tar.gz",
      })
    ).rejects.toThrow("mock-stop")

    expect(resolvedUrl).toBeDefined()
    expect(resolvedUrl).toContain("electron-builder-binaries")
    expect(resolvedUrl).not.toContain("cdn.npmmirror.com/binaries/electron")

    spy.mockRestore()
  })
})

// ─── downloadBuilderToolset: filenameWithExt validation ──────────────────────

describe("downloadBuilderToolset: filenameWithExt validation", () => {
  const cases: Array<[string, string]> = [
    ["Unix path separator", "subdir/evil.tar.gz"],
    ["Windows path separator", "subdir\\evil.tar.gz"],
    ["dotdot traversal", "../etc/passwd"],
    ["dotdot embedded", "foo/../bar.tar.gz"],
  ]
  for (const [label, filenameWithExt] of cases) {
    test(`rejects unsafe filenameWithExt: ${label}`, async ({ expect }) => {
      await expect(downloadBuilderToolset({ releaseName: "x", filenameWithExt })).rejects.toThrow(/unsafe filenameWithExt/)
    })
  }
})

// ─── Toolset archive cache (no network) ──────────────────────────────────────

describe("toolset archive cache", () => {
  let freshCache: string

  beforeEach(async () => {
    freshCache = await fs.mkdtemp(path.join(os.tmpdir(), "eb-archive-cache-test-"))
    vi.stubEnv("ELECTRON_BUILDER_CACHE", freshCache)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    await fs.rm(freshCache, { recursive: true, force: true })
  })

  test("uses pre-existing archive and does not call downloadArtifact", async ({ expect }) => {
    const releaseName = "cache-test@0.1"
    const fileName = "cache-artifact.tar.gz"
    // Seed the predictable archive cache path
    const archiveCachePath = path.join(freshCache, releaseName, fileName)
    await fs.mkdir(path.dirname(archiveCachePath), { recursive: true })
    await createMinimalTarGz(archiveCachePath, { sentinel: "ok" })

    const spy = vi.spyOn(get, "downloadArtifact").mockImplementation(() => {
      throw new Error("downloadArtifact must not be called — archive is already cached")
    })

    const result = await downloadBuilderToolset({ releaseName, filenameWithExt: fileName })

    expect(spy).not.toHaveBeenCalled()
    const entries = await fs.readdir(result)
    expect(entries).toContain("sentinel")
  })

  test("re-downloads and replaces archive when checksum does not match", async ({ expect }) => {
    const releaseName = "checksum-test@0.1"
    const fileName = "bad-checksum.tar.gz"
    const archiveCachePath = path.join(freshCache, releaseName, fileName)
    await fs.mkdir(path.dirname(archiveCachePath), { recursive: true })
    // Write a corrupt (wrong-checksum) archive
    await fs.writeFile(archiveCachePath, "corrupt data")

    let downloadArtifactCalled = false
    vi.spyOn(get, "downloadArtifact").mockImplementation(() => {
      downloadArtifactCalled = true
      throw new Error("expected-download-attempt")
    })

    const correctSha256 = "0000000000000000000000000000000000000000000000000000000000000000"
    await expect(downloadBuilderToolset({ releaseName, filenameWithExt: fileName, checksums: { [fileName]: correctSha256 } })).rejects.toThrow("expected-download-attempt")

    expect(downloadArtifactCalled).toBe(true)
  })

  test("persists downloaded archive to cache so subsequent builds skip the download", async ({ expect }) => {
    const releaseName = "persist-test@0.1"
    const fileName = "persist-artifact.tar.gz"
    const archiveCachePath = path.join(freshCache, releaseName, fileName)

    // First call: downloadArtifact returns a real archive
    const networkArchive = path.join(freshCache, "fake-network-download.tar.gz")
    await createMinimalTarGz(networkArchive, { "network-file": "content" })
    let callCount = 0
    vi.spyOn(get, "downloadArtifact").mockImplementation(() => {
      callCount++
      return Promise.resolve(networkArchive)
    })

    await downloadBuilderToolset({ releaseName, filenameWithExt: fileName })
    expect(callCount).toBe(1)
    // Archive must have been persisted
    await expect(fs.access(archiveCachePath)).resolves.toBeUndefined()

    // Second call: archive is cached — downloadArtifact must not be called
    vi.restoreAllMocks()
    vi.spyOn(get, "downloadArtifact").mockImplementation(() => {
      throw new Error("downloadArtifact must not be called on second build")
    })

    const result2 = await downloadBuilderToolset({ releaseName, filenameWithExt: fileName })
    const entries = await fs.readdir(result2)
    expect(entries).toContain("network-file")
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
      options: legacyOptions,
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
      options: { isVerifyChecksum: false } satisfies ElectronDownloadOptions,
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
      options: {
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
      options: {
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

// ─── Proxy integration ────────────────────────────────────────────────────────

async function startRecordingProxy() {
  const connectTargets: string[] = []
  const server = http.createServer()
  server.on("connect", (req, socket) => {
    connectTargets.push(req.url ?? "")
    socket.write("HTTP/1.1 503 Proxy Refused\r\n\r\n")
    socket.destroy()
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as net.AddressInfo
  const close = () => new Promise<void>(resolve => server.close(() => resolve()))
  return { port, connectTargets, close }
}

describe("proxy integration", () => {
  test("routes download requests through HTTPS_PROXY when set", { timeout: 15_000 }, async ({ expect }) => {
    const proxy = await startRecordingProxy()
    const freshCache = await fs.mkdtemp(path.join(os.tmpdir(), "eb-proxy-integration-"))
    vi.stubEnv("HTTPS_PROXY", `http://127.0.0.1:${proxy.port}`)
    vi.stubEnv("ELECTRON_BUILDER_CACHE", freshCache)

    try {
      await expect(
        downloadBuilderToolset({
          releaseName: APPIMAGE_RELEASE,
          filenameWithExt: APPIMAGE_FILE,
          checksums: { [APPIMAGE_FILE]: APPIMAGE_SHA256 },
        })
      ).rejects.toThrow() // proxy refuses tunnel — download fails, that's expected
    } finally {
      vi.unstubAllEnvs()
      await proxy.close()
      await fs.rm(freshCache, { recursive: true, force: true })
    }

    // Core assertion: got sent CONNECT to our proxy, proving the agent is wired through
    expect(
      proxy.connectTargets.some(t => {
        try {
          return new URL(`http://${t}`).hostname.toLowerCase() === "github.com"
        } catch {
          return false
        }
      })
    ).toBe(true)
  })
})
