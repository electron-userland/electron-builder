import { doMergeConfigs, readAsarJson, validateConfiguration } from "app-builder-lib/internal"
import { AsarPackager } from "app-builder-lib/src/asar/asarUtil"
import { createTransformer } from "app-builder-lib/src/fileTransformer"
import { DebugLogger, ERR_PATH_OUTSIDE_ROOT, ExternalLinkPolicy, Filter, InvalidConfigurationError, log } from "builder-util"
import { CancellationToken, GenericServerOptions } from "builder-util-runtime"
import { copyFiles, FileMatcher } from "app-builder-lib/src/fileMatcher"
import { writeAppUpdateYaml } from "app-builder-lib/src/publish/PublishManager"
import { archive } from "app-builder-lib/src/targets/archive"
import { copyAppFiles, ResolvedFileSet, transformFiles } from "app-builder-lib/src/util/appFileCopier"
import {
  assertSourceFileInTrustedRoots,
  getTrustedSourceRoots,
  LINKED_FILES_DOCS_URL,
  readPackageManagerStoreDirs,
  resolveAllowExternalLinks,
} from "app-builder-lib/src/util/trustedSourceRoots"
import { Configuration } from "electron-builder"
import { Stats } from "fs"
import * as fs from "fs/promises"
import * as path from "path"
import { afterEach, vi } from "vitest"

const SYMLINK_DOCS = "https://www.electron.build/docs/contents#symlinks-that-leave-the-app-are-refused"
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

const sourceRootsInfo = (workspace: string, appDir: string) => ({ projectDir: workspace, appDir, getWorkspaceRoot: () => Promise.resolve(workspace) })

async function fileSetOf(src: string, destination: string, names: Array<string>): Promise<ResolvedFileSet> {
  const metadata = new Map<string, Stats>()
  const files: Array<string> = []
  for (const name of names) {
    const file = path.join(src, name)
    files.push(file)
    const stat = await fs.lstat(file)
    // like the app file walker: a symlink that leaves the app directory is followed and its target copied
    metadata.set(file, stat.isSymbolicLink() && path.relative(src, path.resolve(path.dirname(file), await fs.readlink(file))).startsWith("..") ? await fs.stat(file) : stat)
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

    const trustedSourceRoots = await getTrustedSourceRoots(sourceRootsInfo(workspace, appDir), {})
    const destination = path.join(resourcesDir, "app")
    await copyAppFiles(await fileSetOf(appDir, destination, ["main.js", "shared.js"]), packagerStub, () => null, { containmentRoot: resourcesDir, trustedSourceRoots })

    expect(await fs.readFile(path.join(destination, "shared.js"), "utf8")).toBe("shared")
    expect(await fs.readFile(path.join(destination, "main.js"), "utf8")).toBe("main")
  })

  test("refuses a file whose real path is outside the workspace, stating the rule", async ({ expect, tmpDir }) => {
    const { workspace, appDir, resourcesDir, outside } = await createProject(await tmpDir.createTempDir({ prefix: "symlink-containment" }))
    await fs.writeFile(path.join(outside, "secret"), "secret")
    await fs.symlink(path.join(outside, "secret"), path.join(appDir, "leak.txt"))

    const trustedSourceRoots = await getTrustedSourceRoots(sourceRootsInfo(workspace, appDir), {})
    const error = await rejection(
      copyAppFiles(await fileSetOf(appDir, path.join(resourcesDir, "app"), ["leak.txt"]), packagerStub, () => null, { containmentRoot: resourcesDir, trustedSourceRoots })
    )
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain("outside the package")
    expect(error.message).toContain("electron-builder only packages files whose real path is inside the workspace root")
    expect(error.message.endsWith(`See ${LINKED_FILES_DOCS_URL}`)).toBe(true)
    await expect(fs.lstat(path.join(resourcesDir, "app", "leak.txt"))).rejects.toThrow("ENOENT")
  })

  test("refuses a kept symlink that leaves the app through another kept symlink", async ({ expect, tmpDir }) => {
    const { workspace, appDir, resourcesDir } = await createProject(await tmpDir.createTempDir({ prefix: "symlink-containment" }))
    await fs.mkdir(path.join(appDir, "x"))
    // both are inside the app directory lexically (x/a is x/up/.. = x), so they are kept as symlinks; but x/up is the app directory, and
    // x/a leads to its parent: the workspace in the source, which is trusted, and the resources directory in the copy
    await fs.symlink("..", path.join(appDir, "x", "up"))
    await fs.symlink("up/..", path.join(appDir, "x", "a"))

    const error = await rejection(
      copyAppFiles(await fileSetOf(appDir, path.join(resourcesDir, "app"), [path.join("x", "up"), path.join("x", "a")]), packagerStub, () => null, {
        containmentRoot: path.join(resourcesDir, "app"),
        trustedSourceRoots: await getTrustedSourceRoots(sourceRootsInfo(workspace, appDir), {}),
      })
    )
    expect((error as NodeJS.ErrnoException).code).toBe(ERR_PATH_OUTSIDE_ROOT)
    expect(error.message).toContain(SYMLINK_DOCS)
  })

  test("replaces a symlink planted at a destination file", async ({ expect, tmpDir }) => {
    const { workspace, appDir, resourcesDir, outside } = await createProject(await tmpDir.createTempDir({ prefix: "symlink-containment" }))
    await fs.writeFile(path.join(appDir, "main.js"), "main")
    await fs.writeFile(path.join(outside, "victim"), "original")
    await fs.mkdir(path.join(resourcesDir, "app"))
    await fs.symlink(path.join(outside, "victim"), path.join(resourcesDir, "app", "main.js"))

    await copyAppFiles(await fileSetOf(appDir, path.join(resourcesDir, "app"), ["main.js"]), packagerStub, () => null, {
      containmentRoot: resourcesDir,
      trustedSourceRoots: await getTrustedSourceRoots(sourceRootsInfo(workspace, appDir), {}),
    })

    expect(await fs.readFile(path.join(resourcesDir, "app", "main.js"), "utf8")).toBe("main")
    expect(await fs.readFile(path.join(outside, "victim"), "utf8")).toBe("original")
  })
})

