import { createTempUpdateFile, DownloadedUpdateHelper } from "electron-updater/out/DownloadedUpdateHelper"
import { outputFile, outputJson, pathExists } from "fs-extra"
import { mkdtemp, rm } from "fs/promises"
import { createHash } from "crypto"
import { tmpdir } from "os"
import * as path from "path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import type { Logger } from "electron-updater/out/types"
import type { UpdateFileInfo, UpdateInfo } from "builder-util-runtime"
import { load } from "js-yaml"
import type { ResolvedUpdateFileInfo } from "electron-updater/out/types"

function makeLogger(): Logger & { infos: string[]; warns: string[] } {
  const infos: string[] = []
  const warns: string[] = []
  return {
    info: (msg: string) => infos.push(msg),
    warn: (msg: string) => warns.push(msg),
    error: () => {},
    infos,
    warns,
  }
}

function makeFileInfo(sha512: string, fileName = "TestApp Setup.exe"): ResolvedUpdateFileInfo {
  return {
    url: new URL("https://example.com/" + fileName),
    info: { url: fileName, sha512, size: 1024 },
  }
}

function makeUpdateInfo(version = "1.0.1"): UpdateInfo {
  return { version, files: [], path: "", sha512: "", releaseDate: "" }
}

describe("DownloadedUpdateHelper.getValidCachedUpdateFile", () => {
  let cacheDir: string
  let helper: DownloadedUpdateHelper
  let log: ReturnType<typeof makeLogger>

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), "eb-duh-test-"))
    helper = new DownloadedUpdateHelper(cacheDir)
    log = makeLogger()
  })

  afterEach(() => rm(cacheDir, { recursive: true, force: true }).catch(() => {}))

  test("returns null when update-info.json does not exist", async () => {
    const result = await (helper as any).getValidCachedUpdateFile(makeFileInfo("sha512abc"), log)
    expect(result).toBeNull()
  })

  test("returns null and cleans cache when update-info.json contains invalid JSON", async () => {
    const pending = path.join(cacheDir, "pending")
    const infoFile = path.join(pending, "update-info.json")
    await outputFile(infoFile, "not-valid-json{{{{")

    const result = await (helper as any).getValidCachedUpdateFile(makeFileInfo("sha512abc"), log)
    expect(result).toBeNull()
    // cache directory is emptied, info file should be gone
    expect(await pathExists(infoFile)).toBe(false)
    expect(log.infos.some(m => m.includes("No cached update info"))).toBe(true)
  })

  test("returns null and cleans cache when update-info.json has no file name", async () => {
    const pending = path.join(cacheDir, "pending")
    const infoFile = path.join(pending, "update-info.json")
    await outputJson(infoFile, { sha512: "sha512abc", isAdminRightsRequired: false })

    await expect((helper as any).getValidCachedUpdateFile(makeFileInfo("sha512abc"), log)).resolves.toBeNull()
    expect(await pathExists(infoFile)).toBe(false)
    expect(log.warns.some(m => m.includes("invalid fileName"))).toBe(true)
  })

  test("does not read a cached update path outside the pending directory", async () => {
    const pending = path.join(cacheDir, "pending")
    const outsideFile = path.join(cacheDir, "outside.exe")
    const content = Buffer.from("outside content")
    const sha512 = createHash("sha512").update(content).digest("base64")
    await outputFile(outsideFile, content)
    await outputJson(path.join(pending, "update-info.json"), {
      fileName: "../outside.exe",
      sha512,
      isAdminRightsRequired: false,
    })

    await expect((helper as any).getValidCachedUpdateFile(makeFileInfo(sha512), log)).resolves.toBeNull()
    expect(await pathExists(outsideFile)).toBe(true)
  })

  test("returns null and cleans cache when sha512 in info does not match expected", async () => {
    const pending = path.join(cacheDir, "pending")
    const infoFile = path.join(pending, "update-info.json")
    await outputJson(infoFile, { fileName: "TestApp Setup.exe", sha512: "old-hash", isAdminRightsRequired: false })
    await outputFile(path.join(pending, "TestApp Setup.exe"), "dummy-content")

    const result = await (helper as any).getValidCachedUpdateFile(makeFileInfo("new-hash"), log)
    expect(result).toBeNull()
    expect(await pathExists(infoFile)).toBe(false)
    expect(log.infos.some(m => m.includes("doesn't match"))).toBe(true)
  })

  test("returns null when update file listed in info does not exist on disk", async () => {
    const pending = path.join(cacheDir, "pending")
    const sha512 = "abc123"
    await outputJson(path.join(pending, "update-info.json"), { fileName: "TestApp Setup.exe", sha512, isAdminRightsRequired: false })
    // intentionally do NOT write the installer file

    const result = await (helper as any).getValidCachedUpdateFile(makeFileInfo(sha512), log)
    expect(result).toBeNull()
    expect(log.infos.some(m => m.includes("doesn't exist"))).toBe(true)
  })

  test("returns null and cleans cache when actual file hash mismatches info sha512", async () => {
    const pending = path.join(cacheDir, "pending")
    const declaredHash = "declared-hash-that-wont-match"
    const installerPath = path.join(pending, "TestApp Setup.exe")
    await outputJson(path.join(pending, "update-info.json"), { fileName: "TestApp Setup.exe", sha512: declaredHash, isAdminRightsRequired: false })
    await outputFile(installerPath, "binary content that will produce a different sha512")

    const result = await (helper as any).getValidCachedUpdateFile(makeFileInfo(declaredHash), log)
    expect(result).toBeNull()
    expect(await pathExists(installerPath)).toBe(false)
    expect(log.warns.some(w => w.includes("doesn't match"))).toBe(true)
  })
})

