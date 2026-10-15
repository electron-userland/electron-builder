import { ERR_PATH_OUTSIDE_ROOT, InvalidConfigurationError } from "builder-util"
import { CancellationToken, GenericServerOptions } from "builder-util-runtime"
import { copyFiles, FileMatcher } from "app-builder-lib/src/fileMatcher"
import { writeAppUpdateYaml } from "app-builder-lib/src/publish/PublishManager"
import { archive } from "app-builder-lib/src/targets/archive"
import { copyAppFiles, ResolvedFileSet } from "app-builder-lib/src/util/appFileCopier"
import { Stats } from "fs"
import * as fs from "fs/promises"
import * as path from "path"

const SYMLINK_DOCS = "https://www.electron.build/docs/migration/v27-breaking-changes#symlinks-that-leave-the-app-are-refused"
const noMacro = (it: string) => it
const genericFeed: GenericServerOptions = { provider: "generic", url: "https://example.com" }

async function rejection(promise: Promise<unknown>): Promise<Error> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  )
  if (!(error instanceof Error)) {
    throw new Error("expected the promise to reject")
  }
  return error
}

/** project/ (the workspace, with app/ and dist/linux-unpacked/), and outside/, a directory elsewhere on the build machine */
async function createProject(base: string) {
  const workspace = path.join(base, "project")
  const appDir = path.join(workspace, "app")
  const appOutDir = path.join(workspace, "dist", "linux-unpacked")
  const resourcesDir = path.join(appOutDir, "resources")
  const outside = path.join(base, "outside")
  for (const dir of [appDir, resourcesDir, outside]) {
    await fs.mkdir(dir, { recursive: true })
  }
  return { workspace, appDir, appOutDir, resourcesDir, outside }
}

async function fileSetOf(src: string, destination: string, names: Array<string>): Promise<ResolvedFileSet> {
  const metadata = new Map<string, Stats>()
  const files: Array<string> = []
  for (const name of names) {
    const file = path.join(src, name)
    files.push(file)
    const stat = await fs.lstat(file)
    // like the app file walker: a symlink that leaves the app directory is followed and its target copied
    metadata.set(file, stat.isSymbolicLink() && path.relative(src, path.resolve(src, await fs.readlink(file))).startsWith("..") ? await fs.stat(file) : stat)
  }
  return { src, destination, files, metadata }
}

const packagerStub = { cancellationToken: new CancellationToken() }

describe.runIf(process.platform !== "win32")("extraResources / extraFiles (copyFiles)", () => {
  test("refuses to copy into a directory that a copied app symlink takes outside the app", async ({ expect, tmpDir }) => {
    const { workspace, appOutDir, resourcesDir, outside } = await createProject(await tmpDir.createTempDir({ prefix: "symlink-containment" }))
    const extra = path.join(workspace, "extra")
    await fs.mkdir(path.join(extra, "data"), { recursive: true })
    await fs.writeFile(path.join(extra, "data", "payload.txt"), "payload")
    // left by the app directory copy (asar: false): resources/data -> outside
    await fs.symlink(outside, path.join(resourcesDir, "data"))

    const error = await rejection(copyFiles([new FileMatcher(extra, resourcesDir, noMacro)], null, false, { roots: [appOutDir, path.dirname(appOutDir)] }))
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect((error as NodeJS.ErrnoException).code).toBe(ERR_PATH_OUTSIDE_ROOT)
    expect(error.message).toContain(SYMLINK_DOCS)
    expect(await fs.readdir(outside)).toEqual([])
  })

  test("replaces a symlink planted at the destination of a single copied file", async ({ expect, tmpDir }) => {
    const { workspace, appOutDir, resourcesDir, outside } = await createProject(await tmpDir.createTempDir({ prefix: "symlink-containment" }))
    const victim = path.join(outside, "victim")
    await fs.writeFile(victim, "original")
    const source = path.join(workspace, "license.txt")
    await fs.writeFile(source, "license")
    const dest = path.join(resourcesDir, "license.txt")
    await fs.symlink(victim, dest)

    await copyFiles([new FileMatcher(source, dest, noMacro)], null, false, { roots: [appOutDir] })

    expect(await fs.readFile(dest, "utf8")).toBe("license")
    expect(await fs.readFile(victim, "utf8")).toBe("original")
  })
})

