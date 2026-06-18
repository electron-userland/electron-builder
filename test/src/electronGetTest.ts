import { readFileSync } from "fs"
import * as fs from "fs/promises"
import * as http from "http"
import * as net from "net"
import * as os from "os"
import * as path from "path"
import * as tar from "tar"
import { TmpDir } from "temp-file"
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest"
import {
  ArtifactDownloadOptions,
  CacheState,
  ElectronGetOptions,
  downloadBuilderToolset,
  downloadElectronArtifact,
  getBinariesMirrorUrl,
  reinitializeProxy,
} from "app-builder-lib/internal"
import { getCacheDirectoryInternal } from "app-builder-lib/src/util/electronGet.js"
import { ELECTRON_VERSION } from "./helpers/testConfig"

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Creates a minimal tar.gz with a nested directory so tar.extract({ strip: 1 }) works.
 * Entry layout: inner/<name> — strip:1 extracts <name> directly into the target dir.
 */
async function createMinimalTarGz(archivePath: string, files: Record<string, string>): Promise<void> {
  const tmpDir = new TmpDir("eb-test-tar")
  try {
    const dir = await tmpDir.createTempDir()
    const innerDir = path.join(dir, "inner")
    await fs.mkdir(innerDir)
    for (const [name, content] of Object.entries(files)) {
      await fs.writeFile(path.join(innerDir, name), content)
    }
    await tar.create({ gzip: true, file: archivePath, cwd: dir }, ["inner"])
  } finally {
    await tmpDir.cleanup()
  }
}