describe.runIf(process.platform !== "win32")("trusted source roots (asar and non-asar)", () => {
  test("the pnpm store outside the workspace is trusted, other directories outside it are not", async ({ expect, tmpDir }) => {
    const base = await tmpDir.createTempDir({ prefix: "symlink-containment" })
    const { workspace, appDir, outside } = await createProject(base)
    const store = path.join(base, "pnpm-store")
    await fs.mkdir(path.join(store, "v11", "links", "dep"), { recursive: true })
    await fs.writeFile(path.join(store, "v11", "links", "dep", "index.js"), "dep")
    await fs.mkdir(path.join(workspace, "node_modules"), { recursive: true })
    await fs.writeFile(path.join(workspace, "node_modules", ".modules.yaml"), JSON.stringify({ storeDir: path.join(store, "v11"), virtualStoreDir: ".pnpm" }))
    await fs.symlink(path.join(store, "v11", "links", "dep"), path.join(workspace, "node_modules", "dep"))
    // `outside` stands for anywhere else on the build machine, such as the home or temp directory
    await fs.writeFile(path.join(outside, "file"), "x")
    await fs.symlink(path.join(outside, "file"), path.join(appDir, "home-file"))

    expect(await readPackageManagerStoreDirs(path.join(workspace, "node_modules"))).toEqual([path.join(store, "v11"), path.join(workspace, "node_modules", ".pnpm")])
    const roots = await getTrustedSourceRoots(sourceRootsInfo(workspace, appDir), {})
    await expect(assertSourceFileInTrustedRoots(path.join(workspace, "node_modules", "dep", "index.js"), roots)).resolves.toBeUndefined()
    await expect(assertSourceFileInTrustedRoots(path.join(appDir, "home-file"), roots)).rejects.toThrow(LINKED_FILES_DOCS_URL)
  })

  test("a missing or invalid pnpm modules file adds no store", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "symlink-containment" })
    expect(await readPackageManagerStoreDirs(dir)).toEqual([])
    await fs.writeFile(path.join(dir, ".modules.yaml"), "{ not: [valid")
    expect(await readPackageManagerStoreDirs(dir)).toEqual([])
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
    expect(error.message).toContain("Files from elsewhere on the build machine would be packaged, so this is refused")
    expect(error.message).toContain(SYMLINK_DOCS)
  })
})

