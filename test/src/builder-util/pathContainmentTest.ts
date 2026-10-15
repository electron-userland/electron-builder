import {
  assertNoSymlinkLeaves,
  assertWritableWithin,
  copyDir,
  ERR_PATH_OUTSIDE_ROOT,
  findEscapingSymlinks,
  InvalidConfigurationError,
  isPathWithin,
  log,
  prepareFixedNameWrite,
  resolvePhysicalPath,
  SYMLINK_CONTAINMENT_DOCS_URL,
} from "builder-util"
import * as fs from "fs/promises"
import * as path from "path"
import { afterEach, vi } from "vitest"

const V27_LINK = "https://www.electron.build/docs/migration/v27-breaking-changes#symlinks-that-leave-the-app-are-refused"

async function layout(base: string) {
  const root = path.join(base, "root")
  const outside = path.join(base, "outside")
  await fs.mkdir(root, { recursive: true })
  await fs.mkdir(outside, { recursive: true })
  return { root, outside }
}

async function expectEscapeError(promise: Promise<unknown>, expect: any) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  )
  expect(error).toBeInstanceOf(InvalidConfigurationError)
  expect((error as NodeJS.ErrnoException).code).toBe(ERR_PATH_OUTSIDE_ROOT)
  expect((error as Error).message).toContain("electron-builder v27")
  expect((error as Error).message).toContain(V27_LINK)
  return error as Error
}

test("the docs link of the containment errors is the v27 anchor", ({ expect }) => {
  expect(SYMLINK_CONTAINMENT_DOCS_URL).toBe(V27_LINK)
})

test("isPathWithin does not treat a sibling with a shared prefix as inside", ({ expect }) => {
  const root = path.resolve("workspace")
  expect(isPathWithin(root, root)).toBe(true)
  expect(isPathWithin(root, path.join(root, "a", "b"))).toBe(true)
  expect(isPathWithin(root, `${root}-other`)).toBe(false)
  expect(isPathWithin(root, path.dirname(root))).toBe(false)
})

describe.runIf(process.platform !== "win32")("resolvePhysicalPath", () => {
  test("follows a symlink that leads to a path that does not exist yet", async ({ expect, tmpDir }) => {
    const { root, outside } = await layout(await tmpDir.createTempDir({ prefix: "containment" }))
    await fs.symlink(path.join(outside, "not-yet"), path.join(root, "dangling"))
    expect(await resolvePhysicalPath(path.join(root, "dangling", "file"))).toBe(path.join(await fs.realpath(outside), "not-yet", "file"))
  })

  test("applies '..' after a symlink physically, not lexically", async ({ expect, tmpDir }) => {
    const { root, outside } = await layout(await tmpDir.createTempDir({ prefix: "containment" }))
    await fs.mkdir(path.join(outside, "deep"))
    await fs.symlink(path.join(outside, "deep"), path.join(root, "link"))
    // lexically root/x, physically outside/x
    expect(await resolvePhysicalPath([root, "link", "..", "missing", "x"].join(path.sep))).toBe(path.join(await fs.realpath(outside), "missing", "x"))
  })
})

describe.runIf(process.platform !== "win32")("assertWritableWithin", () => {
  test("accepts a destination inside the root, existing or not", async ({ expect, tmpDir }) => {
    const { root } = await layout(await tmpDir.createTempDir({ prefix: "containment" }))
    await fs.mkdir(path.join(root, "a"))
    await expect(assertWritableWithin(root, path.join(root, "a", "file"))).resolves.toBeUndefined()
    await expect(assertWritableWithin(root, path.join(root, "new", "deeper", "file"))).resolves.toBeUndefined()
  })

  test("accepts a symlink inside the root that leads to another directory inside it", async ({ expect, tmpDir }) => {
    const { root } = await layout(await tmpDir.createTempDir({ prefix: "containment" }))
    await fs.mkdir(path.join(root, "Versions", "A"), { recursive: true })
    await fs.symlink("Versions/A", path.join(root, "Current"))
    await expect(assertWritableWithin(root, path.join(root, "Current", "file"))).resolves.toBeUndefined()
  })

  test("refuses a destination whose ancestor is a symlink leading outside", async ({ expect, tmpDir }) => {
    const { root, outside } = await layout(await tmpDir.createTempDir({ prefix: "containment" }))
    await fs.symlink(outside, path.join(root, "escape"))
    const error = await expectEscapeError(assertWritableWithin(root, path.join(root, "escape", "sub", "file"), "test file"), expect)
    expect(error.message).toContain("refusing to write the test file")
  })

  test("refuses a destination below a dangling symlink that leads outside", async ({ expect, tmpDir }) => {
    const { root, outside } = await layout(await tmpDir.createTempDir({ prefix: "containment" }))
    await fs.symlink(path.join(outside, "created-later"), path.join(root, "dangling"))
    await expectEscapeError(assertWritableWithin(root, path.join(root, "dangling", "file")), expect)
  })

  test("does not resolve the final component: what is there is replaced, not followed", async ({ expect, tmpDir }) => {
    const { root, outside } = await layout(await tmpDir.createTempDir({ prefix: "containment" }))
    await fs.symlink(path.join(outside, "target"), path.join(root, "file"))
    await expect(assertWritableWithin(root, path.join(root, "file"))).resolves.toBeUndefined()
  })
})

