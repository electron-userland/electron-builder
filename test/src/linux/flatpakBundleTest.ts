import { afterEach, beforeEach, ExpectStatic, vi } from "vitest"

// buildFlatpakBundle shells out to flatpak and flatpak-builder, which exist on Linux only. Intercept `exec` so the
// command lines can be asserted on every OS; everything the module does on disk happens in a real directory.
vi.mock("builder-util", async () => {
  const actual = await vi.importActual<typeof import("builder-util")>("builder-util")
  return { ...actual, exec: vi.fn() }
})
const TOOLS_DIR = "/opt/flatpak/bin"

import { buildFlatpakBundle, FlatpakBuilderManifest, FlatpakBundleOptions } from "app-builder-lib/src/targets/linux/flatpakBundle"
import { exec, ExecError, Executables, InvalidConfigurationError, log } from "builder-util"
import { existsSync } from "fs"
import { chmod, mkdir, readdir, readFile, readlink, realpath, stat, symlink, writeFile } from "fs/promises"
import * as path from "path"
import { TmpDir } from "temp-file"

const DOCS = "https://www.electron.build/docs/flatpak#building-in-unprivileged-containers"
// the version check and the app-prefix check are new in v27, so their messages say so and link to the migration guide
const NEW_IN_V27 = "This is new in electron-builder v27. See https://www.electron.build/docs/migration/v27-build-changes#flatpak-tooling-requirements"

const manifest: FlatpakBuilderManifest = {
  id: "com.example.App",
  command: "electron-wrapper",
  runtime: "org.freedesktop.Platform",
  "runtime-version": "24.08",
  sdk: "org.freedesktop.Sdk",
  base: "org.electronjs.Electron2.BaseApp",
  // differs from the runtime version to show which version each ref gets
  "base-version": "23.08",
  "finish-args": ["--share=ipc", "--socket=x11"],
}

/** The runtime, the sdk and the base app of the manifest, in the order they are brought up to date. */
const REFS = ["runtime/org.freedesktop.Platform/x86_64/24.08", "runtime/org.freedesktop.Sdk/x86_64/24.08", "app/org.electronjs.Electron2.BaseApp/x86_64/23.08"]

type Command = [file: string, ...args: string[]]

/** What the tools print for --version, in the two formats that are in use ("flatpak-builder 1.2.3" is the third). */
const VERSION_OUTPUT: Record<string, string> = { flatpak: "Flatpak 1.16.6\n", "flatpak-builder": "flatpak-builder-1.4.4\n" }

// flatpak and flatpak-builder are started by absolute path, which the resolver would look for on this machine's disk
beforeEach(() => {
  vi.spyOn(Executables, "resolve").mockImplementation(name => `${TOOLS_DIR}/${name}`)
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function setup(tmpDir: TmpDir, overrides: Partial<FlatpakBundleOptions> = {}) {
  const tempDir = await tmpDir.createTempDir({ prefix: "flatpak" })
  const options: FlatpakBundleOptions = {
    manifest,
    arch: "x86_64",
    // the output directory has to be created
    artifactPath: path.join(await tmpDir.createTempDir({ prefix: "out" }), "dist", "App.flatpak"),
    tempDir,
    files: [],
    symlinks: [],
    installOrUpdateRefs: ["runtime", "sdk", "base"],
    flatpakBuilderArgs: [],
    buildExportArgs: [],
    buildBundleArgs: [],
    ...overrides,
  }
  return { options, appDir: path.join(tempDir, "build"), repo: path.join(tempDir, "repo"), manifestFile: path.join(tempDir, "manifest.json") }
}

/** What `exec` puts in the error for a tool that exited with 1: the command line, then the tool's output. */
function execError(file: string, args: string[], output: string): ExecError {
  return new ExecError(file, 1, `Exit code: 1. Command failed: ${file} ${args.join(" ")}\n${output}`, "")
}

/**
 * Stands in for the tools. `installedIn` says which installations `flatpak info` finds every ref in, and `run` can
 * make a command fail (by throwing) or act on the disk like the real tool would. flatpak-builder --build-only creates
 * the app prefix, as the real one does.
 */
function mockTools(installedIn: Array<"--user" | "--system">, run: (file: string, args: string[]) => void | Promise<void> = () => {}, versionOutput = VERSION_OUTPUT) {
  vi.mocked(exec).mockImplementation(async (path_, args) => {
    // the tools are started by absolute path; the stand-ins below go by name
    const file = path.basename(path_)
    const argv = args ?? []
    await run(file, argv)
    // the app directory is the second to last argument
    const appDir = argv.at(-2)
    if (argv.includes("--build-only") && appDir != null) {
      await mkdir(path.join(appDir, "files"), { recursive: true })
    }
    if (argv[0] === "info" && !installedIn.some(it => argv.includes(it))) {
      throw execError(file, argv, `error: ${argv.at(-1)} not installed`)
    }
    return argv[0] === "--version" ? versionOutput[file] : ""
  })
}

/** Makes the first command that `isFailing` picks fail the way `exec` reports it, and holds the error that has to be rethrown untouched. */
function failWith(installedIn: Array<"--user" | "--system">, isFailing: (args: string[]) => boolean, output: (args: string[]) => string) {
  const failure: { error?: ExecError } = {}
  mockTools(installedIn, (file, args) => {
    if (isFailing(args)) {
      failure.error = execError(file, args, output(args))
      throw failure.error
    }
  })
  return failure
}

/** The error a promise rejects with. Fails when it resolves, so that a comparison with an error that was never thrown cannot pass. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (e) {
    return e
  }
  throw new Error("expected the build to fail")
}

/** Every command in the order it was started, after checking the directory and the environment that each one ran with. */
function commands(expect: ExpectStatic, options: FlatpakBundleOptions): Command[] {
  return vi.mocked(exec).mock.calls.map(([toolPath, args, execOptions]) => {
    // never looked up on PATH
    expect(path.dirname(toolPath)).toBe(TOOLS_DIR)
    const command: Command = [path.basename(toolPath), ...(args ?? [])]
    // with modules, the two runs of flatpak-builder download their sources, which can take credentials from the environment.
    // Every other command, and flatpak-builder without modules, gets the filtered environment that exec defaults to
    const isBuilderRun = command.includes("--build-only") || command.includes("--finish-only")
    const environment = isBuilderRun && (options.manifest.modules?.length ?? 0) > 0 ? "process.env" : "default"
    const { env, ...others } = execOptions ?? {}
    expect(others, command.join(" ")).toEqual({ cwd: options.tempDir })
    // compared by name, so that a failure does not print the environment into the test report
    expect(env === process.env ? "process.env" : env == null ? "default" : "other", command.join(" ")).toBe(environment)
    return command
  })
}

/** The whole sequence of a build without branch or additional arguments, given the command that brings each ref up to date. */
function expectedCommands(paths: Awaited<ReturnType<typeof setup>>, refCommand: (ref: string) => Command): Command[] {
  const { options, appDir, repo, manifestFile } = paths
  const refs = REFS.flatMap((ref): Command[] => [["flatpak", "info", "--show-commit", "--user", ref], ["flatpak", "info", "--show-commit", "--system", ref], refCommand(ref)])
  return [
    ["flatpak", "--version"],
    ["flatpak-builder", "--version"],
    ...refs,
    ["flatpak-builder", "--arch", "x86_64", "--build-only", appDir, manifestFile],
    ["flatpak-builder", "--arch", "x86_64", "--finish-only", appDir, manifestFile],
    ["flatpak", "build-export", "--arch", "x86_64", repo, appDir],
    ["flatpak", "build-bundle", "--arch", "x86_64", repo, options.artifactPath, "com.example.App"],
  ]
}

const builderCommands = (all: Command[]) => all.filter(it => it[0] === "flatpak-builder" && it[1] !== "--version")
const subcommand = (all: Command[], name: string) => all.find(it => it[0] === "flatpak" && it[1] === name)

async function listTree(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries.map(it => `${path.relative(dir, path.join(it.parentPath, it.name)).split(path.sep).join("/")}${it.isDirectory() ? "/" : ""}`).sort()
}

async function writeTree(root: string, files: Record<string, string | null>): Promise<string> {
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name)
    if (content == null) {
      await mkdir(file, { recursive: true })
    } else {
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, content)
    }
  }
  return root
}