describe.runIf(process.platform !== "win32")("allowExternalLinks", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    log.resetLimits("allow-external-links")
  })

  /** app/node_modules/lib -> outside/lib, like `npm link` or a `file:` dependency outside the repository */
  async function linkedPackage(base: string) {
    const project = await createProject(base)
    const lib = path.join(project.outside, "lib")
    await fs.mkdir(path.join(lib, "src"), { recursive: true })
    await fs.writeFile(path.join(lib, "src", "index.js"), "lib")
    await fs.mkdir(path.join(project.appDir, "node_modules"))
    await fs.symlink(lib, path.join(project.appDir, "node_modules", "lib"))
    const file = path.join(project.appDir, "node_modules", "lib", "src", "index.js")
    return { ...project, lib, file }
  }

  test("by default a linked package outside the workspace is refused with a hint naming the linked package", async ({ expect, tmpDir }) => {
    const { workspace, appDir, lib, file } = await linkedPackage(await tmpDir.createTempDir({ prefix: "symlink-containment" }))
    const roots = await getTrustedSourceRoots(sourceRootsInfo(workspace, appDir), {})

    const error = await rejection(assertSourceFileInTrustedRoots(file, roots, await ExternalLinkPolicy.create(null, workspace)))
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect((error as NodeJS.ErrnoException).code).toBe("ERR_ELECTRON_BUILDER_FILE_OUTSIDE_WORKSPACE")
    expect(error.message).toContain(`Cannot copy file [${path.join("app", "node_modules", "lib", "src", "index.js")}]`)
    expect(error.message).toContain(`symlinked to file [${path.join(await fs.realpath(lib), "src", "index.js")}]`)
    expect(error.message).toContain("electron-builder only packages files whose real path is inside the workspace root")
    // the whole linked package, not only the directory of the file checked first
    expect(error.message).toContain(
      `To allow it, set "fileOptions": { "allowExternalLinks": ${JSON.stringify([await fs.realpath(lib)])} } (or { "allowExternalLinks": true }) in your build configuration.`
    )
    expect(error.message.endsWith(`See ${LINKED_FILES_DOCS_URL}`)).toBe(true)
  })

  test("true, or a list with the linked package's directory (relative or absolute), packages it", async ({ expect, tmpDir }) => {
    const { workspace, appDir, outside, lib, file } = await linkedPackage(await tmpDir.createTempDir({ prefix: "symlink-containment" }))
    const roots = await getTrustedSourceRoots(sourceRootsInfo(workspace, appDir), {})
    for (const value of [true, ["../outside/lib"], [outside], [lib]]) {
      await expect(assertSourceFileInTrustedRoots(file, roots, await ExternalLinkPolicy.create(value, workspace))).resolves.toBeUndefined()
    }
    await expect(assertSourceFileInTrustedRoots(file, roots, await ExternalLinkPolicy.create(["app"], workspace))).rejects.toThrow("allowExternalLinks")
  })

  test("asar: false copies an allowed linked file and still refuses one outside the list", async ({ expect, tmpDir }) => {
    const base = await tmpDir.createTempDir({ prefix: "symlink-containment" })
    const { workspace, appDir, resourcesDir, outside } = await createProject(base)
    const elsewhere = path.join(base, "elsewhere")
    await fs.mkdir(elsewhere)
    await fs.writeFile(path.join(outside, "allowed.txt"), "allowed")
    await fs.writeFile(path.join(elsewhere, "refused.txt"), "refused")
    await fs.symlink(path.join(outside, "allowed.txt"), path.join(appDir, "allowed.txt"))
    await fs.symlink(path.join(elsewhere, "refused.txt"), path.join(appDir, "refused.txt"))
    const trustedSourceRoots = await getTrustedSourceRoots(sourceRootsInfo(workspace, appDir), {})
    const externalLinks = await ExternalLinkPolicy.create(["../outside"], workspace)
    const destination = path.join(resourcesDir, "app")

    await copyAppFiles(await fileSetOf(appDir, destination, ["allowed.txt"]), packagerStub, () => null, { containmentRoot: resourcesDir, trustedSourceRoots, externalLinks })
    expect(await fs.readFile(path.join(destination, "allowed.txt"), "utf8")).toBe("allowed")

    const error = await rejection(
      copyAppFiles(await fileSetOf(appDir, destination, ["refused.txt"]), packagerStub, () => null, { containmentRoot: resourcesDir, trustedSourceRoots, externalLinks })
    )
    expect(error.message).toContain(`"allowExternalLinks": ${JSON.stringify([await fs.realpath(elsewhere)])}`)
  })

  test("extraResources keeps an allowed symlink that leaves the app, warning once", async ({ expect, tmpDir }) => {
    const { workspace, appOutDir, resourcesDir, outside } = await createProject(await tmpDir.createTempDir({ prefix: "symlink-containment" }))
    const extra = path.join(workspace, "extra")
    await fs.mkdir(extra)
    await fs.symlink(outside, path.join(extra, "data"))
    await fs.symlink(path.join(outside, "x"), path.join(extra, "x"))
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)

    const refused = await rejection(
      copyFiles([new FileMatcher(extra, resourcesDir, noMacro)], null, false, { roots: [appOutDir], externalLinks: await ExternalLinkPolicy.create(false, workspace) })
    )
    expect((refused as NodeJS.ErrnoException).code).toBe(ERR_PATH_OUTSIDE_ROOT)
    expect(refused.message).toContain("allowExternalLinks")

    await copyFiles([new FileMatcher(extra, resourcesDir, noMacro)], null, false, { roots: [appOutDir], externalLinks: await ExternalLinkPolicy.create(true, workspace) })
    expect(await fs.readlink(path.join(resourcesDir, "data"))).toBe(outside)
    expect(await fs.readlink(path.join(resourcesDir, "x"))).toBe(path.join(outside, "x"))
    expect(warn.mock.calls.filter(it => String(it[1]).includes("allowExternalLinks"))).toHaveLength(1)
  })

  test("a Windows archive refuses a symlink outside the list, with the hint", async ({ expect, tmpDir }) => {
    const { workspace, appOutDir, outside } = await createProject(await tmpDir.createTempDir({ prefix: "symlink-containment" }))
    await fs.writeFile(path.join(outside, "secret"), "secret")
    await fs.symlink(path.join(outside, "secret"), path.join(appOutDir, "resources", "leak"))

    const error = await rejection(
      archive("zip", path.join(path.dirname(appOutDir), "app.zip"), appOutDir, {
        withoutDir: true,
        preserveSymlinks: false,
        externalLinks: await ExternalLinkPolicy.create(["dist/linux-unpacked/resources"], workspace),
      })
    )
    expect(error.message).toContain(`"allowExternalLinks": ${JSON.stringify([await fs.realpath(outside)])}`)
    expect(error.message).toContain(`"${path.join("dist", "linux-unpacked", "resources", "leak")}"`)
  })
})