describe.runIf(process.platform !== "win32")("prepareFixedNameWrite", () => {
  test("removes a planted symlink, so that the write does not reach its target", async ({ expect, tmpDir }) => {
    const { root, outside } = await layout(await tmpDir.createTempDir({ prefix: "containment" }))
    const victim = path.join(outside, "victim.txt")
    await fs.writeFile(victim, "original")
    const dest = path.join(root, "resources", "app-update.yml")
    await fs.mkdir(path.dirname(dest))
    await fs.symlink(victim, dest)

    await prepareFixedNameWrite(root, dest)
    await fs.writeFile(dest, "written")

    expect((await fs.lstat(dest)).isSymbolicLink()).toBe(false)
    expect(await fs.readFile(dest, "utf8")).toBe("written")
    expect(await fs.readFile(victim, "utf8")).toBe("original")
  })

  test("keeps a regular file and creates a missing directory", async ({ expect, tmpDir }) => {
    const { root } = await layout(await tmpDir.createTempDir({ prefix: "containment" }))
    const existing = path.join(root, "existing.txt")
    await fs.writeFile(existing, "data")
    await prepareFixedNameWrite(root, existing)
    expect(await fs.readFile(existing, "utf8")).toBe("data")

    const missing = path.join(root, "new", "dir", "file")
    await prepareFixedNameWrite(root, missing)
    expect((await fs.stat(path.dirname(missing))).isDirectory()).toBe(true)
  })

  test("refuses, without creating anything, when the directory leads outside", async ({ expect, tmpDir }) => {
    const { root, outside } = await layout(await tmpDir.createTempDir({ prefix: "containment" }))
    await fs.symlink(outside, path.join(root, "resources"))
    await expectEscapeError(prepareFixedNameWrite(root, path.join(root, "resources", "sub", "elevate.exe")), expect)
    expect(await fs.readdir(outside)).toEqual([])
  })
})

