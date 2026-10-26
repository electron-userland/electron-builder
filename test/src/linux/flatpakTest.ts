import { Configuration, FilesBuildOptions, FlatpakOptions } from "app-builder-lib"
import { FlatpakBundleOptions } from "app-builder-lib/src/targets/linux/flatpakBundle"
import { InvalidConfigurationError, log } from "builder-util"
import { Arch, Platform } from "electron-builder"
import { existsSync } from "fs"
import { readFile } from "fs/promises"
import * as path from "path"
import { downloadElectronArtifactZip } from "app-builder-lib/src/util/electronGet"
import { TmpDir } from "temp-file"
import { vi } from "vitest"
import type { ExpectStatic } from "vitest"
import { app, AssertPackOptions, EXTENDED_TIMEOUT, packageJson } from "../helpers/packTester"
import { ELECTRON_VERSION } from "../helpers/testConfig"

// No flatpak or flatpak-builder is needed: effectiveOptionComputed returns true, which skips the build, so these tests
// only validate the options, with the manifest in them, that the target hands to buildFlatpakBundle (and that the config
// schema accepts the options). The command lines built from them are covered by flatpakBundleTest.ts, real builds by
// flatpak.e2e.ts.
//
// Not on Windows: the target assembles its in-sandbox paths with the host path module.
const flatpakTarget = Platform.LINUX.createTarget("flatpak", Arch.x64)
const APP_ID = "org.electron_builder.testApp"
// without the notifications talk-name: the default base app 26.08 has a libnotify that uses the notification portal
const DEFAULT_FINISH_ARGS = ["--socket=wayland", "--socket=x11", "--share=ipc", "--device=dri", "--socket=pulseaudio", "--filesystem=xdg-download", "--share=network"]
const NOTIFICATIONS_TALK_NAME = "--talk-name=org.freedesktop.Notifications"

const isDefaultFinishArgsReport = ([fields]: ReadonlyArray<unknown>) =>
  typeof fields === "object" && fields != null && (fields as { reason?: unknown }).reason === "flatpak.finishArgs is not set"
const isNoSandboxWarning = ([, message]: ReadonlyArray<unknown>) => typeof message === "string" && message.startsWith("the flatpak starts the app with --no-sandbox")
const NO_SANDBOX_DOCS = "https://www.electron.build/docs/flatpak#executable-args"
const isFlatpakIdWarning = ([fields]: ReadonlyArray<unknown>) => typeof fields === "object" && fields != null && "flatpakId" in fields
const FLATPAK_ID_DOCS = "https://www.electron.build/docs/flatpak#application-id"
const BUILD_CHANGES_DOCS = "https://www.electron.build/docs/migration/v27-build-changes"
const RUNTIME_CHANGES_DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes"
const messageStartsWith =
  (prefix: string) =>
  ([, message]: ReadonlyArray<unknown>) =>
    typeof message === "string" && message.startsWith(prefix)
const isDefaultRuntimeVersionWarning = messageStartsWith("electron-builder v27 changed the default flatpak.runtimeVersion and flatpak.baseVersion")
const isOzoneFlagWarning = messageStartsWith("electron-builder v27 no longer adds --enable-features=UseOzonePlatform")
const isFlatpakBundlerDebugWarning = messageStartsWith("electron-builder v27 no longer uses @malept/flatpak-bundler")

interface Computed {
  options: FlatpakBundleOptions
  tempDirExisted: boolean
}

async function computeOptions(expect: ExpectStatic, flatpak: FlatpakOptions): Promise<Computed> {
  return computeOptionsForConfig(expect, { flatpak })
}

async function computeOptionsForConfig(expect: ExpectStatic, config: Configuration): Promise<Computed> {
  const calls: Computed[] = []
  await app(expect, {
    targets: flatpakTarget,
    config,
    effectiveOptionComputed: async (options: FlatpakBundleOptions) => {
      // checked here because the working directory is removed when the build finishes
      calls.push({ options, tempDirExisted: existsSync(options.tempDir) })
      return Promise.resolve(true)
    },
  })
  expect(calls).toHaveLength(1)
  return calls[0]
}