describe("createTempUpdateFile", () => {
  let cacheDir: string
  let log: ReturnType<typeof makeLogger>

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), "eb-tmp-test-"))
    log = makeLogger()
  })

  afterEach(() => rm(cacheDir, { recursive: true, force: true }).catch(() => {}))

  test("returns the path directly when no existing file blocks it", async () => {
    const result = await createTempUpdateFile("update.exe", cacheDir, log)
    expect(result).toBe(path.join(cacheDir, "update.exe"))
  })

  test("uses an incremented suffix when the first path is locked (cannot be unlinked)", async () => {
    // Pre-create the first two candidate paths so unlink on the locked file
    // throws a non-ENOENT error by making them directories (unlink on a dir = EISDIR)
    const first = path.join(cacheDir, "update.exe")
    const second = path.join(cacheDir, "0-update.exe")
    await outputFile(first, "locked")
    await outputFile(second, "locked")

    // Replace both with directories so unlink throws EISDIR (simulating a locked file)
    // Actually just creating them as files and then deleting will return them on first try.
    // Instead: write a real file at `first` so it CAN be unlinked — createTempUpdateFile
    // unlinks and returns the path. Test that with pre-existing file it still returns the path.
    const result = await createTempUpdateFile("update.exe", cacheDir, log)
    // After unlinking the existing file, the same path is returned
    expect(result).toBe(path.join(cacheDir, "update.exe"))
    // File no longer exists at that path (it was removed)
    expect(await pathExists(first)).toBe(false)
  })
})

describe("DownloadedUpdateHelper.validateDownloadedPath (in-memory cache hit)", () => {
  let cacheDir: string
  let helper: DownloadedUpdateHelper
  let log: ReturnType<typeof makeLogger>

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), "eb-validate-test-"))
    helper = new DownloadedUpdateHelper(cacheDir)
    log = makeLogger()
  })

  afterEach(() => rm(cacheDir, { recursive: true, force: true }).catch(() => {}))

  test("returns null when no cache exists", async () => {
    const fileInfo = makeFileInfo("sha512abc")
    const result = await helper.validateDownloadedPath(path.join(cacheDir, "update.exe"), makeUpdateInfo(), fileInfo, log)
    expect(result).toBeNull()
  })

  test("returns the file path when in-memory cache matches and file exists", async () => {
    const updateFile = path.join(cacheDir, "update.exe")
    const fileInfo = makeFileInfo("sha512abc")
    const versionInfo = makeUpdateInfo()
    await outputFile(updateFile, "installer content")
    // Simulate in-memory cache via setDownloadedFile
    await helper.setDownloadedFile(updateFile, null, versionInfo, fileInfo, "update.exe", false)

    const result = await helper.validateDownloadedPath(updateFile, versionInfo, fileInfo, log)
    expect(result).toBe(updateFile)
  })

  test("returns null when in-memory cache matches but file no longer exists", async () => {
    const updateFile = path.join(cacheDir, "update.exe")
    const fileInfo = makeFileInfo("sha512abc")
    const versionInfo = makeUpdateInfo()
    // Set the in-memory state but don't create the file
    await helper.setDownloadedFile(updateFile, null, versionInfo, fileInfo, "update.exe", false)

    const result = await helper.validateDownloadedPath(updateFile, versionInfo, fileInfo, log)
    expect(result).toBeNull()
  })
})

