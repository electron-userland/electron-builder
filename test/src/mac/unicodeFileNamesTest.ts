import { MacPackager, Platform } from "app-builder-lib"
import { MacTargetHelper, normalizeFileNamesToNfd } from "app-builder-lib/internal"
import { Arch } from "builder-util"
import { mkdir, readdir, readFile, rename, symlink, writeFile } from "fs/promises"
import * as path from "path"
import { afterEach, beforeEach, vi } from "vitest"

// `rename` stays the real one unless a test makes it fail
vi.mock("fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("fs/promises")>()
  return { ...actual, rename: vi.fn(actual.rename) }
})

// let sign() get past the host checks on any platform — codesign itself is stubbed per test
vi.mock("app-builder-lib/src/codeSign/mac/macCodeSign.js", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/codeSign/mac/macCodeSign.js")>()
  return { ...actual, isSignAllowed: () => true }
})
vi.mock("app-builder-lib/src/util/mac/macosVersion.js", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/util/mac/macosVersion.js")>()
  return { ...actual, isMacOsHighSierra: () => true }
})

beforeEach(() => {
  vi.mocked(rename).mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Precomposed (NFC) vs decomposed (NFD) spellings of the same text. macOS and the HFS+ volume inside
// a DMG store the decomposed form, so a bundle has to be signed under decomposed names.
const NFC_KOREAN = "설명서.txt"
const NFD_KOREAN = NFC_KOREAN.normalize("NFD")
const NFC_ACCENTED = "café.txt"
const NFD_ACCENTED = NFC_ACCENTED.normalize("NFD")

/**
 * The assertions below check the names left on disk, because what is stored depends on the filesystem:
 * APFS and ext4 store a precomposed name as written (so it needs renaming), while HFS+ decomposes it on
 * write (so there is nothing to rename). Either way the post-condition is the same — nothing precomposed
 * is left for a DMG to rewrite.
 */
describe("normalizeFileNamesToNfd", () => {
  test("leaves no precomposed file name behind", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "nfd-" })
    await writeFile(path.join(dir, NFC_KOREAN), "x")
    await normalizeFileNamesToNfd(dir)
    expect(await readdir(dir)).toEqual([NFD_KOREAN])
  })

  test("leaves an already decomposed name untouched", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "nfd-" })
    await writeFile(path.join(dir, NFD_KOREAN), "x")
    await expect(normalizeFileNamesToNfd(dir)).resolves.toEqual({ renamed: [], skipped: [] })
    expect(await readdir(dir)).toEqual([NFD_KOREAN])
    expect(vi.mocked(rename)).not.toHaveBeenCalled()
  })

  test("leaves ASCII names untouched", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "nfd-" })
    await writeFile(path.join(dir, "Electron Framework"), "x")
    await mkdir(path.join(dir, "Resources"))
    await expect(normalizeFileNamesToNfd(dir)).resolves.toEqual({ renamed: [], skipped: [] })
    expect((await readdir(dir)).sort()).toEqual(["Electron Framework", "Resources"])
    expect(vi.mocked(rename)).not.toHaveBeenCalled()
  })

  // Not Korean-specific: any decomposable name is sealed under a spelling the DMG will rewrite.
  test("normalizes accented Latin names too", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "nfd-" })
    await writeFile(path.join(dir, NFC_ACCENTED), "x")
    await normalizeFileNamesToNfd(dir)
    expect(await readdir(dir)).toEqual([NFD_ACCENTED])
  })

  // A directory renamed before its children would invalidate the paths used to reach them, so the walk
  // has to rename bottom-up. Directory names are sealed too — a nested `Foo Helper.app` is a directory.
  // (Only a normalization-sensitive filesystem such as ext4 can tell the difference: macOS resolves the
  // stale precomposed path anyway.)
  test("normalizes a nested directory and its contents", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "nfd-" })
    await mkdir(path.join(dir, "자료함", "하위"), { recursive: true })
    await writeFile(path.join(dir, "자료함", "하위", NFC_KOREAN), "x")
    await normalizeFileNamesToNfd(dir)
    expect(await readdir(dir)).toEqual(["자료함".normalize("NFD")])
    expect(await readdir(path.join(dir, "자료함".normalize("NFD")))).toEqual(["하위".normalize("NFD")])
    expect(await readdir(path.join(dir, "자료함".normalize("NFD"), "하위".normalize("NFD")))).toEqual([NFD_KOREAN])
  })

  // `rename` replaces an existing target, so renaming over a real NFD-named sibling would lose its content.
  test("does not overwrite a sibling that already has the decomposed name", async ({ expect, tmpDir, skip }) => {
    const dir = await tmpDir.createTempDir({ prefix: "nfd-" })
    await writeFile(path.join(dir, NFC_ACCENTED), "precomposed")
    await writeFile(path.join(dir, NFD_ACCENTED), "decomposed")
    // APFS and HFS+ treat both spellings as the same name, so there is no second file to protect
    if ((await readdir(dir)).length !== 2) {
      skip("the filesystem of the temp dir is normalization-insensitive")
    }

    const result = await normalizeFileNamesToNfd(dir)

    expect(result).toEqual({ renamed: [], skipped: [{ file: path.join(dir, NFC_ACCENTED), reason: "collision" }] })
    expect((await readdir(dir)).sort()).toEqual([NFC_ACCENTED, NFD_ACCENTED].sort())
    expect(await readFile(path.join(dir, NFC_ACCENTED), "utf8")).toBe("precomposed")
    expect(await readFile(path.join(dir, NFD_ACCENTED), "utf8")).toBe("decomposed")
  })

  // signing still goes ahead, so a failed rename must not throw, only be reported back
  test("reports a failed rename and carries on", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "nfd-" })
    await writeFile(path.join(dir, NFC_KOREAN), "x")
    await writeFile(path.join(dir, NFC_ACCENTED), "x")
    vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }))

    const result = await normalizeFileNamesToNfd(dir)

    expect(result.skipped).toEqual([{ file: expect.any(String), reason: "error", error: "EACCES: permission denied" }])
    // the entry whose rename did not fail is still normalized
    expect(result.renamed).toHaveLength(1)
    expect([...result.renamed, ...result.skipped.map(({ file }) => file)].sort()).toEqual([path.join(dir, NFC_KOREAN), path.join(dir, NFC_ACCENTED)].sort())
    expect((await readdir(dir)).filter(name => name !== name.normalize("NFD"))).toHaveLength(1)
  })

  // lstat, not stat: a dangling symlink still has to be renamed, and must never be followed.
  test("renames a symlink without following it", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "nfd-" })
    await symlink("does-not-exist", path.join(dir, NFC_KOREAN))
    await normalizeFileNamesToNfd(dir)
    expect(await readdir(dir)).toEqual([NFD_KOREAN])
  })

  test("does not descend into a symlinked directory", async ({ expect, tmpDir }) => {
    const outside = await tmpDir.createTempDir({ prefix: "nfd-outside-" })
    await writeFile(path.join(outside, NFC_KOREAN), "x")
    const stored = await readdir(outside)
    const dir = await tmpDir.createTempDir({ prefix: "nfd-" })
    await symlink(outside, path.join(dir, "Linked"))

    await expect(normalizeFileNamesToNfd(dir)).resolves.toEqual({ renamed: [], skipped: [] })

    expect(await readdir(dir)).toEqual(["Linked"])
    expect(vi.mocked(rename)).not.toHaveBeenCalled()
    expect(await readdir(outside)).toEqual(stored)
  })

  // The caller holds the root path — renaming it would break the signing call that follows.
  test("does not rename the root itself", async ({ expect, tmpDir }) => {
    const parent = await tmpDir.createTempDir({ prefix: "nfd-" })
    const root = path.join(parent, "앱자료")
    await mkdir(root)
    await writeFile(path.join(root, NFC_KOREAN), "x")
    await normalizeFileNamesToNfd(root)
    expect(vi.mocked(rename).mock.calls.map(([from]) => from)).not.toContain(root)
    expect(await readdir(root)).toEqual([NFD_KOREAN])
  })

  test("resolves for a missing directory instead of throwing", async ({ expect, tmpDir }) => {
    const missing = path.join(await tmpDir.createTempDir({ prefix: "nfd-" }), "does-not-exist")
    await expect(normalizeFileNamesToNfd(missing)).resolves.toEqual({ renamed: [], skipped: [] })
  })
})