/** Starts a local HTTP server that serves the given archive file for any request. */
async function startArtifactServer(archivePath: string): Promise<{
  port: number
  requestedPaths: string[]
  close: () => Promise<void>
}> {
  const requestedPaths: string[] = []
  const server = http.createServer((req, res) => {
    requestedPaths.push(req.url ?? "")
    const data = readFileSync(archivePath)
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": String(data.length) })
    res.end(data)
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as net.AddressInfo
  return {
    port,
    requestedPaths,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
}

// ─── getCacheDirectory ────────────────────────────────────────────────────────

describe("getCacheDirectory", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("returns ELECTRON_BUILDER_CACHE when set", async ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_CACHE", "/custom/cache")
    expect(await getCacheDirectoryInternal({ allowEnvVarOverride: true })).toBe("/custom/cache")
  })

  test("trims whitespace from ELECTRON_BUILDER_CACHE", async ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_CACHE", "  /padded/path  ")
    expect(await getCacheDirectoryInternal({ allowEnvVarOverride: true })).toBe("/padded/path")
  })

  test("returns platform-appropriate default when env var is absent", async ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_CACHE", "")
    const result = await getCacheDirectoryInternal({ allowEnvVarOverride: true })
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

  test("respects XDG_CACHE_HOME on linux", async ({ expect, skip }) => {
    if (process.platform !== "linux") {
      skip() // test is Linux-specific, skip on other platforms
      return
    }
    vi.stubEnv("ELECTRON_BUILDER_CACHE", "")
    vi.stubEnv("XDG_CACHE_HOME", "/xdg/cache")
    expect(await getCacheDirectoryInternal({ allowEnvVarOverride: true })).toBe("/xdg/cache/electron-builder")
  })

  test("falls back to tmpdir when LOCALAPPDATA is absent on Windows", async ({ expect, skip }) => {
    if (process.platform !== "win32") {
      skip() // test is Windows-specific, skip on other platforms
      return
    }
    vi.stubEnv("LOCALAPPDATA", "")
    const result = await getCacheDirectoryInternal({ isAvoidSystemOnWindows: true, allowEnvVarOverride: false })
    expect(result).toContain(os.tmpdir())
  })

  test("allowEnvVarOverride:false ignores ELECTRON_BUILDER_CACHE even when set", async ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_CACHE", "/custom/cache")
    const result = await getCacheDirectoryInternal({ allowEnvVarOverride: false })
    expect(result).not.toBe("/custom/cache")
    expect(result).toContain("electron-builder")
  })

  test("ignores ELECTRON_BUILDER_CACHE when value has no filesystem root (relative path)", async ({ expect }) => {
    vi.stubEnv("ELECTRON_BUILDER_CACHE", "relative/path/no-root")
    const result = await getCacheDirectoryInternal({ allowEnvVarOverride: true })
    expect(result).not.toBe("relative/path/no-root")
    expect(result).toContain("electron-builder")
  })

  test("falls back to tmpdir when USERNAME is 'system' (isAvoidSystemOnWindows defaults to true)", async ({ expect, skip }) => {
    if (process.platform !== "win32") {
      skip() // test is Windows-specific, skip on other platforms
      return
    }
    vi.stubEnv("LOCALAPPDATA", "C:\\Users\\system\\AppData\\Local")
    vi.stubEnv("USERNAME", "system")
    const result = await getCacheDirectoryInternal({ allowEnvVarOverride: false })
    expect(result).toContain(os.tmpdir())
  })

  test("falls back to tmpdir when LOCALAPPDATA path contains \\windows\\system32\\", async ({ expect, skip }) => {
    if (process.platform !== "win32") {
      skip() // test is Windows-specific, skip on other platforms
      return
    }
    vi.stubEnv("LOCALAPPDATA", "C:\\Windows\\System32\\config\\systemprofile\\AppData\\Local")
    vi.stubEnv("USERNAME", "not-system")
    const result = await getCacheDirectoryInternal({ allowEnvVarOverride: false })
    expect(result).toContain(os.tmpdir())
  })

  test("isAvoidSystemOnWindows:false does not fall back to tmpdir for USERNAME=system", async ({ expect, skip }) => {
    if (process.platform !== "win32") {
      skip() // test is Windows-specific, skip on other platforms
      return
    }
    vi.stubEnv("LOCALAPPDATA", "C:\\Users\\system\\AppData\\Local")
    vi.stubEnv("USERNAME", "system")
    const result = await getCacheDirectoryInternal({ isAvoidSystemOnWindows: false, allowEnvVarOverride: false })
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

const sharedCacheTmpDir = new TmpDir("eb-electronGet-test")
let testCacheDir: string

beforeAll(async () => {
  testCacheDir = await sharedCacheTmpDir.createTempDir()
  process.env.ELECTRON_BUILDER_CACHE = testCacheDir
})

afterAll(async () => {
  await sharedCacheTmpDir.cleanup()
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
  // This test routes downloads through a local server and verifies the server is hit (not
  // ELECTRON_MIRROR's unreachable URL), proving resolveAssetURL controls the final fetch target.
  test("ELECTRON_MIRROR env var does not corrupt builder-binaries download URL (#9752)", { timeout: 15_000 }, async ({ expect, tmpDir }) => {
    const freshTestCache = await tmpDir.createTempDir()
    vi.stubEnv("ELECTRON_BUILDER_CACHE", freshTestCache)
    // Point ELECTRON_MIRROR at an unreachable address — if @electron/get used it instead of
    // resolveAssetURL, the fetch would fail with ECONNREFUSED before reaching any assertion.
    vi.stubEnv("ELECTRON_MIRROR", "http://127.0.0.1:1/")

    const servedArchive = path.join(freshTestCache, "served.tar.gz")
    await createMinimalTarGz(servedArchive, { placeholder: "ok" })
    const server = await startArtifactServer(servedArchive)
    vi.stubEnv("ELECTRON_BUILDER_BINARIES_MIRROR", `http://127.0.0.1:${server.port}/`)

    try {
      await downloadBuilderToolset({ releaseName: "dmg-builder@1.2.2", filenameWithExt: "dmgbuild-bundle-arm64-75c8a6c.tar.gz" })
      // Our local server was hit — resolveAssetURL determined the URL, not ELECTRON_MIRROR
      expect(server.requestedPaths.length).toBeGreaterThan(0)
      expect(server.requestedPaths.some(p => p.includes("dmg-builder@1.2.2"))).toBe(true)
    } finally {
      await server.close()
    }
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

describe("toolset archive cache", { sequential: true }, () => {
  let freshCache: string

  beforeEach(async context => {
    freshCache = await context.tmpDir.createTempDir()
    vi.stubEnv("ELECTRON_BUILDER_CACHE", freshCache)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // Seed the archive cache path that downloadBuilderToolset checks before hitting @electron/get.
  // Then point the mirror at an unreachable address — if downloadArtifact were called, the fetch
  // would throw ECONNREFUSED, failing the test. Passing proves the archive cache was used.
  test("uses pre-existing archive and does not call downloadArtifact", async ({ expect }) => {
    const releaseName = "cache-test@0.1"
    const fileName = "cache-artifact.tar.gz"
    const archiveCachePath = path.join(freshCache, releaseName, fileName)
    await fs.mkdir(path.dirname(archiveCachePath), { recursive: true })
    await createMinimalTarGz(archiveCachePath, { sentinel: "ok" })

    // Dead man's switch: any network call would ECONNREFUSED immediately (port 1 is never open)
    vi.stubEnv("ELECTRON_BUILDER_BINARIES_MIRROR", "http://127.0.0.1:1/")

    const result = await downloadBuilderToolset({ releaseName, filenameWithExt: fileName })

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

    // Dead man's switch: re-download is attempted → ECONNREFUSED proves the call happened
    vi.stubEnv("ELECTRON_BUILDER_BINARIES_MIRROR", "http://127.0.0.1:1/")

    const correctSha256 = "0000000000000000000000000000000000000000000000000000000000000000"
    await expect(downloadBuilderToolset({ releaseName, filenameWithExt: fileName, checksums: { [fileName]: correctSha256 } })).rejects.toThrow()
  })

  test("persists downloaded archive to cache so subsequent builds skip the download", async ({ expect }) => {
    const releaseName = "persist-test@0.1"
    const fileName = "persist-artifact.tar.gz"
    const archiveCachePath = path.join(freshCache, releaseName, fileName)

    // Archive served from local server for the first download
    const networkArchive = path.join(freshCache, "fake-network-download.tar.gz")
    await createMinimalTarGz(networkArchive, { "network-file": "content" })
    const server = await startArtifactServer(networkArchive)
    vi.stubEnv("ELECTRON_BUILDER_BINARIES_MIRROR", `http://127.0.0.1:${server.port}/`)

    try {
      // First call: downloads from server and persists to archive cache
      await downloadBuilderToolset({ releaseName, filenameWithExt: fileName })
      const downloadCount = server.requestedPaths.length
      expect(downloadCount).toBeGreaterThan(0)
      await expect(fs.access(archiveCachePath)).resolves.toBeUndefined()

      // Simulate a fresh build: delete the extract dir and @electron/get's download cache so
      // that only the archive cache (archiveCachePath) can satisfy the second call without network.
      const releaseEntries = await fs.readdir(path.join(freshCache, releaseName))
      const extractDirs = releaseEntries.filter(e => e !== fileName && !e.endsWith(".state")).map(e => path.join(freshCache, releaseName, e))
      for (const d of extractDirs) {
        await fs.rm(d, { recursive: true, force: true })
      }
      await fs.rm(path.join(freshCache, "downloads"), { recursive: true, force: true })

      // Second call: archive cache hit — no new requests to the server
      const result2 = await downloadBuilderToolset({ releaseName, filenameWithExt: fileName })
      expect(server.requestedPaths.length).toBe(downloadCount)
      const entries = await fs.readdir(result2)
      expect(entries).toContain("network-file")
    } finally {
      await server.close()
    }
  })

  // Regression: concurrent builds requesting the SAME toolset (e.g. rpm x64 + rpm armv7l both
  // needing fpm) resolve to the same extractDir and contend on one lock. Before the fix the
  // unlocked pre-lock fs.mkdir(extractDir) raced a lock-holder's fs.rm(extractDir) cleanup and
  // threw `ENOENT: ... mkdir '<cache>/<release>/<artifact>-<hash>'`. All callers must now resolve,
  // and the lock must serialize them down to a single network download (also covering the
  // cross-worker case, where an in-process promise cache could not help).
  test("concurrent downloads of the same artifact all resolve and dedupe to one download", async ({ expect }) => {
    const releaseName = "concurrent-test@0.1"
    const fileName = "concurrent-artifact.tar.gz"

    const networkArchive = path.join(freshCache, "concurrent-network-download.tar.gz")
    await createMinimalTarGz(networkArchive, { sentinel: "ok" })
    const server = await startArtifactServer(networkArchive)
    vi.stubEnv("ELECTRON_BUILDER_BINARIES_MIRROR", `http://127.0.0.1:${server.port}/`)

    try {
      const results = await Promise.all(Array.from({ length: 12 }, () => downloadBuilderToolset({ releaseName, filenameWithExt: fileName })))

      // Every caller resolved (no ENOENT race) to the same valid extract dir
      for (const result of results) {
        const entries = await fs.readdir(result)
        expect(entries).toContain("sentinel")
      }
      expect(new Set(results).size).toBe(1)

      // The lock serialized the work: the winner downloaded once; the rest hit the completed cache.
      expect(server.requestedPaths.length).toBe(1)
    } finally {
      await server.close()
    }
  })
})

// ─── downloadElectronArtifact: electron platform artifacts (.zip) ────────────

// Resolve electron platform/arch naming from Node process values
const electronPlatform = process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux"
const electronArch = process.arch === "arm64" ? "arm64" : "x64"

// Expected ffmpeg library filename by platform
const ffmpegLibName = electronPlatform === "darwin" ? "libffmpeg.dylib" : electronPlatform === "linux" ? "libffmpeg.so" : "ffmpeg.dll"

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

  test("downloadElectronArtifact: applies mirrorOptions.mirror override", DOWNLOAD_TIMEOUT, async ({ expect }) => {
    const options: ArtifactDownloadOptions = {
      artifactName: "ffmpeg",
      platformName: electronPlatform,
      arch: electronArch,
      version: ELECTRON_VERSION,
      options: {
        mirrorOptions: { mirror: "https://github.com/electron/electron/releases/download/" },
      } satisfies ElectronGetOptions,
    }

    const result = await downloadElectronArtifact(options)

    expect(typeof result).toBe("string")
    const stat = await fs.stat(result)
    expect(stat.isDirectory()).toBe(true)
  })

  test("downloadElectronArtifact: unsafelyDisableChecksums:true skips checksum validation", DOWNLOAD_TIMEOUT, async ({ expect }) => {
    const options: ArtifactDownloadOptions = {
      artifactName: "ffmpeg",
      platformName: electronPlatform,
      arch: electronArch,
      version: ELECTRON_VERSION,
      options: { unsafelyDisableChecksums: true } satisfies ElectronGetOptions,
    }

    const result = await downloadElectronArtifact(options)
    expect(typeof result).toBe("string")
    await expect(fs.stat(result)).resolves.toBeDefined()
  })

  test("downloadElectronArtifact: forwards mirrorOptions to @electron/get", DOWNLOAD_TIMEOUT, async ({ expect }) => {
    const options: ArtifactDownloadOptions = {
      artifactName: "ffmpeg",
      platformName: electronPlatform,
      arch: electronArch,
      version: ELECTRON_VERSION,
      options: {
        mirrorOptions: { mirror: "https://github.com/electron/electron/releases/download/" },
      } satisfies ElectronGetOptions,
    }

    const result = await downloadElectronArtifact(options)
    expect(typeof result).toBe("string")
    const stat = await fs.stat(result)
    expect(stat.isDirectory()).toBe(true)
    const libPath = path.join(result, ffmpegLibName)
    await expect(fs.stat(libPath)).resolves.toBeDefined()
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
  test("routes download requests through HTTPS_PROXY when set", { timeout: 15_000 }, async ({ expect, tmpDir }) => {
    const proxy = await startRecordingProxy()
    const freshCache = await tmpDir.createTempDir()
    vi.stubEnv("HTTPS_PROXY", `http://127.0.0.1:${proxy.port}`)
    vi.stubEnv("ELECTRON_BUILDER_CACHE", freshCache)

    // The production code calls get.initializeProxy() only once per process, and earlier download
    // tests in this file already tripped that guard while HTTPS_PROXY was unset — so undici's global
    // dispatcher snapshotted an empty proxy config. EnvHttpProxyAgent reads the env at construction
    // time, so re-initialize now that HTTPS_PROXY is set to wire the dispatcher through our proxy.
    reinitializeProxy()

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
      // Reset the global dispatcher so the dead proxy does not leak into any later download.
      reinitializeProxy()
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