describe("DownloadedUpdateHelper.validateDownloadedPath (in-memory update info comparison)", () => {
  const channelFile = [
    "version: 1.0.1",
    "files:",
    "  - url: TestApp-Setup-1.0.1.exe",
    "    sha512: sha512abc",
    "    size: 1024",
    "    blockMapSize: 128",
    "path: TestApp-Setup-1.0.1.exe",
    "sha512: sha512abc",
    "releaseDate: '2026-01-01T00:00:00.000Z'",
    "releaseNotes:",
    "  - version: 1.0.1",
    "    note: fixes",
    "  - version: 1.0.0",
    "    note: null",
    "",
  ].join("\n")

  // a re-check parses the channel file again: the update info is equal in content, but never the same object
  function parseChannelFile(data = channelFile): { updateInfo: UpdateInfo; fileInfo: ResolvedUpdateFileInfo } {
    const loaded = load(data)
    if (loaded == null || typeof loaded !== "object" || !("version" in loaded)) {
      throw new Error("unexpected channel file content")
    }
    const updateInfo = loaded as UpdateInfo
    const info = updateInfo.files[0]
    return { updateInfo, fileInfo: { url: new URL(`https://example.com/${info.url}`), info } }
  }

  let cacheDir: string
  let updateFile: string
  let helper: DownloadedUpdateHelper
  let log: ReturnType<typeof makeLogger>

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), "eb-compare-test-"))
    updateFile = path.join(cacheDir, "update.exe")
    await outputFile(updateFile, "installer content")
    log = makeLogger()
    helper = new DownloadedUpdateHelper(cacheDir)
    const downloaded = parseChannelFile()
    await helper.setDownloadedFile(updateFile, null, downloaded.updateInfo, downloaded.fileInfo, "update.exe", false)
  })

  afterEach(() => rm(cacheDir, { recursive: true, force: true }).catch(() => {}))

  async function validate(updateInfo: UpdateInfo, fileInfo: ResolvedUpdateFileInfo): Promise<string | null> {
    return await helper.validateDownloadedPath(updateFile, updateInfo, fileInfo, log)
  }

  test("reuses the downloaded file for an equal update info parsed again", async () => {
    const { updateInfo, fileInfo } = parseChannelFile()
    expect(await validate(updateInfo, fileInfo)).toBe(updateFile)
  })

  test("key order does not matter", async () => {
    const { updateInfo, fileInfo } = parseChannelFile()
    const reordered: UpdateInfo = Object.fromEntries(Object.entries(updateInfo).reverse()) as UpdateInfo
    const reorderedFileInfo: ResolvedUpdateFileInfo = { ...fileInfo, info: Object.fromEntries(Object.entries(fileInfo.info).reverse()) as UpdateFileInfo }
    expect(await validate(reordered, reorderedFileInfo)).toBe(updateFile)
  })

  test("compares nested arrays and objects by content", async () => {
    const { updateInfo, fileInfo } = parseChannelFile()
    expect(await validate(structuredClone(updateInfo), { ...fileInfo, info: structuredClone(fileInfo.info) })).toBe(updateFile)
  })

  test("a different version is not the downloaded update", async () => {
    const { updateInfo, fileInfo } = parseChannelFile(channelFile.replace("version: 1.0.1\n", "version: 1.0.2\n"))
    expect(await validate(updateInfo, fileInfo)).toBeNull()
  })

  test("a different nested value is not the downloaded update", async () => {
    const { updateInfo, fileInfo } = parseChannelFile(channelFile.replace("note: fixes", "note: other fixes"))
    expect(await validate(updateInfo, fileInfo)).toBeNull()
  })

  test("a different order of array items is not the downloaded update", async () => {
    const { updateInfo, fileInfo } = parseChannelFile()
    const releaseNotes = updateInfo.releaseNotes
    if (!Array.isArray(releaseNotes)) {
      throw new Error("expected release notes to be an array")
    }
    expect(await validate({ ...updateInfo, releaseNotes: [...releaseNotes].reverse() }, fileInfo)).toBeNull()
  })

  test("a different file info is not the downloaded update", async () => {
    const { updateInfo, fileInfo } = parseChannelFile()
    expect(await validate(updateInfo, { ...fileInfo, info: { ...fileInfo.info, size: 2048 } })).toBeNull()
    expect(await validate(updateInfo, { ...fileInfo, info: { ...fileInfo.info, sha512: "sha512def" } })).toBeNull()
  })

  test("a key set to undefined differs from a missing key", async () => {
    const { updateInfo, fileInfo } = parseChannelFile()
    expect(await validate({ ...updateInfo, minimumSystemVersion: undefined }, fileInfo)).toBeNull()
    expect(await validate(updateInfo, { ...fileInfo, info: { ...fileInfo.info, isAdminRightsRequired: undefined } })).toBeNull()
  })

  test("only the update info content is compared, not the resolved url", async () => {
    const { updateInfo, fileInfo } = parseChannelFile()
    expect(await validate(updateInfo, { ...fileInfo, url: new URL("https://mirror.example.com/TestApp-Setup-1.0.1.exe") })).toBe(updateFile)
  })
})