describe.runIf(process.platform !== "win32")("copyDir containment", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    log.resetLimits("copied-symlink-outside-output")
  })

  test("refuses to copy through a symlink already in the destination that leads outside", async ({ expect, tmpDir }) => {
    const base = await tmpDir.createTempDir({ prefix: "containment" })
    const { root, outside } = await layout(base)
    const src = path.join(base, "src")
    await fs.mkdir(path.join(src, "sub"), { recursive: true })
    await fs.writeFile(path.join(src, "sub", "payload.txt"), "payload")
    // e.g. the app directory, copied before extraResources, left resources/sub -> outside
    await fs.symlink(outside, path.join(root, "sub"))

    await expectEscapeError(copyDir(src, root, { containmentRoot: root }), expect)
    expect(await fs.readdir(outside)).toEqual([])
  })

  test("refuses a destination whose own directory is a symlink leading outside the containment root", async ({ expect, tmpDir }) => {
    const base = await tmpDir.createTempDir({ prefix: "containment" })
    const { root, outside } = await layout(base)
    const src = path.join(base, "src")
    await fs.mkdir(src)
    await fs.writeFile(path.join(src, "payload.txt"), "payload")
    await fs.symlink(outside, path.join(root, "resources"))

    await expectEscapeError(copyDir(src, path.join(root, "resources"), { containmentRoot: root }), expect)
    expect(await fs.readdir(outside)).toEqual([])
  })

  test("replaces a symlink planted at a destination file instead of writing through it", async ({ expect, tmpDir }) => {
    const base = await tmpDir.createTempDir({ prefix: "containment" })
    const { root, outside } = await layout(base)
    const victim = path.join(outside, "victim.txt")
    await fs.writeFile(victim, "original")
    const src = path.join(base, "src")
    await fs.mkdir(src)
    await fs.writeFile(path.join(src, "config.json"), "copied")
    await fs.symlink(victim, path.join(root, "config.json"))

    await copyDir(src, root)

    expect((await fs.lstat(path.join(root, "config.json"))).isSymbolicLink()).toBe(false)
    expect(await fs.readFile(path.join(root, "config.json"), "utf8")).toBe("copied")
    expect(await fs.readFile(victim, "utf8")).toBe("original")
  })

  test("keeps a symlink that stays inside the destination", async ({ expect, tmpDir }) => {
    const base = await tmpDir.createTempDir({ prefix: "containment" })
    const { root } = await layout(base)
    const src = path.join(base, "src")
    await fs.mkdir(path.join(src, "Versions", "A"), { recursive: true })
    await fs.writeFile(path.join(src, "Versions", "A", "lib"), "lib")
    await fs.symlink("A", path.join(src, "Versions", "Current"))
    await fs.symlink("Versions/Current/lib", path.join(src, "lib"))

    await copyDir(src, root)

    expect(await fs.readlink(path.join(root, "Versions", "Current"))).toBe("A")
    expect(await fs.readFile(path.join(root, "lib"), "utf8")).toBe("lib")
  })

  test("makes an absolute symlink into the copied tree relative, so that the copy points into the copy", async ({ expect, tmpDir }) => {
    const base = await tmpDir.createTempDir({ prefix: "containment" })
    const { root } = await layout(base)
    const src = path.join(base, "src")
    await fs.mkdir(path.join(src, "z"), { recursive: true })
    await fs.writeFile(path.join(src, "z", "Z"), "z")
    await fs.symlink(path.join(src, "z", "Z"), path.join(src, "B"))

    await copyDir(src, root)

    expect(await fs.readlink(path.join(root, "B"))).toBe(path.join("z", "Z"))
    expect(await fs.readFile(path.join(root, "B"), "utf8")).toBe("z")
  })

  test("refuses a copied symlink that leads outside, and removes it", async ({ expect, tmpDir }) => {
    const base = await tmpDir.createTempDir({ prefix: "containment" })
    const { root, outside } = await layout(base)
    const src = path.join(base, "src")
    await fs.mkdir(src)
    await fs.symlink(outside, path.join(src, "escape"))

    const error = await expectEscapeError(copyDir(src, root), expect)
    expect(error.message).toContain("refusing to copy the copied symlink")
    await expect(fs.lstat(path.join(root, "escape"))).rejects.toThrow("ENOENT")
  })

  test("refuses a symlink that is inside lexically but leaves through another copied symlink", async ({ expect, tmpDir }) => {
    const base = await tmpDir.createTempDir({ prefix: "containment" })
    const { root } = await layout(base)
    const src = path.join(base, "src")
    await fs.mkdir(path.join(src, "x"), { recursive: true })
    // x/up -> .. is the copied root; x/a -> up/../.. is x/.. lexically, but physically the parent of the copied root
    await fs.symlink("..", path.join(src, "x", "up"))
    await fs.symlink("up/../..", path.join(src, "x", "a"))

    await expectEscapeError(copyDir(src, root), expect)
  })

  test("keeps a symlink into an allowed root and warns once, naming electron-builder v27", async ({ expect, tmpDir }) => {
    const base = await tmpDir.createTempDir({ prefix: "containment" })
    const { root } = await layout(base)
    const workspace = path.join(base, "workspace")
    await fs.mkdir(path.join(workspace, "packages", "shared"), { recursive: true })
    const src = path.join(base, "src")
    await fs.mkdir(src)
    await fs.symlink(path.join(workspace, "packages", "shared"), path.join(src, "shared"))
    await fs.symlink(path.join(workspace, "packages"), path.join(src, "packages"))
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)

    await copyDir(src, path.join(root, "first"), { containmentRoot: root, allowedSymlinkRoots: [workspace] })
    await copyDir(src, path.join(root, "second"), { containmentRoot: root, allowedSymlinkRoots: [workspace] })

    expect(await fs.readlink(path.join(root, "first", "shared"))).toBe(path.join(workspace, "packages", "shared"))
    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0][1])
    expect(message).toContain("electron-builder v27")
    expect(message).toContain("points outside the packaged app")
    expect(message.endsWith(`See ${V27_LINK}`)).toBe(true)
  })
})

describe.runIf(process.platform !== "win32")("symlinks for steps that dereference them", () => {
  test("findEscapingSymlinks lists only symlinks that leave the directory", async ({ expect, tmpDir }) => {
    const { root, outside } = await layout(await tmpDir.createTempDir({ prefix: "containment" }))
    await fs.writeFile(path.join(root, "inside.txt"), "x")
    await fs.symlink("inside.txt", path.join(root, "ok"))
    await fs.mkdir(path.join(root, "deep"))
    await fs.symlink(outside, path.join(root, "deep", "bad"))

    const escaping = await findEscapingSymlinks(root)
    expect(escaping.map(it => path.relative(root, it.file))).toEqual([path.join("deep", "bad")])
    expect(escaping[0].target).toBe(outside)
  })

  test("assertNoSymlinkLeaves names the consumer and the symlink", async ({ expect, tmpDir }) => {
    const { root, outside } = await layout(await tmpDir.createTempDir({ prefix: "containment" }))
    await fs.symlink(path.join(outside, "secret"), path.join(root, "leak"))

    const error = await expectEscapeError(assertNoSymlinkLeaves(root, "the test archive"), expect)
    expect(error.message).toContain("cannot build the test archive")
    expect(error.message).toContain("leak")
  })

  test("assertNoSymlinkLeaves accepts symlinks inside the directory", async ({ expect, tmpDir }) => {
    const { root } = await layout(await tmpDir.createTempDir({ prefix: "containment" }))
    await fs.writeFile(path.join(root, "inside.txt"), "x")
    await fs.symlink("inside.txt", path.join(root, "ok"))
    await expect(assertNoSymlinkLeaves(root, "the test archive")).resolves.toBeUndefined()
  })
})