// builds the test app's flatpak up to the bundle, returning the bin/electron-wrapper script of each arch and the warnings logged
async function buildFlatpak(
  expect: ExpectStatic,
  config: Configuration,
  targets = flatpakTarget,
  checkOptions: AssertPackOptions = {}
): Promise<{ wrappers: string[]; warnings: unknown[][] }> {
  const warn = vi.spyOn(log, "warn")
  try {
    const wrappers: string[] = []
    await app(
      expect,
      {
        targets,
        config,
        effectiveOptionComputed: async (options: FlatpakBundleOptions) => {
          // read here because the stage directory is removed when the build finishes
          wrappers.push(await readFile(path.join(options.files[0][0], "bin", "electron-wrapper"), "utf8"))
          return true
        },
      },
      checkOptions
    )
    return { wrappers, warnings: warn.mock.calls }
  } finally {
    warn.mockRestore()
  }
}

// builds the test app's flatpak up to the bundle, returning the share/mime/packages file of the stage directory (null when there is
// none); read during the build because the stage directory is removed when the build finishes
async function buildMimeTypeFile(expect: ExpectStatic, config: Configuration): Promise<string | null> {
  const files: (string | null)[] = []
  await app(expect, {
    targets: flatpakTarget,
    config,
    effectiveOptionComputed: async (options: FlatpakBundleOptions) => {
      const file = path.join(options.files[0][0], "share", "mime", "packages", `${APP_ID}.xml`)
      files.push(existsSync(file) ? await readFile(file, "utf8") : null)
      return true
    },
  })
  expect(files).toHaveLength(1)
  return files[0]
}

