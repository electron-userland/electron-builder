import { normalizeFileNamesToNfd } from "app-builder-lib/internal"
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "fs/promises"
import { tmpdir } from "os"
import * as path from "path"
import { expect } from "vitest"

// Precomposed (NFC) vs decomposed (NFD) spellings of the same text. macOS and the HFS+ volume inside
// a DMG store the decomposed form, so a bundle has to be signed under decomposed names.
const NFC_KOREAN = "설명서.txt"
const NFD_KOREAN = NFC_KOREAN.normalize("NFD")
const NFC_ACCENTED = "café.txt"
const NFD_ACCENTED = NFC_ACCENTED.normalize("NFD")

async function tempDir(): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), "eb-nfd-"))
}

/**
 * The assertions below check the names left on disk rather than the rename count, because the count
 * depends on the filesystem: APFS stores a precomposed name as written (so it needs renaming), while
 * HFS+ decomposes it on write (so there is nothing to rename). Either way the post-condition is the
 * same — nothing precomposed is left for a DMG to rewrite.
 */
describe("normalizeFileNamesToNfd", () => {
  test("leaves no precomposed file name behind", async () => {
    const dir = await tempDir()
    try {
      await writeFile(path.join(dir, NFC_KOREAN), "x")
      await normalizeFileNamesToNfd(dir)
      expect(await readdir(dir)).toEqual([NFD_KOREAN])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("leaves an already decomposed name untouched", async () => {
    const dir = await tempDir()
    try {
      await writeFile(path.join(dir, NFD_KOREAN), "x")
      expect(await normalizeFileNamesToNfd(dir)).toBe(0)
      expect(await readdir(dir)).toEqual([NFD_KOREAN])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("leaves ASCII names untouched", async () => {
    const dir = await tempDir()
    try {
      await writeFile(path.join(dir, "Electron Framework"), "x")
      await mkdir(path.join(dir, "Resources"))
      expect(await normalizeFileNamesToNfd(dir)).toBe(0)
      expect((await readdir(dir)).sort()).toEqual(["Electron Framework", "Resources"])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  // Not Korean-specific: any decomposable name is sealed under a spelling the DMG will rewrite.
  test("normalizes accented Latin names too", async () => {
    const dir = await tempDir()
    try {
      await writeFile(path.join(dir, NFC_ACCENTED), "x")
      await normalizeFileNamesToNfd(dir)
      expect(await readdir(dir)).toEqual([NFD_ACCENTED])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  // A directory renamed before its children would invalidate the paths used to reach them, so the walk
  // has to rename bottom-up. Directory names are sealed too — a nested `Foo Helper.app` is a directory.
  test("normalizes a nested directory and its contents", async () => {
    const dir = await tempDir()
    try {
      await mkdir(path.join(dir, "자료함", "하위"), { recursive: true })
      await writeFile(path.join(dir, "자료함", "하위", NFC_KOREAN), "x")
      await normalizeFileNamesToNfd(dir)
      const [outer] = await readdir(dir)
      expect(outer).toBe("자료함".normalize("NFD"))
      const [inner] = await readdir(path.join(dir, outer))
      expect(inner).toBe("하위".normalize("NFD"))
      expect(await readdir(path.join(dir, outer, inner))).toEqual([NFD_KOREAN])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  // lstat, not stat: a dangling symlink still has to be renamed, and must never be followed.
  test("renames a symlink without following it", async () => {
    const dir = await tempDir()
    try {
      await symlink("does-not-exist", path.join(dir, NFC_KOREAN))
      await normalizeFileNamesToNfd(dir)
      expect(await readdir(dir)).toEqual([NFD_KOREAN])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  // The caller holds the root path — renaming it would break the signing call that follows.
  test("does not rename the root itself", async () => {
    const parent = await tempDir()
    try {
      const root = path.join(parent, "앱자료")
      await mkdir(root)
      await writeFile(path.join(root, NFC_KOREAN), "x")
      await normalizeFileNamesToNfd(root)
      const [stored] = await readdir(parent)
      expect(stored).not.toBe("앱자료".normalize("NFD") === "앱자료" ? "" : "앱자료".normalize("NFD"))
      expect(await readdir(path.join(parent, stored))).toEqual([NFD_KOREAN])
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  test("returns 0 for a missing directory instead of throwing", async () => {
    await expect(normalizeFileNamesToNfd(path.join(tmpdir(), "eb-nfd-does-not-exist"))).resolves.toBe(0)
  })
})