describe.runIf(process.platform !== "win32")("a transformed file is checked like any other (node_modules package.json)", () => {
  /** app/node_modules/pkg/package.json -> outside/pkg.json: the default transformer rewrites it (drops `scripts`), reading it through the symlink */
  async function linkedPackageJson(base: string) {
    const project = await createProject(base)
    const pkgDir = path.join(project.appDir, "node_modules", "pkg")
    await fs.mkdir(pkgDir, { recursive: true })
    await fs.writeFile(path.join(pkgDir, "index.js"), "pkg")
    await fs.writeFile(path.join(project.outside, "pkg.json"), JSON.stringify({ name: "pkg", version: "1.0.0", scripts: { postinstall: "secret" } }))
    await fs.symlink(path.join(project.outside, "pkg.json"), path.join(pkgDir, "package.json"))
    await fs.writeFile(path.join(project.appDir, "main.js"), "main")
    const names = ["main.js", path.join("node_modules", "pkg", "index.js"), path.join("node_modules", "pkg", "package.json")]
    const transformer = createTransformer(project.appDir, {}, null, null)
    return { ...project, names, transformer, destination: path.join(project.resourcesDir, "app") }
  }

  async function transformedFileSet(project: Awaited<ReturnType<typeof linkedPackageJson>>) {
    const fileSet = await fileSetOf(project.appDir, project.destination, project.names)
    await transformFiles(project.transformer, fileSet)
    return fileSet
  }

  async function packAsar(project: Awaited<ReturnType<typeof linkedPackageJson>>, fileSet: ResolvedFileSet, externalLinks: ExternalLinkPolicy, unpackPattern?: Filter) {
    const packager = { ...sourceRootsInfo(project.workspace, project.appDir), getExternalLinkPolicy: () => Promise.resolve(externalLinks) }
    await new AsarPackager(packager as any, {
      defaultDestination: project.destination,
      resourcePath: project.resourcesDir,
      options: { smartUnpack: false },
      unpackPattern,
    }).pack([fileSet])
    return path.join(project.resourcesDir, "app.asar")
  }

  for (const [name, unpackPattern] of [
    ["packed", undefined],
    ["unpacked", (file: string) => file.endsWith("package.json")],
  ] as Array<[string, Filter | undefined]>) {
    test(`asar (${name}): refused by default, packaged when fileOptions.allowExternalLinks covers it`, async ({ expect, tmpDir }) => {
      const project = await linkedPackageJson(await tmpDir.createTempDir({ prefix: "symlink-containment" }))
      const fileSet = await transformedFileSet(project)
      // the package.json is transformed, so it takes the transformed-content branch of the packer
      expect(Array.from(fileSet.transformedFiles!.keys())).toEqual([2])

      const error = await rejection(packAsar(project, fileSet, await ExternalLinkPolicy.create(null, project.workspace), unpackPattern))
      expect(error).toBeInstanceOf(InvalidConfigurationError)
      expect((error as NodeJS.ErrnoException).code).toBe("ERR_ELECTRON_BUILDER_FILE_OUTSIDE_WORKSPACE")
      expect(error.message).toContain(`symlinked to file [${path.join(await fs.realpath(project.outside), "pkg.json")}]`)
      await expect(fs.lstat(path.join(project.resourcesDir, "app.asar"))).rejects.toThrow("ENOENT")

      const asarFile = await packAsar(project, fileSet, await ExternalLinkPolicy.create(["../outside"], project.workspace), unpackPattern)
      expect(await readAsarJson(asarFile, path.join("node_modules", "pkg", "package.json"))).toEqual({ name: "pkg", version: "1.0.0" })
    })
  }

  test("asar: false: refused by default, copied when fileOptions.allowExternalLinks covers it", async ({ expect, tmpDir }) => {
    const project = await linkedPackageJson(await tmpDir.createTempDir({ prefix: "symlink-containment" }))
    const trustedSourceRoots = await getTrustedSourceRoots(sourceRootsInfo(project.workspace, project.appDir), {})
    // a fresh destination for each copy: the refused one has copied the files before the package.json
    const copy = async (externalLinks: ExternalLinkPolicy, destination: string) =>
      copyAppFiles(await fileSetOf(project.appDir, destination, project.names), packagerStub, project.transformer, {
        containmentRoot: project.resourcesDir,
        trustedSourceRoots,
        externalLinks,
      })
    const copiedPackageJson = (destination: string) => path.join(destination, "node_modules", "pkg", "package.json")

    const refused = path.join(project.resourcesDir, "refused")
    const error = await rejection(copy(await ExternalLinkPolicy.create(null, project.workspace), refused))
    expect((error as NodeJS.ErrnoException).code).toBe("ERR_ELECTRON_BUILDER_FILE_OUTSIDE_WORKSPACE")
    await expect(fs.lstat(copiedPackageJson(refused))).rejects.toThrow("ENOENT")

    await copy(await ExternalLinkPolicy.create(["../outside"], project.workspace), project.destination)
    expect(JSON.parse(await fs.readFile(copiedPackageJson(project.destination), "utf8"))).toEqual({ name: "pkg", version: "1.0.0" })
  })
})