describe.heavy.ifNotWindows("flatpak", { concurrent: false, timeout: EXTENDED_TIMEOUT }, () => {
  test("default options", async ({ expect }) => {
    const { options, tempDirExisted } = await computeOptions(expect, {})

    const outDir = path.dirname(options.artifactPath)
    expect(options).toEqual({
      // in the key names of flatpak-builder, as it is written to the manifest file
      manifest: {
        id: APP_ID,
        command: "electron-wrapper",
        runtime: "org.freedesktop.Platform",
        "runtime-version": "26.08",
        sdk: "org.freedesktop.Sdk",
        base: "org.electronjs.Electron2.BaseApp",
        "base-version": "26.08",
        "finish-args": DEFAULT_FINISH_ARGS,
        branch: undefined,
        modules: undefined,
      },
      arch: "x86_64",
      artifactPath: path.join(outDir, "Test App ßW-1.1.0-x86_64.flatpak"),
      tempDir: expect.any(String),
      files: [
        [path.join(outDir, "__flatpak-x86_64"), "/"],
        [path.join(outDir, "linux-unpacked"), `/lib/${APP_ID}`],
      ],
      symlinks: [[`/lib/${APP_ID}/testapp`, "/bin/testapp"]],
      installOrUpdateRefs: ["runtime", "sdk", "base"],
      // nothing is passed to the tools unless the user asks for it
      flatpakBuilderArgs: [],
      buildExportArgs: [],
      buildBundleArgs: [],
    })
    expect(path.isAbsolute(options.artifactPath)).toBe(true)
    // a scratch directory of its own, outside of the output and stage directories
    expect(tempDirExisted).toBe(true)
    expect(path.relative(outDir, options.tempDir).startsWith("..")).toBe(true)
  })

  // base apps before 23.08 ship a libnotify older than 0.8, which talks to the notification daemon instead of the portal
  test("default finishArgs have the notifications talk-name for a base app before 23.08", async ({ expect }) => {
    const { options } = await computeOptions(expect, { baseVersion: "22.08" })
    expect(options.manifest["finish-args"]).toEqual([...DEFAULT_FINISH_ARGS, NOTIFICATIONS_TALK_NAME])
  })

  test("default finishArgs have no notifications talk-name for base app 23.08", async ({ expect }) => {
    const { options } = await computeOptions(expect, { baseVersion: "23.08" })
    expect(options.manifest["finish-args"]).toEqual(DEFAULT_FINISH_ARGS)
  })

  test("default finishArgs have no notifications talk-name for a custom base app", async ({ expect }) => {
    const { options } = await computeOptions(expect, { base: "org.example.BaseApp", baseVersion: "22.08" })
    expect(options.manifest["finish-args"]).toEqual(DEFAULT_FINISH_ARGS)
  })

  test("finishArgs that are set get no notifications talk-name", async ({ expect }) => {
    const { options } = await computeOptions(expect, { baseVersion: "22.08", finishArgs: ["--share=ipc"] })
    expect(options.manifest["finish-args"]).toEqual(["--share=ipc"])
  })

  // once per build, not once per arch: the target instance is shared by all archs
  test("the default finishArgs are reported once per build as a warning", async ({ expect }) => {
    const { wrappers, warnings } = await buildFlatpak(expect, { flatpak: {} }, Platform.LINUX.createTarget("flatpak", Arch.x64, Arch.arm64))
    expect(wrappers).toHaveLength(2)
    const reported = warnings.filter(isDefaultFinishArgsReport)
    expect(reported).toHaveLength(1)
    expect(reported[0][0]).toEqual({ reason: "flatpak.finishArgs is not set", docs: "https://www.electron.build/docs/flatpak#finish-args-permissions" })
    expect(reported[0][1]).toBe(
      "electron-builder v27 narrowed the default flatpak.finishArgs: --filesystem=home -> --filesystem=xdg-download, and --talk-name=org.freedesktop.Notifications only for the base app org.electronjs.Electron2.BaseApp before 23.08. " +
        "The app can no longer reach the home directory outside Downloads. Set flatpak.finishArgs to grant more (the v26 list is in the migration guide). " +
        `See ${RUNTIME_CHANGES_DOCS}#flatpak-default-permissions`
    )
  })

  test("finishArgs that are set are not reported", async ({ expect }) => {
    const { warnings } = await buildFlatpak(expect, { flatpak: { finishArgs: ["--share=ipc"] } })
    expect(warnings.filter(isDefaultFinishArgsReport)).toHaveLength(0)
  })

  // once per build, not once per arch
  test("the default runtimeVersion and baseVersion are reported once per build", async ({ expect }) => {
    const { wrappers, warnings } = await buildFlatpak(expect, { flatpak: {} }, Platform.LINUX.createTarget("flatpak", Arch.x64, Arch.arm64))
    expect(wrappers).toHaveLength(2)
    const reported = warnings.filter(isDefaultRuntimeVersionWarning)
    expect(reported).toHaveLength(1)
    expect(reported[0][0]).toEqual({ runtimeVersion: "26.08", baseVersion: "26.08" })
    expect(reported[0][1]).toBe(
      "electron-builder v27 changed the default flatpak.runtimeVersion and flatpak.baseVersion from 20.08 to 26.08: each of them that is not set is now 26.08, and the 26.08 runtime, SDK and base app are installed if they are missing. " +
        `Set both to "20.08" to keep the previous runtime, or both to the version to build for. See ${BUILD_CHANGES_DOCS}#flatpak-tooling-requirements`
    )
  })

  test("a runtimeVersion without a baseVersion is reported", async ({ expect }) => {
    const { warnings } = await buildFlatpak(expect, { flatpak: { runtimeVersion: "20.08" } })
    expect(warnings.filter(isDefaultRuntimeVersionWarning).map(([fields]) => fields)).toEqual([{ runtimeVersion: "20.08", baseVersion: "26.08" }])
  })

  test("runtimeVersion and baseVersion that are both set are not reported", async ({ expect }) => {
    const { warnings } = await buildFlatpak(expect, { flatpak: { runtimeVersion: "20.08", baseVersion: "20.08" } })
    expect(warnings.filter(isDefaultRuntimeVersionWarning)).toHaveLength(0)
  })

  // once per build, not once per arch; the flag is reported, not removed
  test("--no-sandbox from linux.executableArgs is reported once per build and kept", async ({ expect }) => {
    const { wrappers, warnings } = await buildFlatpak(
      expect,
      { linux: { executableArgs: ["--no-sandbox"] }, flatpak: {} },
      Platform.LINUX.createTarget("flatpak", Arch.x64, Arch.arm64)
    )
    expect(wrappers).toHaveLength(2)
    for (const wrapper of wrappers) {
      expect(wrapper).toContain(`zypak-wrapper "testapp" '--no-sandbox' "$@"`)
    }
    const reported = warnings.filter(isNoSandboxWarning)
    expect(reported).toHaveLength(1)
    expect(reported[0][0]).toEqual({ source: "linux.executableArgs", docs: NO_SANDBOX_DOCS })
  })

  test("--no-sandbox from flatpak.executableArgs is reported with that source", async ({ expect }) => {
    const { warnings } = await buildFlatpak(expect, { flatpak: { executableArgs: ["--no-sandbox"] } })
    expect(warnings.filter(isNoSandboxWarning).map(([fields]) => fields)).toEqual([{ source: "flatpak.executableArgs", docs: NO_SANDBOX_DOCS }])
  })

  // deepAssign joins the two lists: an empty flatpak list adds nothing and removes nothing
  test("an empty flatpak.executableArgs keeps --no-sandbox from linux.executableArgs", async ({ expect }) => {
    const { wrappers, warnings } = await buildFlatpak(expect, { linux: { executableArgs: ["--no-sandbox"] }, flatpak: { executableArgs: [] } })
    expect(wrappers[0]).toContain("'--no-sandbox'")
    expect(warnings.filter(isNoSandboxWarning).map(([fields]) => fields)).toEqual([{ source: "linux.executableArgs", docs: NO_SANDBOX_DOCS }])
  })

  test("flatpak.executableArgs set to null leaves linux.executableArgs out of the flatpak", async ({ expect }) => {
    const { wrappers, warnings } = await buildFlatpak(expect, { linux: { executableArgs: ["--no-sandbox"] }, flatpak: { executableArgs: null } })
    expect(wrappers[0]).toContain(`exec zypak-wrapper "testapp" "$@"`)
    expect(wrappers[0]).not.toContain("--no-sandbox")
    expect(warnings.filter(isNoSandboxWarning)).toHaveLength(0)
  })

  // the test app uses Electron 38 or later, which picks Wayland by itself; once per build, not once per arch
  test("useWaylandFlags adds no flags on Electron 38 or later and says so once per build", async ({ expect }) => {
    const info = vi.spyOn(log, "info")
    try {
      const { wrappers } = await buildFlatpak(expect, { flatpak: { useWaylandFlags: true } }, Platform.LINUX.createTarget("flatpak", Arch.x64, Arch.arm64))
      expect(wrappers).toHaveLength(2)
      for (const wrapper of wrappers) {
        expect(wrapper).not.toContain("ozone")
        expect(wrapper).not.toContain("XDG_SESSION_TYPE")
      }
      const reported = info.mock.calls.filter(([, message]) => typeof message === "string" && message.startsWith("flatpak.useWaylandFlags has no effect"))
      expect(reported).toHaveLength(1)
      expect(reported[0][0]).toEqual({ electronVersion: expect.any(String), docs: "https://www.electron.build/docs/flatpak#wayland-support" })
    } finally {
      info.mockRestore()
    }
  })

  // once per build, not once per arch. The Electron of the other tests is packaged with the version set to 37: only the version
  // decides the flags
  test("useWaylandFlags on Electron 16 to 37 reports once per build that it no longer adds UseOzonePlatform", async ({ expect }) => {
    const { wrappers, warnings } = await buildFlatpak(
      expect,
      {
        electronVersion: "37.0.0",
        electronDist: ({ platformName, arch }) => downloadElectronArtifactZip({ artifactName: "electron", platformName, arch, version: ELECTRON_VERSION }),
        flatpak: { useWaylandFlags: true },
      },
      Platform.LINUX.createTarget("flatpak", Arch.x64, Arch.arm64)
    )
    expect(wrappers).toHaveLength(2)
    for (const wrapper of wrappers) {
      expect(wrapper).toContain("'--ozone-platform=wayland'")
      expect(wrapper).not.toContain("UseOzonePlatform")
    }
    const reported = warnings.filter(isOzoneFlagWarning)
    expect(reported).toHaveLength(1)
    expect(reported[0][0]).toEqual({ electronVersion: "37.0.0", docs: "https://www.electron.build/docs/flatpak#wayland-support" })
    expect(reported[0][1]).toBe(
      "electron-builder v27 no longer adds --enable-features=UseOzonePlatform with flatpak.useWaylandFlags for Electron 16 and later, where Ozone is on by default: in a Wayland session the wrapper now passes only --ozone-platform=wayland. " +
        `If the app needs the flag, add it to flatpak.executableArgs. See ${RUNTIME_CHANGES_DOCS}#flatpak-wayland-flags`
    )
  })

  // once per process: the variable is the same for every build
  test("DEBUG=@malept/flatpak-bundler is reported once per process", async ({ expect }) => {
    vi.stubEnv("DEBUG", "@malept/flatpak-bundler")
    log.resetLimits("flatpak-bundler-debug")
    try {
      const first = await buildFlatpak(expect, { flatpak: {} }, Platform.LINUX.createTarget("flatpak", Arch.x64, Arch.arm64))
      const reported = first.warnings.filter(isFlatpakBundlerDebugWarning)
      expect(reported).toHaveLength(1)
      expect(reported[0][0]).toEqual({ envVar: "DEBUG" })
      expect(reported[0][1]).toBe(
        "electron-builder v27 no longer uses @malept/flatpak-bundler, so DEBUG=@malept/flatpak-bundler has no effect: a failed flatpak or flatpak-builder command prints its own output in the build error. " +
          `Set DEBUG=electron-builder to log every command that is run. See ${BUILD_CHANGES_DOCS}#flatpak-tooling-requirements`
      )
      const second = await buildFlatpak(expect, { flatpak: {} })
      expect(second.warnings.filter(isFlatpakBundlerDebugWarning)).toHaveLength(0)
    } finally {
      vi.unstubAllEnvs()
      log.resetLimits("flatpak-bundler-debug")
    }
  })

  test("a DEBUG without @malept/flatpak-bundler is not reported", async ({ expect }) => {
    vi.stubEnv("DEBUG", "some-other-package")
    log.resetLimits("flatpak-bundler-debug")
    try {
      const { warnings } = await buildFlatpak(expect, { flatpak: {} })
      expect(warnings.filter(isFlatpakBundlerDebugWarning)).toHaveLength(0)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  // once per build, not once per arch
  test("a flatpak id derived from the package name is reported once per build", async ({ expect }) => {
    const { wrappers, warnings } = await buildFlatpak(expect, { flatpak: {} }, Platform.LINUX.createTarget("flatpak", Arch.x64, Arch.arm64), {
      projectDirCreated: packageJson(data => {
        delete data.build.appId
      }),
    })
    expect(wrappers).toHaveLength(2)
    const reported = warnings.filter(isFlatpakIdWarning)
    expect(reported).toHaveLength(1)
    expect(reported[0][0]).toEqual({ flatpakId: "com.electron.testapp", docs: FLATPAK_ID_DOCS })
    expect(reported[0][1]).toMatch(/^appId is not set, so the flatpak id is derived from the package name\. .*~\/\.var\/app\/com\.electron\.testapp/)
  })

  // compared with the id in its flatpak form, with _ for -, which names the desktop entry
  test("a desktopName that is not the flatpak id is reported", async ({ expect }) => {
    const { warnings } = await buildFlatpak(expect, { flatpak: {} }, flatpakTarget, {
      projectDirCreated: packageJson(data => {
        data.desktopName = "org.electron-builder.testApp.desktop"
      }),
    })
    const reported = warnings.filter(isFlatpakIdWarning)
    expect(reported).toHaveLength(1)
    expect(reported[0][0]).toEqual({ flatpakId: APP_ID, desktopName: "org.electron-builder.testApp", docs: FLATPAK_ID_DOCS })
    expect(reported[0][1]).toMatch(/^desktopName must be "org\.electron_builder\.testApp\.desktop": /)
  })

  test("a derived flatpak id and a desktopName that is not it are reported in one warning", async ({ expect }) => {
    const { warnings } = await buildFlatpak(expect, { flatpak: {} }, flatpakTarget, {
      projectDirCreated: packageJson(data => {
        delete data.build.appId
        data.desktopName = "com.example.App.desktop"
      }),
    })
    const reported = warnings.filter(isFlatpakIdWarning)
    expect(reported).toHaveLength(1)
    expect(reported[0][0]).toEqual({ flatpakId: "com.electron.testapp", desktopName: "com.example.App", docs: FLATPAK_ID_DOCS })
    expect(reported[0][1]).toMatch(/^appId is not set, .*\. desktopName must be "com\.electron\.testapp\.desktop": /)
  })

  test("an appId with a desktopName that is the flatpak id is not reported", async ({ expect }) => {
    const { warnings } = await buildFlatpak(expect, { flatpak: {} }, flatpakTarget, {
      projectDirCreated: packageJson(data => {
        data.desktopName = `${APP_ID}.desktop`
      }),
    })
    expect(warnings.filter(isFlatpakIdWarning)).toHaveLength(0)
  })

  // flatpak-builder rejects these too, but only once the runtime, the SDK and the base app are installed
  test.for<[string, (data: any) => void, RegExp]>([
    [
      "two elements",
      data => {
        data.build.appId = "com.myapp"
      },
      /^the flatpak id "com\.myapp" is not valid: it needs at least three elements separated by periods/,
    ],
    [
      "an element that starts with a digit",
      data => {
        delete data.build.appId
        data.name = "3d-viewer"
      },
      /^the flatpak id "com\.electron\.3d_viewer" is not valid: its element "3d_viewer" starts with a digit/,
    ],
    [
      "an empty element",
      data => {
        data.build.appId = "com..example.app"
      },
      /^the flatpak id "com\.\.example\.app" is not valid: it has an empty element/,
    ],
    [
      "more than 255 characters",
      data => {
        data.build.appId = `com.example.${"a".repeat(244)}`
      },
      /^the flatpak id "com\.example\.a+" is not valid: it has 256 characters, and at most 255 are allowed/,
    ],
  ])("an id with %s fails the build before anything is built", async ([, editPackageJson, message], { expect }) => {
    let computed = false
    const build = app(
      expect,
      {
        targets: flatpakTarget,
        config: { flatpak: {} },
        effectiveOptionComputed: async () => {
          computed = true
          return true
        },
      },
      { projectDirCreated: packageJson(editPackageJson) }
    )
    await expect(build).rejects.toThrow(message)
    await expect(build).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect(computed).toBe(false)
  })

  // build() removes the stage directory once it is prepared; this fails while it is being prepared, in the desktop entry
  // the project is in the test's own tmpDir, which the build does not remove when it fails
  test("the stage directory is removed when preparing it fails", async ({ expect, tmpDir }) => {
    let projectDir = ""
    const build = app(
      expect,
      { targets: flatpakTarget, config: { linux: { desktop: { entry: { "Foo=Bar": "x" } } }, flatpak: {} } },
      {
        tmpDir,
        projectDirCreated: async dir => {
          projectDir = dir
        },
      }
    )
    await expect(build).rejects.toThrow(/Invalid key "Foo=Bar"/)
    const outDir = path.join(projectDir, "dist")
    // the app was packaged into the output directory, next to where the stage directory was
    expect(existsSync(path.join(outDir, "linux-unpacked"))).toBe(true)
    expect(existsSync(path.join(outDir, "__flatpak-x86_64"))).toBe(false)
  })

  // the scratch directory of an arch holds the app directory and the repository, each a copy of the app: it is removed when the
  // bundle step ends, not when the temporary directories of the whole build are (which happens on success and on failure alike,
  // so it is checked at the time any of them is cleaned up)
  test.for<[string, boolean]>([
    ["a build that succeeds", false],
    ["a build that fails", true],
  ])("the scratch directory is removed after the bundle step of %s", async ([, fails], { expect, tmpDir }) => {
    const tempDirs: string[] = []
    const existedAtCleanup: boolean[] = []
    const cleanup = TmpDir.prototype.cleanup
    const spy = vi.spyOn(TmpDir.prototype, "cleanup").mockImplementation(function (this: TmpDir) {
      existedAtCleanup.push(...tempDirs.map(it => existsSync(it)))
      return cleanup.call(this)
    })
    try {
      const build = app(
        expect,
        {
          targets: flatpakTarget,
          config: { flatpak: {} },
          effectiveOptionComputed: async (options: FlatpakBundleOptions) => {
            tempDirs.push(options.tempDir)
            expect(existsSync(options.tempDir)).toBe(true)
            if (fails) {
              throw new Error("the bundle failed")
            }
            return true
          },
        },
        { tmpDir }
      )
      if (fails) {
        await expect(build).rejects.toThrow("the bundle failed")
      } else {
        await build
      }
    } finally {
      spy.mockRestore()
    }
    expect(tempDirs).toHaveLength(1)
    expect(existsSync(tempDirs[0])).toBe(false)
    expect(existedAtCleanup.length).toBeGreaterThan(0)
    expect(existedAtCleanup).not.toContain(true)
  })

  test("the custom MIME types of fileAssociations are declared in share/mime/packages", async ({ expect }) => {
    const xml = await buildMimeTypeFile(expect, {
      fileAssociations: [
        { ext: ["foo", "foo2"], name: "Foo", mimeType: "application/x-foo" },
        { ext: "bar", name: "Bar" },
        { ext: "baz", name: "Baz", mimeType: "application/x-baz&qux" },
      ],
      flatpak: {},
    })
    expect(xml).toBe(
      [
        '<?xml version="1.0"?>',
        '<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">',
        '<mime-type type="application/x-foo">',
        "  <comment>Test App ßW document</comment>",
        '  <glob pattern="*.foo"/>',
        '  <glob pattern="*.foo2"/>',
        '  <generic-icon name="x-office-document"/>',
        "</mime-type>",
        '<mime-type type="application/x-baz&amp;qux">',
        "  <comment>Test App ßW document</comment>",
        '  <glob pattern="*.baz"/>',
        '  <generic-icon name="x-office-document"/>',
        "</mime-type>",
        "</mime-info>",
      ].join("\n")
    )
  })

  test("no MIME type file is written without a custom MIME type", async ({ expect }) => {
    expect(await buildMimeTypeFile(expect, { fileAssociations: [{ ext: "bar", name: "Bar" }], flatpak: {} })).toBeNull()
  })

  test.for<[FlatpakOptions["installOrUpdateRefs"], string[]]>([
    ["all", ["runtime", "sdk", "base"]],
    [null, ["runtime", "sdk", "base"]],
    [[], []],
    [
      ["sdk", "base"],
      ["sdk", "base"],
    ],
  ])("installOrUpdateRefs %j hands %j to the build", async ([installOrUpdateRefs, expected], { expect }) => {
    const { options } = await computeOptions(expect, { installOrUpdateRefs })
    expect(options.installOrUpdateRefs).toEqual(expected)
  })

  test("installOrUpdateRefs with an unknown ref is rejected by the configuration schema", async ({ expect }) => {
    await expect(computeOptions(expect, { installOrUpdateRefs: ["app"] as any })).rejects.toThrow(/installOrUpdateRefs/)
  })

  test("additional arguments for the flatpak tools", async ({ expect }) => {
    const { options } = await computeOptions(expect, {
      additionalArgs: {
        flatpakBuilder: ["--disable-rofiles-fuse"],
        buildExport: ["--disable-sandbox"],
        buildBundle: ["--runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo"],
      },
    })

    expect(options.flatpakBuilderArgs).toEqual(["--disable-rofiles-fuse"])
    expect(options.buildExportArgs).toEqual(["--disable-sandbox"])
    expect(options.buildBundleArgs).toEqual(["--runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo"])
  })

  // a tool that is left out gets nothing
  test("additional arguments for one of the flatpak tools", async ({ expect }) => {
    const { options } = await computeOptions(expect, { additionalArgs: { buildExport: ["--disable-sandbox"], buildBundle: null } })

    expect(options.flatpakBuilderArgs).toEqual([])
    expect(options.buildExportArgs).toEqual(["--disable-sandbox"])
    expect(options.buildBundleArgs).toEqual([])
  })

  test("additionalArgs with a key that is not a tool is rejected by the configuration schema", async ({ expect }) => {
    await expect(computeOptions(expect, { additionalArgs: { export: ["--disable-sandbox"] } as any })).rejects.toThrow(/additionalArgs/)
  })

  // Regression tests: `linux.files` (a string[] of glob patterns, used by most real-world Linux configs) used to get merged into
  // FlatpakOptions.files (a [string, string][] of copy tuples) by getOptionsForTarget's deepAssign, which concatenates arrays
  // instead of replacing them. The copy step of buildFlatpakBundle then destructured each glob string as [src, dest], producing a
  // bogus path and crashing the build with ENOENT. `linux.files` may also be a single glob string or a single FileSet object;
  // the merged target options then hold a string or an object under `files`, which is not filterable, so FlatpakTarget threw.
  // FlatpakTarget computes the copy pairs before the bundle step, so these check the pairs it hands to buildFlatpakBundle.
  test.for<[string, FilesBuildOptions["files"]]>([
    ["linux.files does not corrupt the flatpak files option", ["**/*", "!**/*.ts"]],
    ["single-string linux.files does not throw in FlatpakTarget", "**/*"],
    ["single FileSet linux.files does not throw in FlatpakTarget", { from: ".", filter: ["**/*"] }],
  ])("%s", async ([, files], { expect }) => {
    const { options } = await computeOptionsForConfig(expect, { linux: { fileOptions: { files } } })
    const outDir = path.dirname(options.artifactPath)
    expect(options.files).toEqual([
      [path.join(outDir, "__flatpak-x86_64"), "/"],
      [path.join(outDir, "linux-unpacked"), `/lib/${APP_ID}`],
    ])
  })

  test("linux.files leaves the flatpak files pairs as they are", async ({ expect }) => {
    const { options } = await computeOptionsForConfig(expect, {
      linux: { fileOptions: { files: ["**/*", "!**/*.ts"] } },
      flatpak: { files: [["build/extra.txt", "/share/extra.txt"]] },
    })
    expect(options.files.slice(2)).toEqual([["build/extra.txt", "/share/extra.txt"]])
  })

  test("custom manifest options, files and symlinks", async ({ expect }) => {
    const modules = [{ name: "extra", buildsystem: "simple", buildCommands: ["install -D tool /app/bin/tool"], sources: [{ type: "file", path: "tool", sha256: "abc123" }] }]
    const { options } = await computeOptions(expect, {
      runtime: "org.gnome.Platform",
      runtimeVersion: "47",
      sdk: "org.gnome.Sdk",
      base: "org.example.BaseApp",
      baseVersion: "24.08",
      branch: "stable",
      finishArgs: ["--share=ipc"],
      modules,
      files: [["build/extra.txt", "/share/extra.txt"]],
      symlinks: [["/share/extra.txt", "/bin/extra"]],
      additionalArgs: null,
    })

    expect(options.manifest).toEqual({
      id: APP_ID,
      command: "electron-wrapper",
      runtime: "org.gnome.Platform",
      "runtime-version": "47",
      sdk: "org.gnome.Sdk",
      base: "org.example.BaseApp",
      "base-version": "24.08",
      "finish-args": ["--share=ipc"],
      branch: "stable",
      modules,
    })
    // user pairs come after the built-in ones, so that they can add to or override what the target stages
    expect(options.files.slice(2)).toEqual([["build/extra.txt", "/share/extra.txt"]])
    expect(options.symlinks).toEqual([
      [`/lib/${APP_ID}/testapp`, "/bin/testapp"],
      ["/share/extra.txt", "/bin/extra"],
    ])
    expect(options.flatpakBuilderArgs).toEqual([])
    expect(options.buildExportArgs).toEqual([])
    expect(options.buildBundleArgs).toEqual([])
  })
})