// sign() is the one place both the mac flow (signApp/doSignAfterPack) and the MAS flow go through
describe("MacPackager.sign", () => {
  // just enough of a MacPackager to reach doSign with a keychain identity, which is stubbed together with codesign
  function makeMacPackager(appPath: string): any {
    const packager = Object.create(MacPackager.prototype)
    packager.platform = Platform.MAC
    packager.platformSpecificBuildOptions = {}
    packager.info = { config: {}, options: {}, getWorkspaceRoot: () => Promise.resolve("/project") }
    packager.appInfo = { type: "module", productFilename: "My" }
    packager.helper = new MacTargetHelper(packager)
    packager.codeSigningInfo = { value: Promise.resolve({ keychainFile: null }) }
    Object.defineProperty(packager, "forceCodeSigning", { value: false })
    packager.helper.findSigningIdentity = vi.fn(() => Promise.resolve({ name: "Developer ID Application: Foo (TEAM123)", hash: "0123456789ABCDEF" }))
    packager.helper.buildSignOptions = vi.fn(() => Promise.resolve({ app: appPath }))
    packager.helper.warnAboutForeignSignedBinaries = vi.fn(() => Promise.resolve())
    packager.helper.notarizeIfProvided = vi.fn(() => Promise.resolve())
    return packager
  }

  test.for(["mac", "mas", "mas-dev"])("normalizes file names before signing the %s app", async (targetPlatform, { expect, tmpDir }) => {
    const appPath = path.join(await tmpDir.createTempDir({ prefix: "nfd-sign-" }), "My.app")
    await mkdir(path.join(appPath, "Contents", "Resources"), { recursive: true })
    await writeFile(path.join(appPath, "Contents", "Resources", NFC_KOREAN), "x")
    const packager = makeMacPackager(appPath)
    let namesWhenSigned: Array<string> = []
    packager.doSign = vi.fn(async () => {
      namesWhenSigned = await readdir(path.join(appPath, "Contents", "Resources"))
    })

    await expect(packager.sign(appPath, Arch.x64, targetPlatform)).resolves.toBe("signed")

    expect(packager.doSign).toHaveBeenCalledTimes(1)
    expect(namesWhenSigned).toEqual([NFD_KOREAN])
  })
})