describe("fileOptions.allowExternalLinks in the configuration", () => {
  test("is read from the root fileOptions, and a platform's fileOptions value replaces it", ({ expect }) => {
    const root = { fileOptions: { allowExternalLinks: ["../shared-lib"] } }
    expect(resolveAllowExternalLinks(root, undefined, "linux")).toEqual({ value: ["../shared-lib"], optionPath: "fileOptions.allowExternalLinks" })
    expect(resolveAllowExternalLinks(root, { fileOptions: { files: ["dist/**"] } }, "linux")).toEqual({
      value: ["../shared-lib"],
      optionPath: "fileOptions.allowExternalLinks",
    })
    // replaced, not combined like the file lists, false included
    expect(resolveAllowExternalLinks(root, { fileOptions: { allowExternalLinks: true } }, "linux")).toEqual({ value: true, optionPath: "linux.fileOptions.allowExternalLinks" })
    expect(resolveAllowExternalLinks(root, { fileOptions: { allowExternalLinks: false } }, "mac")).toEqual({ value: false, optionPath: "mac.fileOptions.allowExternalLinks" })
    expect(resolveAllowExternalLinks(root, { fileOptions: { allowExternalLinks: ["../other"] } }, "win").value).toEqual(["../other"])
    // a platform-level null falls back to the root value
    expect(resolveAllowExternalLinks(root, { fileOptions: { allowExternalLinks: null } }, "win").value).toEqual(["../shared-lib"])
    expect(resolveAllowExternalLinks({}, { fileOptions: null }, "win")).toEqual({ value: undefined, optionPath: "fileOptions.allowExternalLinks" })
  })

  test("a malformed platform value is reported with its path", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.createTempDir({ prefix: "symlink-containment" })
    const { value, optionPath } = resolveAllowExternalLinks({ fileOptions: { allowExternalLinks: true } }, { fileOptions: { allowExternalLinks: ["missing-dir"] } }, "linux")
    await expect(ExternalLinkPolicy.create(value, projectDir, optionPath)).rejects.toThrow(`"linux.fileOptions.allowExternalLinks" lists "missing-dir", which does not exist`)
  })

  test("the schema accepts it under fileOptions, at the root and per platform", async ({ expect }) => {
    const config: Configuration = {
      fileOptions: { files: ["dist/**"], allowExternalLinks: ["../shared-lib"] },
      mac: { fileOptions: { allowExternalLinks: true } },
      linux: { fileOptions: { allowExternalLinks: false } },
      win: { fileOptions: { allowExternalLinks: null } },
    }
    await expect(validateConfiguration(config, new DebugLogger(false))).resolves.toBeUndefined()
  })

  test("it has no flat form: a top-level or platform-level allowExternalLinks is an unknown property, like any other", async ({ expect }) => {
    for (const config of [{ allowExternalLinks: true }, { linux: { allowExternalLinks: ["../lib"] } }]) {
      await expect(validateConfiguration(config as Configuration, new DebugLogger(false))).rejects.toThrow(/unknown property[\s\S]*allowExternalLinks/)
    }
  })

  test("an extends parent's value is kept when the child sets the file lists, flat or nested", ({ expect }) => {
    const parent = { fileOptions: { allowExternalLinks: ["../shared-lib"] } }
    for (const child of [{ fileOptions: { files: ["dist/**"] } }, { files: ["dist/**"] }]) {
      const merged = doMergeConfigs([{ ...parent }, { ...child }] as Configuration[])
      expect(merged.fileOptions?.allowExternalLinks).toEqual(["../shared-lib"])
      expect(merged.fileOptions?.files).toEqual([{ filter: ["dist/**"] }])
    }
  })
})