describe.runIf(process.platform !== "win32")("app files without asar (copyAppFiles)", () => {
  test("copies a file that is linked from the workspace (pnpm/yarn workspace package, #675)", async ({ expect, tmpDir }) => {
    const { workspace, appDir, resourcesDir } = await createProject(await tmpDir.createTempDir({ prefix: "symlink-containment" }))
    await fs.mkdir(path.join(workspace, "packages", "shared"), { recursive: true })
    await fs.writeFile(path.join(workspace, "packages", "shared", "index.js"), "shared")
    await fs.symlink(path.join(workspace, "packages", "shared", "index.js"), path.join(appDir, "shared.js"))
    await fs.writeFile(path.join(appDir, "main.js"), "main")

    const destination = path.join(resourcesDir, "app")
    await copyAppFiles(await fileSetOf(appDir, destination, ["main.js", "shared.js"]), packagerStub, () => null, { containmentRoot: resourcesDir })

    expect(await fs.readFile(path.join(destination, "shared.js"), "utf8")).toBe("shared")
    expect(await fs.readFile(path.join(destination, "main.js"), "utf8")).toBe("main")
  })

  test("refuses a kept symlink that leaves the app through another kept symlink", async ({ expect, tmpDir }) => {
    const { appDir, resourcesDir } = await createProject(await tmpDir.createTempDir({ prefix: "symlink-containment" }))
    await fs.mkdir(path.join(appDir, "x"))
    // both are inside the app directory lexically (x/a is x/up/.. = x), so they are kept as symlinks; but x/up is the app directory, and
    // x/a leads to its parent: the workspace in the source, which is trusted, and the resources directory in the copy
    await fs.symlink("..", path.join(appDir, "x", "up"))
    await fs.symlink("up/..", path.join(appDir, "x", "a"))

    const error = await rejection(
      copyAppFiles(await fileSetOf(appDir, path.join(resourcesDir, "app"), [path.join("x", "up"), path.join("x", "a")]), packagerStub, () => null, {
        containmentRoot: path.join(resourcesDir, "app"),
      })
    )
    expect((error as NodeJS.ErrnoException).code).toBe(ERR_PATH_OUTSIDE_ROOT)
    expect(error.message).toContain(SYMLINK_DOCS)
  })

  test("replaces a symlink planted at a destination file", async ({ expect, tmpDir }) => {
    const { appDir, resourcesDir, outside } = await createProject(await tmpDir.createTempDir({ prefix: "symlink-containment" }))
    await fs.writeFile(path.join(appDir, "main.js"), "main")
    await fs.writeFile(path.join(outside, "victim"), "original")
    await fs.mkdir(path.join(resourcesDir, "app"))
    await fs.symlink(path.join(outside, "victim"), path.join(resourcesDir, "app", "main.js"))

    await copyAppFiles(await fileSetOf(appDir, path.join(resourcesDir, "app"), ["main.js"]), packagerStub, () => null, {
      containmentRoot: resourcesDir,
    })

    expect(await fs.readFile(path.join(resourcesDir, "app", "main.js"), "utf8")).toBe("main")
    expect(await fs.readFile(path.join(outside, "victim"), "utf8")).toBe("original")
  })
})

describe.runIf(process.platform !== "win32")("fixed-name writes", () => {
  test("app-update.yml replaces a symlink copied in from extraResources", async ({ expect, tmpDir }) => {
    const { appOutDir, resourcesDir, outside } = await createProject(await tmpDir.createTempDir({ prefix: "symlink-containment" }))
    const victim = path.join(outside, ".bashrc")
    await fs.writeFile(victim, "original")
    await fs.symlink(victim, path.join(resourcesDir, "app-update.yml"))

    await writeAppUpdateYaml(resourcesDir, genericFeed, appOutDir)

    expect((await fs.lstat(path.join(resourcesDir, "app-update.yml"))).isSymbolicLink()).toBe(false)
    expect(await fs.readFile(path.join(resourcesDir, "app-update.yml"), "utf8")).toContain("provider: generic")
    expect(await fs.readFile(victim, "utf8")).toBe("original")
  })

  test("app-update.yml is not written into a resources directory that leads outside the app", async ({ expect, tmpDir }) => {
    const { appOutDir, outside } = await createProject(await tmpDir.createTempDir({ prefix: "symlink-containment" }))
    const linkedResources = path.join(appOutDir, "linked-resources")
    await fs.symlink(outside, linkedResources)

    const error = await rejection(writeAppUpdateYaml(linkedResources, genericFeed, appOutDir))
    expect((error as NodeJS.ErrnoException).code).toBe(ERR_PATH_OUTSIDE_ROOT)
    expect(await fs.readdir(outside)).toEqual([])
  })
})

describe.runIf(process.platform !== "win32")("archives that dereference symlinks (Windows zip/7z/NSIS)", () => {
  test("refuse a symlink that leaves the archived directory, before 7za runs", async ({ expect, tmpDir }) => {
    const { appOutDir, outside } = await createProject(await tmpDir.createTempDir({ prefix: "symlink-containment" }))
    await fs.writeFile(path.join(outside, "secret"), "secret")
    await fs.symlink(path.join(outside, "secret"), path.join(appOutDir, "resources", "leak"))

    const error = await rejection(archive("zip", path.join(path.dirname(appOutDir), "app.zip"), appOutDir, { withoutDir: true, preserveSymlinks: false }))
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain('cannot build the zip archive "app.zip"')
    expect(error.message).toContain("electron-builder v27")
    expect(error.message).toContain(SYMLINK_DOCS)
  })
})