describe("buildFlatpakBundle", { concurrent: false }, () => {
  beforeEach(() => {
    vi.mocked(exec).mockReset()
    vi.spyOn(log, "info").mockImplementation(() => undefined)
    vi.spyOn(log, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("installOrUpdateRefs", () => {
    const infoCommands = (ref: string): Command[] => [
      ["flatpak", "info", "--show-commit", "--user", ref],
      ["flatpak", "info", "--show-commit", "--system", ref],
    ]
    const buildCommands = ({ options, appDir, repo, manifestFile }: Awaited<ReturnType<typeof setup>>): Command[] => [
      ["flatpak-builder", "--arch", "x86_64", "--build-only", appDir, manifestFile],
      ["flatpak-builder", "--arch", "x86_64", "--finish-only", appDir, manifestFile],
      ["flatpak", "build-export", "--arch", "x86_64", repo, appDir],
      ["flatpak", "build-bundle", "--arch", "x86_64", repo, options.artifactPath, "com.example.App"],
    ]
    const versionCommands: Command[] = [
      ["flatpak", "--version"],
      ["flatpak-builder", "--version"],
    ]

    test("an empty list uses every ref as installed, without an install or an update", async ({ expect, tmpDir }) => {
      const paths = await setup(tmpDir, { installOrUpdateRefs: [] })
      mockTools(["--system"])

      await buildFlatpakBundle(paths.options)

      expect(commands(expect, paths.options)).toEqual([...versionCommands, ...REFS.flatMap(infoCommands), ...buildCommands(paths)])
      for (const ref of REFS) {
        expect(log.info).toHaveBeenCalledWith({ ref }, "flatpak ref is used as installed, without an update")
      }
    })

    test("a ref that is left out is checked first, then the others are brought up to date", async ({ expect, tmpDir }) => {
      const paths = await setup(tmpDir, { installOrUpdateRefs: ["runtime", "sdk"] })
      mockTools(["--user"])

      await buildFlatpakBundle(paths.options)

      const [runtime, sdk, base] = REFS
      expect(commands(expect, paths.options)).toEqual([
        ...versionCommands,
        ...infoCommands(base),
        ...infoCommands(runtime),
        ["flatpak", "update", "--user", "--no-deps", "--noninteractive", runtime],
        ...infoCommands(sdk),
        ["flatpak", "update", "--user", "--no-deps", "--noninteractive", sdk],
        ...buildCommands(paths),
      ])
    })

    test("a ref that is left out and installed nowhere fails the build before anything is installed", async ({ expect, tmpDir }) => {
      const paths = await setup(tmpDir, { installOrUpdateRefs: ["runtime", "sdk"] })
      mockTools([])

      const error = await rejection(buildFlatpakBundle(paths.options))

      expect(error).toBeInstanceOf(InvalidConfigurationError)
      expect((error as Error).message).toBe(
        `the base ${REFS[2]} is not installed, and flatpak.installOrUpdateRefs does not include "base", so the build does not install it. Install it, for example with: flatpak install --user flathub ${REFS[2]} (or add "base" to flatpak.installOrUpdateRefs)`
      )
      expect(commands(expect, paths.options)).toEqual([...versionCommands, ...infoCommands(REFS[2])])
    })
  })

  describe("commands", () => {
    test("installs the refs that are in neither installation into the user installation", async ({ expect, tmpDir }) => {
      const paths = await setup(tmpDir)
      const outDir = path.dirname(paths.options.artifactPath)
      let outDirExistedForBundle = false
      mockTools([], (_file, args) => {
        if (args[0] === "build-bundle") {
          outDirExistedForBundle = existsSync(outDir)
        }
      })

      await buildFlatpakBundle(paths.options)

      expect(commands(expect, paths.options)).toEqual(expectedCommands(paths, ref => ["flatpak", "install", "--user", "--no-deps", "--noninteractive", ref]))
      // an install can download gigabytes, so it is announced
      for (const ref of REFS) {
        expect(log.info).toHaveBeenCalledWith({ ref }, expect.stringContaining("installing flatpak ref"))
      }
      expect(log.error).not.toHaveBeenCalled()
      expect(outDirExistedForBundle).toBe(true)
    })

    for (const [name, installedIn] of [
      ["only in the user installation", ["--user"]],
      ["in both installations", ["--user", "--system"]],
    ] as const) {
      test(`updates the refs that are ${name} with --user`, async ({ expect, tmpDir }) => {
        const paths = await setup(tmpDir)
        mockTools([...installedIn])

        await buildFlatpakBundle(paths.options)

        expect(commands(expect, paths.options)).toEqual(expectedCommands(paths, ref => ["flatpak", "update", "--user", "--no-deps", "--noninteractive", ref]))
      })
    }

    test("updates the refs that are only installed system-wide without --user", async ({ expect, tmpDir }) => {
      const paths = await setup(tmpDir)
      mockTools(["--system"])

      await buildFlatpakBundle(paths.options)

      expect(commands(expect, paths.options)).toEqual(expectedCommands(paths, ref => ["flatpak", "update", "--no-deps", "--noninteractive", ref]))
    })

    test("uses the arch as given", async ({ expect, tmpDir }) => {
      const paths = await setup(tmpDir, { arch: "aarch64" })
      mockTools([])

      await buildFlatpakBundle(paths.options)

      const all = commands(expect, paths.options)
      // the refs carry it
      expect(all).toContainEqual(["flatpak", "info", "--show-commit", "--user", "runtime/org.freedesktop.Sdk/aarch64/24.08"])
      expect(all).toContainEqual(["flatpak", "install", "--user", "--no-deps", "--noninteractive", "app/org.electronjs.Electron2.BaseApp/aarch64/23.08"])
      // two flatpak-builder runs, build-export and build-bundle
      const archs = all.filter(it => it.includes("--arch")).map(it => it[it.indexOf("--arch") + 1])
      expect(archs).toEqual(Array(4).fill("aarch64"))
    })

    test("puts the additional arguments of each tool before its positional arguments", async ({ expect, tmpDir }) => {
      const paths = await setup(tmpDir, {
        flatpakBuilderArgs: ["--disable-rofiles-fuse", "--verbose"],
        buildExportArgs: ["--disable-sandbox"],
        buildBundleArgs: ["--runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo"],
      })
      const { options, appDir, repo, manifestFile } = paths
      mockTools(["--user"])

      await buildFlatpakBundle(options)

      const all = commands(expect, options)
      // both invocations get them
      expect(builderCommands(all)).toEqual([
        ["flatpak-builder", "--arch", "x86_64", "--build-only", "--disable-rofiles-fuse", "--verbose", appDir, manifestFile],
        ["flatpak-builder", "--arch", "x86_64", "--finish-only", "--disable-rofiles-fuse", "--verbose", appDir, manifestFile],
      ])
      expect(subcommand(all, "build-export")).toEqual(["flatpak", "build-export", "--arch", "x86_64", "--disable-sandbox", repo, appDir])
      expect(subcommand(all, "build-bundle")).toEqual([
        "flatpak",
        "build-bundle",
        "--arch",
        "x86_64",
        "--runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo",
        repo,
        options.artifactPath,
        "com.example.App",
      ])
      // and no other command does
      const others = all.filter(it => it[0] !== "flatpak-builder" && it[1] !== "build-export" && it[1] !== "build-bundle")
      expect(others.flat().filter(it => /rofiles|verbose|sandbox|runtime-repo/.test(it))).toEqual([])
    })

    test("appends the branch to build-export and build-bundle", async ({ expect, tmpDir }) => {
      const { options, appDir, repo } = await setup(tmpDir, { manifest: { ...manifest, branch: "stable" } })
      mockTools(["--user"])

      await buildFlatpakBundle(options)

      const all = commands(expect, options)
      expect(subcommand(all, "build-export")).toEqual(["flatpak", "build-export", "--arch", "x86_64", repo, appDir, "stable"])
      expect(subcommand(all, "build-bundle")).toEqual(["flatpak", "build-bundle", "--arch", "x86_64", repo, options.artifactPath, "com.example.App", "stable"])
      expect(builderCommands(all).flat()).not.toContain("stable")
    })
  })

  describe("manifest", () => {
    test("is written as given before the first flatpak-builder run", async ({ expect, tmpDir }) => {
      // the flatpak target sets both keys, to undefined unless they are configured
      const { options, manifestFile } = await setup(tmpDir, { manifest: { ...manifest, branch: undefined, modules: undefined } })
      let existedForBuild = false
      mockTools(["--user"], (_file, args) => {
        if (args.includes("--build-only")) {
          existedForBuild = existsSync(manifestFile)
        }
      })

      await buildFlatpakBundle(options)

      expect(existedForBuild).toBe(true)
      const written = JSON.parse(await readFile(manifestFile, "utf8"))
      expect(written).toEqual({
        id: "com.example.App",
        command: "electron-wrapper",
        runtime: "org.freedesktop.Platform",
        "runtime-version": "24.08",
        sdk: "org.freedesktop.Sdk",
        base: "org.electronjs.Electron2.BaseApp",
        "base-version": "23.08",
        "finish-args": ["--share=ipc", "--socket=x11"],
      })
      // branch and modules are undefined and must not appear at all
      expect(Object.keys(written)).toEqual(["id", "command", "runtime", "runtime-version", "sdk", "base", "base-version", "finish-args"])
    })

    test("keeps modules exactly as given", async ({ expect, tmpDir }) => {
      // a key transform would turn sha256 into sha-256 and x86_64 into x-86-64, and the camelCase key is the user's to get right
      const modules = [
        "shared-modules/libsecret.json",
        {
          name: "extra",
          buildsystem: "simple",
          buildCommands: ["install -D tool /app/bin/tool"],
          "build-options": { env: { MY_VAR: "1" }, arch: { x86_64: { cflags: "-O2" } } },
          sources: [{ type: "file", url: "https://example.com/tool", sha256: "abc123", "dest-filename": "tool" }],
        },
      ]
      const { options, manifestFile } = await setup(tmpDir, { manifest: { ...manifest, branch: "stable", modules } })
      mockTools(["--user"])

      await buildFlatpakBundle(options)

      const written = JSON.parse(await readFile(manifestFile, "utf8"))
      expect(written.modules).toEqual(modules)
      expect(written.branch).toBe("stable")
      expect(Object.keys(written)).toEqual(["id", "command", "runtime", "runtime-version", "sdk", "base", "base-version", "finish-args", "branch", "modules"])
    })

    test("gives flatpak-builder the whole environment when there are modules", async ({ expect, tmpDir }) => {
      const { options } = await setup(tmpDir, { manifest: { ...manifest, modules: [{ name: "extra", buildsystem: "simple", "build-commands": [] }] } })
      mockTools(["--user"])

      await buildFlatpakBundle(options)

      // commands() checks the environment of every command: process.env for these two, the filtered default for the rest
      expect(builderCommands(commands(expect, options))).toHaveLength(2)
    })
  })

  describe("files and symlinks", () => {
    test("copies the pairs in order into build/files between the two flatpak-builder runs", async ({ expect, tmpDir }) => {
      const sources = await tmpDir.createTempDir({ prefix: "sources" })
      const stageDir = await writeTree(path.join(sources, "stage"), {
        "bin/electron-wrapper": "#!/bin/sh\n",
        "share/applications/com.example.App.desktop": "[Desktop Entry]\n",
        "share/empty": null,
      })
      const appOutDir = await writeTree(path.join(sources, "app"), { app: "binary", "resources/app.asar": "asar" })
      const extraDir = await writeTree(path.join(sources, "extra"), { "bin/helper": "helper", "share/metainfo/com.example.App.metainfo.xml": "<component/>" })
      const extraFile = path.join(await writeTree(path.join(sources, "single"), { "libfoo.so": "foo" }), "libfoo.so")
      const override = path.join(await writeTree(path.join(sources, "override"), { "app.asar": "patched asar" }), "app.asar")

      const { options, appDir } = await setup(tmpDir)
      const files = path.join(appDir, "files")
      options.files = [
        // a directory merged into a destination that already exists
        [stageDir, "/"],
        [appOutDir, "/lib/com.example.App"],
        // a single file into a directory that an earlier pair created
        [extraFile, "/lib/com.example.App/lib/libfoo.so"],
        // a directory merged into "/", which already has bin/ and share/
        [extraDir, "/"],
        // the same destination as a file of an earlier pair: the later pair wins
        [override, "lib/com.example.App/resources/app.asar"],
        // a destination with a trailing separator is the directory to copy into
        [extraDir, `/opt/extra${path.sep}`],
        // a file that an earlier pair has placed, which is only there when the pairs are copied one after another
        [path.join(files, "bin", "helper"), "/bin/helper-again"],
      ]
      const copiedAt: Record<string, boolean> = {}
      mockTools(["--user"], async (_file, args) => {
        if (args.includes("--build-only")) {
          // flatpak-builder initialises the build directory with the files of the base app
          await writeTree(files, { "bin/zypak-wrapper": "zypak" })
        }
        for (const stage of ["--build-only", "--finish-only"]) {
          if (args.includes(stage)) {
            copiedAt[stage] = existsSync(path.join(files, "bin", "electron-wrapper"))
          }
        }
      })

      await buildFlatpakBundle(options)

      expect(copiedAt).toEqual({ "--build-only": false, "--finish-only": true })
      expect(await listTree(files)).toEqual([
        "bin/",
        "bin/electron-wrapper",
        "bin/helper",
        "bin/helper-again",
        "bin/zypak-wrapper",
        "lib/",
        "lib/com.example.App/",
        "lib/com.example.App/app",
        "lib/com.example.App/lib/",
        "lib/com.example.App/lib/libfoo.so",
        "lib/com.example.App/resources/",
        "lib/com.example.App/resources/app.asar",
        "opt/",
        "opt/extra/",
        "opt/extra/bin/",
        "opt/extra/bin/helper",
        "opt/extra/share/",
        "opt/extra/share/metainfo/",
        "opt/extra/share/metainfo/com.example.App.metainfo.xml",
        "share/",
        "share/applications/",
        "share/applications/com.example.App.desktop",
        "share/empty/",
        "share/metainfo/",
        "share/metainfo/com.example.App.metainfo.xml",
      ])
      expect(await readFile(path.join(files, "lib", "com.example.App", "resources", "app.asar"), "utf8")).toBe("patched asar")
      expect(await readFile(path.join(files, "lib", "com.example.App", "lib", "libfoo.so"), "utf8")).toBe("foo")
      // copied, not hard-linked: flatpak-builder modifies the build directory in place
      expect((await stat(path.join(files, "lib", "com.example.App", "app"))).nlink).toBe(1)
    })

    // creating a symlink needs a privilege on Windows, where files have no executable bit either
    test.ifNotWindows("keeps the relative symlinks and the file modes of a copied directory", async ({ expect, tmpDir }) => {
      const appOutDir = await writeTree(await tmpDir.createTempDir({ prefix: "app" }), { app: "binary", "lib/libfoo.so.1": "foo" })
      await chmod(path.join(appOutDir, "app"), 0o755)
      await chmod(path.join(appOutDir, "lib", "libfoo.so.1"), 0o644)
      await symlink("libfoo.so.1", path.join(appOutDir, "lib", "libfoo.so"))
      const { options, appDir } = await setup(tmpDir, { files: [[appOutDir, "/lib/com.example.App"]] })
      mockTools(["--user"])

      await buildFlatpakBundle(options)

      const copied = path.join(appDir, "files", "lib", "com.example.App")
      // not resolved against the source directory, which would put a path of the host into the bundle
      expect(await readlink(path.join(copied, "lib", "libfoo.so"))).toBe("libfoo.so.1")
      expect((await stat(path.join(copied, "app"))).mode & 0o777).toBe(0o755)
      expect((await stat(path.join(copied, "lib", "libfoo.so.1"))).mode & 0o777).toBe(0o644)
    })

    test("fails when a source does not exist", async ({ expect, tmpDir }) => {
      const { options } = await setup(tmpDir, { files: [[path.join(await tmpDir.createTempDir(), "missing"), "/lib/missing"]] })
      mockTools(["--user"])

      await expect(buildFlatpakBundle(options)).rejects.toThrow(/ENOENT/)
      expect(builderCommands(commands(expect, options))).toHaveLength(1)
    })

    // creating a symlink needs a privilege on Windows
    test.ifNotWindows("creates the symlinks with a target under /app between the two flatpak-builder runs", async ({ expect, tmpDir }) => {
      const { options, appDir } = await setup(tmpDir, {
        symlinks: [
          ["/lib/com.example.App/app", "/bin/app"],
          ["lib/com.example.App/resources", "share/links/resources"],
        ],
      })
      const links = [path.join(appDir, "files", "bin", "app"), path.join(appDir, "files", "share", "links", "resources")]
      const targetsAt: Record<string, Array<string | null>> = {}
      mockTools(["--user"], async (_file, args) => {
        for (const stage of ["--build-only", "--finish-only"]) {
          if (args.includes(stage)) {
            // read and not followed: the target is a path inside the sandbox, so it does not exist on the host and is never a host path
            targetsAt[stage] = await Promise.all(links.map(it => readlink(it).catch(() => null)))
          }
        }
      })

      await buildFlatpakBundle(options)

      expect(targetsAt).toEqual({ "--build-only": [null, null], "--finish-only": ["/app/lib/com.example.App/app", "/app/lib/com.example.App/resources"] })
    })

    // the trees that are copied into the app prefix are not checked: a link in one of them can lead out of it, and nothing may be
    // written through such a link. Creating a symlink needs a privilege on Windows
    describe.ifNotWindows("a symlink that leads out of the app prefix", () => {
      /** A build whose first files pair places `/lib/escape`, a link to a directory outside, and a pair or a link that goes through it. */
      async function escapeThrough(tmpDir: TmpDir, kind: "relative" | "absolute", overrides: Pick<FlatpakBundleOptions, "files" | "symlinks">) {
        const outside = await writeTree(await tmpDir.createTempDir({ prefix: "outside" }), { keep: "outside" })
        const paths = await setup(tmpDir)
        const libDir = path.join(paths.appDir, "files", "lib")
        const planted = await tmpDir.createTempDir({ prefix: "planted" })
        await symlink(kind === "relative" ? path.relative(libDir, outside) : outside, path.join(planted, "escape"))
        paths.options.files = [[planted, "/lib"], ...overrides.files]
        paths.options.symlinks = overrides.symlinks
        mockTools(["--user"])
        return { ...paths, outside }
      }

      async function expectRefused(expect: ExpectStatic, error: unknown, quoted: string, outside: string) {
        expect(error).toBeInstanceOf(InvalidConfigurationError)
        expect((error as Error).message).toContain(`${quoted} resolves outside the app prefix (/app in the sandbox) through a symlink, to "${await realpath(outside)}"`)
        expect((error as Error).message.endsWith(NEW_IN_V27)).toBe(true)
      }

      for (const kind of ["relative", "absolute"] as const) {
        test(`refuses a file copied through a link whose target is ${kind}`, async ({ expect, tmpDir }) => {
          const source = path.join(await writeTree(await tmpDir.createTempDir({ prefix: "src" }), { "evil.txt": "evil" }), "evil.txt")
          const { options, outside } = await escapeThrough(tmpDir, kind, { files: [[source, "/lib/escape/evil.txt"]], symlinks: [] })

          await expectRefused(expect, await rejection(buildFlatpakBundle(options)), 'flatpak.files destination "/lib/escape/evil.txt"', outside)

          expect(await listTree(outside)).toEqual(["keep"])
          expect(builderCommands(commands(expect, options))).toHaveLength(1)
        })

        test(`refuses a directory copied through a link whose target is ${kind}, before its directory is created`, async ({ expect, tmpDir }) => {
          const source = await writeTree(await tmpDir.createTempDir({ prefix: "src" }), { "bin/evil": "evil" })
          const { options, outside } = await escapeThrough(tmpDir, kind, { files: [[source, "/lib/escape/new/dir"]], symlinks: [] })

          await expectRefused(expect, await rejection(buildFlatpakBundle(options)), 'flatpak.files destination "/lib/escape/new/dir"', outside)

          expect(await listTree(outside)).toEqual(["keep"])
        })

        test(`refuses a directory merged onto a link whose target is ${kind}, which its items would go through`, async ({ expect, tmpDir }) => {
          const source = await writeTree(await tmpDir.createTempDir({ prefix: "src" }), { "escape/evil.txt": "evil", "other.txt": "other" })
          const { options, outside } = await escapeThrough(tmpDir, kind, { files: [[source, "/lib"]], symlinks: [] })

          const error = await rejection(buildFlatpakBundle(options))

          // cp refuses to copy a directory onto a link; were it to follow the link instead, the filter would refuse evil.txt
          expect(error instanceof InvalidConfigurationError || (error as NodeJS.ErrnoException).code === "ERR_FS_CP_DIR_TO_NON_DIR", String(error)).toBe(true)
          expect(await listTree(outside)).toEqual(["keep"])
        })

        test(`refuses a symlink created through a link whose target is ${kind}, before its directory is created`, async ({ expect, tmpDir }) => {
          const { options, outside } = await escapeThrough(tmpDir, kind, { files: [], symlinks: [["/bin/app", "/lib/escape/new/app"]] })

          await expectRefused(expect, await rejection(buildFlatpakBundle(options)), 'flatpak.symlinks link "/lib/escape/new/app"', outside)

          expect(await listTree(outside)).toEqual(["keep"])
          expect(builderCommands(commands(expect, options))).toHaveLength(1)
        })
      }

      test("keeps such a link as it is when nothing goes through it, and writes through a link that stays inside", async ({ expect, tmpDir }) => {
        const source = path.join(await writeTree(await tmpDir.createTempDir({ prefix: "src" }), { "extra.txt": "extra" }), "extra.txt")
        const app = await writeTree(await tmpDir.createTempDir({ prefix: "app" }), { "com.example.App/app": "binary" })
        await symlink("com.example.App", path.join(app, "current"))
        // resolved in the sandbox only, so it leads nowhere on the build machine
        await symlink("/app/lib/com.example.App/app", path.join(app, "sandbox-path"))
        const { options, appDir, outside } = await escapeThrough(tmpDir, "absolute", {
          files: [
            [app, "/lib"],
            [source, "/lib/current/extra.txt"],
          ],
          symlinks: [["/lib/com.example.App/app", "/lib/current/link"]],
        })

        await buildFlatpakBundle(options)

        const lib = path.join(appDir, "files", "lib")
        expect(await readlink(path.join(lib, "escape"))).toBe(outside)
        expect(await readlink(path.join(lib, "sandbox-path"))).toBe("/app/lib/com.example.App/app")
        expect(await readFile(path.join(lib, "com.example.App", "extra.txt"), "utf8")).toBe("extra")
        expect(await readlink(path.join(lib, "com.example.App", "link"))).toBe("/app/lib/com.example.App/app")
        expect(await listTree(outside)).toEqual(["keep"])
      })
    })
  })

  describe("failures", () => {
    for (const tool of ["flatpak", "flatpak-builder"]) {
      test(`fails before anything is installed when ${tool} cannot be run`, async ({ expect, tmpDir }) => {
        const { options, manifestFile } = await setup(tmpDir)
        mockTools([], file => {
          if (file === tool) {
            throw new ExecError(tool, "ENOENT" as any, `Exit code: ENOENT. spawn ${tool} ENOENT`, "", "ENOENT")
          }
        })

        const error = await rejection(buildFlatpakBundle(options))

        expect(error).toBeInstanceOf(InvalidConfigurationError)
        expect((error as Error).message).toContain(`cannot run ${tool}`)
        expect((error as Error).message).toContain("flatpak and flatpak-builder must be installed to build the flatpak target")
        // the reason is not in the error that is thrown
        expect(log.error).toHaveBeenCalledWith({ error: expect.stringContaining(`spawn ${tool} ENOENT`) }, `cannot run ${tool}`)
        expect(commands(expect, options)).toEqual(
          tool === "flatpak"
            ? [["flatpak", "--version"]]
            : [
                ["flatpak", "--version"],
                ["flatpak-builder", "--version"],
              ]
        )
        expect(existsSync(manifestFile)).toBe(false)
      })
    }

    const outsideThePrefix: Array<[string, Partial<FlatpakBundleOptions>, string]> = [
      // one level up is the build directory itself, where flatpak-builder keeps the metadata of the app
      ["a flatpak.files destination", { files: [["/does/not/matter", "/../metadata"]] }, 'flatpak.files destination "/../metadata"'],
      ["a flatpak.files destination that climbs further", { files: [["/does/not/matter", "../../../outside"]] }, 'flatpak.files destination "../../../outside"'],
      ["a flatpak.symlinks link", { symlinks: [["/lib/com.example.App/app", "/bin/../../outside"]] }, 'flatpak.symlinks link "/bin/../../outside"'],
    ]
    for (const [name, overrides, quoted] of outsideThePrefix) {
      test(`refuses ${name} outside the app prefix before anything runs`, async ({ expect, tmpDir }) => {
        const { options } = await setup(tmpDir, overrides)
        mockTools([])

        const error = await rejection(buildFlatpakBundle(options))

        expect(error).toBeInstanceOf(InvalidConfigurationError)
        expect((error as Error).message).toContain(`${quoted} is outside the app prefix`)
        expect((error as Error).message.endsWith(NEW_IN_V27)).toBe(true)
        expect(commands(expect, options)).toEqual([])
      })
    }

    test("accepts a destination that goes up but stays inside the app prefix", async ({ expect, tmpDir }) => {
      const source = path.join(await writeTree(await tmpDir.createTempDir({ prefix: "src" }), { "x.txt": "x" }), "x.txt")
      const { options, appDir } = await setup(tmpDir, { files: [[source, "/lib/../share/x.txt"]] })
      mockTools(["--user"])

      await buildFlatpakBundle(options)

      expect(await readFile(path.join(appDir, "files", "share", "x.txt"), "utf8")).toBe("x")
    })

    for (const [tool, output, version, minVersion] of [
      // compared as strings, 1.8.5 is the newer one
      ["flatpak", "Flatpak 1.8.5\n", "1.8.5", "1.12.4"],
      // the release just before the one that flatpak-builder 1.2.2 needs for its CVE-2022-21682 fix
      ["flatpak", "Flatpak 1.12.3\n", "1.12.3", "1.12.4"],
      ["flatpak-builder", "flatpak-builder 1.2.1\n", "1.2.1", "1.2.2"],
      // the format with a hyphen, to show that the version is read out of that one too
      ["flatpak-builder", "flatpak-builder-1.0.12\n", "1.0.12", "1.2.2"],
    ] as const) {
      test(`fails before anything is installed when ${tool} prints "${output.trim()}", which is older than ${minVersion}`, async ({ expect, tmpDir }) => {
        const { options, manifestFile } = await setup(tmpDir)
        mockTools([], undefined, { ...VERSION_OUTPUT, [tool]: output })

        const error = await rejection(buildFlatpakBundle(options))

        expect(error).toBeInstanceOf(InvalidConfigurationError)
        expect((error as Error).message).toContain(`${tool} ${version} is not supported - version ${minVersion} or newer is required`)
        expect((error as Error).message.endsWith(NEW_IN_V27)).toBe(true)
        expect(commands(expect, options).every(it => it[1] === "--version")).toBe(true)
        expect(existsSync(manifestFile)).toBe(false)
      })
    }

    for (const [name, versionOutput] of [
      ["the oldest supported versions", { flatpak: "Flatpak 1.12.4\n", "flatpak-builder": "flatpak-builder 1.2.2\n" }],
      // the stock versions of Ubuntu 22.04 and of Debian 12
      ["the tools of Ubuntu 22.04", { flatpak: "Flatpak 1.12.7\n", "flatpak-builder": "flatpak-builder 1.2.2\n" }],
      ["the tools of Debian 12", { flatpak: "Flatpak 1.14.10\n", "flatpak-builder": "flatpak-builder 1.2.3\n" }],
      // compared as strings, 1.10.0 is the older one
      ["a version with a minor above 9", { flatpak: "Flatpak 1.16.6\n", "flatpak-builder": "flatpak-builder 1.10.0\n" }],
    ] as const) {
      test(`accepts ${name}`, async ({ expect, tmpDir }) => {
        const { options } = await setup(tmpDir)
        mockTools(["--user"], undefined, versionOutput)

        await buildFlatpakBundle(options)

        expect(commands(expect, options).at(-1)?.[1]).toBe("build-bundle")
      })
    }

    test("hints at the user remote when flatpak install finds no remote ref, and rethrows", async ({ expect, tmpDir }) => {
      const { options } = await setup(tmpDir)
      const failure = failWith(
        [],
        args => args[0] === "install",
        args => `error: No remote refs found for ‘${args.at(-1)}’`
      )

      expect(await rejection(buildFlatpakBundle(options))).toBe(failure.error)

      expect(log.error).toHaveBeenCalledOnce()
      expect(log.error).toHaveBeenCalledWith(null, expect.stringContaining("flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo"))
      // nothing runs after the failed install
      expect(commands(expect, options).at(-1)).toEqual(["flatpak", "install", "--user", "--no-deps", "--noninteractive", REFS[0]])
    })

    for (const stage of ["--build-only", "--finish-only"]) {
      test(`hints at --disable-rofiles-fuse when flatpak-builder ${stage} cannot start rofiles-fuse, and rethrows`, async ({ expect, tmpDir }) => {
        const { options } = await setup(tmpDir)
        const failure = failWith(
          ["--user"],
          args => args.includes(stage),
          () => "fuse: device not found, try 'modprobe fuse' first\nError: Failure spawning rofiles-fuse, exit_status: 1024"
        )

        expect(await rejection(buildFlatpakBundle(options))).toBe(failure.error)

        expect(log.error).toHaveBeenCalledOnce()
        const hint = vi.mocked(log.error).mock.calls[0][1]
        expect(hint).toContain('flatpak.additionalArgs.flatpakBuilder to ["--disable-rofiles-fuse"]')
        expect(hint).toContain('flatpak.additionalArgs.buildExport set to ["--disable-sandbox"]')
        expect(hint).toContain(DOCS)
        expect(subcommand(commands(expect, options), "build-export")).toBeUndefined()
      })
    }

    // rofiles-fuse starts but cannot mount without fusermount3, and flatpak-builder then finds the app directory empty
    test("hints at fuse3 and --disable-rofiles-fuse when flatpak-builder --finish-only does not find the command, and rethrows", async ({ expect, tmpDir }) => {
      const { options } = await setup(tmpDir)
      const failure = failWith(
        ["--user"],
        args => args.includes("--finish-only"),
        () => "Cleaning up\nCommitting stage cleanup to cache\nError: Command 'electron-wrapper' not found"
      )

      expect(await rejection(buildFlatpakBundle(options))).toBe(failure.error)

      expect(log.error).toHaveBeenCalledOnce()
      const hint = vi.mocked(log.error).mock.calls[0][1]
      expect(hint).toContain("fusermount3 from the fuse3 package, or fusermount from the fuse package")
      expect(hint).toContain('flatpak.additionalArgs.flatpakBuilder to ["--disable-rofiles-fuse"]')
      expect(subcommand(commands(expect, options), "build-export")).toBeUndefined()
    })

    // flatpak-builder before 1.4 runs appstream-compose, which the freedesktop SDK 24.08 and newer do not ship
    test("hints at flatpak-builder 1.4 when appstream-compose is missing from the SDK, and rethrows", async ({ expect, tmpDir }) => {
      const { options } = await setup(tmpDir)
      const failure = failWith(
        ["--user"],
        args => args.includes("--finish-only"),
        () => "Running appstream-compose\nbwrap: execvp appstream-compose: No such file or directory\nError: ERROR: appstream-compose failed: Child process exited with code 1"
      )

      expect(await rejection(buildFlatpakBundle(options))).toBe(failure.error)

      expect(log.error).toHaveBeenCalledOnce()
      const hint = vi.mocked(log.error).mock.calls[0][1]
      expect(hint).toContain("flatpak-builder 1.4 and newer use appstreamcli")
      expect(hint).toContain("share/metainfo/com.example.App.metainfo.xml")
      expect(hint).toContain("https://www.electron.build/docs/flatpak#build-requirements")
    })

    test("hints at --disable-sandbox when flatpak build-export cannot start bubblewrap, and rethrows", async ({ expect, tmpDir }) => {
      const { options } = await setup(tmpDir, { flatpakBuilderArgs: ["--disable-rofiles-fuse"] })
      const failure = failWith(
        ["--user"],
        args => args[0] === "build-export",
        () => "error: icon.png is not a valid icon: bwrap: No permissions to create a new namespace, likely because the kernel does not allow non-privileged user namespaces."
      )

      expect(await rejection(buildFlatpakBundle(options))).toBe(failure.error)

      expect(log.error).toHaveBeenCalledOnce()
      const hint = vi.mocked(log.error).mock.calls[0][1]
      expect(hint).toContain('flatpak.additionalArgs.buildExport to ["--disable-sandbox"]')
      expect(hint).toContain(DOCS)
      expect(subcommand(commands(expect, options), "build-bundle")).toBeUndefined()
    })

    const invalidId = "error: Invalid id com.example: Names must contain at least 2 periods"
    for (const [name, installedIn, flatpakBuilderArgs, isFailing, output] of [
      // a remote is involved, but the ref is not what is missing
      ["flatpak install", [], [], (args: string[]) => args[0] === "install", "error: Unable to load summary from remote flathub: Could not connect: Network is unreachable"],
      ["flatpak update", ["--user"], [], (args: string[]) => args[0] === "update", invalidId],
      // exec's echo of the command line contains "rofiles-fuse" although FUSE is not the problem
      ["flatpak-builder --build-only with --disable-rofiles-fuse", ["--user"], ["--disable-rofiles-fuse"], (args: string[]) => args.includes("--build-only"), invalidId],
      // and so does the output of --verbose when rofiles-fuse did start
      [
        "flatpak-builder --finish-only with --verbose",
        ["--user"],
        ["--verbose"],
        (args: string[]) => args.includes("--finish-only"),
        `FB: Mounting read-only fs: rofiles-fuse\n${invalidId}`,
      ],
      // flatpak-builder before 1.4 prints this whenever the app has metainfo, also when appstream-compose succeeds on an SDK before 24.08
      ["flatpak-builder --finish-only after appstream-compose ran", ["--user"], [], (args: string[]) => args.includes("--finish-only"), `Running appstream-compose\n${invalidId}`],
      // exec's echo of the command line contains "bwrap" (see the arguments below) although the sandbox is not the problem
      ["flatpak build-export", ["--user"], [], (args: string[]) => args[0] === "build-export", invalidId],
      ["flatpak build-bundle", ["--user"], [], (args: string[]) => args[0] === "build-bundle", invalidId],
    ] as const) {
      test(`rethrows any other failure of ${name} without a hint`, async ({ expect, tmpDir }) => {
        const { options } = await setup(tmpDir, { flatpakBuilderArgs: [...flatpakBuilderArgs], buildExportArgs: ["--disable-sandbox", "--subject=built without bwrap"] })
        const failure = failWith([...installedIn], isFailing, () => output)

        expect(await rejection(buildFlatpakBundle(options))).toBe(failure.error)

        expect(log.error).not.toHaveBeenCalled()
      })
    }
  })

  describe("flatpak.modules and the flatpak-builder version", () => {
    const modules = [{ name: "tool", buildsystem: "meson", sources: [{ type: "dir", path: "tool" }] }]
    const isModulesWarning = ([fields]: ReadonlyArray<unknown>) => typeof fields === "object" && fields != null && "recommended" in fields

    beforeEach(() => {
      log.resetLimits("flatpak-builder-modules-version")
      vi.spyOn(log, "warn").mockImplementation(() => undefined)
    })

    // 1.4.2 is the flatpak-builder of Ubuntu 24.04, 1.4.3 the last release before the recommended one
    for (const builderVersion of ["1.4.2", "1.4.3"]) {
      test(`warns once when modules are built with flatpak-builder ${builderVersion}`, async ({ expect, tmpDir }) => {
        for (let i = 0; i < 2; i++) {
          const { options } = await setup(tmpDir, { manifest: { ...manifest, "runtime-version": "26.08", modules } })
          mockTools(["--user"], undefined, { ...VERSION_OUTPUT, "flatpak-builder": `flatpak-builder ${builderVersion}\n` })
          await buildFlatpakBundle(options)
        }

        const warnings = vi.mocked(log.warn).mock.calls.filter(isModulesWarning)
        // the second build, like the second arch of one build, does not repeat it
        expect(warnings).toHaveLength(1)
        expect(warnings[0][0]).toEqual({ flatpakBuilder: builderVersion, recommended: "1.4.4" })
        expect(warnings[0][1]).toContain("meson and cmake modules")
      })
    }

    for (const [name, builderVersion, overrides] of [
      ["modules with flatpak-builder 1.4.4", "flatpak-builder-1.4.4\n", { modules }],
      // compared as strings, 1.10.0 is the older one
      ["modules with flatpak-builder 1.10.0", "flatpak-builder 1.10.0\n", { modules }],
      // the recommendation is for the freedesktop SDK 24.08 and newer; the test manifest's runtime version is 24.08
      ["modules on the freedesktop SDK 23.08", "flatpak-builder 1.2.2\n", { modules, "runtime-version": "23.08" }],
      ["no modules with flatpak-builder 1.2.2", "flatpak-builder 1.2.2\n", {}],
    ] as const) {
      test(`does not warn for ${name}`, async ({ expect, tmpDir }) => {
        const { options } = await setup(tmpDir, { manifest: { ...manifest, ...overrides } })
        mockTools(["--user"], undefined, { ...VERSION_OUTPUT, "flatpak-builder": builderVersion })

        await buildFlatpakBundle(options)

        expect(vi.mocked(log.warn).mock.calls.filter(isModulesWarning)).toHaveLength(0)
      })
    }
  })
})
