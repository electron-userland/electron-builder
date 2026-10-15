import {
  ALL_PLATFORM_KEYS,
  checkLegacyConfiguration,
  doMergeConfigs,
  FILE_OPTIONS_ANCHOR,
  getConfig,
  getFileMatchers,
  getNodeModuleFileMatcher,
  validateConfiguration,
} from "app-builder-lib/internal"
import { DebugLogger, InvalidConfigurationError, log } from "builder-util"
import { readFileSync } from "fs"
import { mkdir, writeFile } from "fs/promises"
import * as path from "path"
import { afterEach, beforeEach, describe, MockInstance, test, vi } from "vitest"

const FILE_OPTIONS_URL = "https://www.electron.build/docs/migration/v27-breaking-changes#file-options-fileoptions"
const noMacro = (s: string) => s

let warn: MockInstance<typeof log.warn>

beforeEach(() => {
  log.resetLimits()
  warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  warn.mockRestore()
  log.resetLimits()
})

// the warnings under test are logged as a single message string
function warnings(): string[] {
  return warn.mock.calls.map(call => call[0] as string)
}

describe("flat files / extraResources / extraFiles are normalized into fileOptions", () => {
  test("at the configuration root", ({ expect }) => {
    const result = doMergeConfigs([{ files: ["dist/**"], extraResources: ["res/**"], extraFiles: { from: "bin", to: "bin" } }])
    expect(result.fileOptions).toEqual({
      files: [{ filter: ["dist/**"] }],
      extraResources: [{ filter: ["res/**"] }],
      extraFiles: [{ from: "bin", to: "bin" }],
    })
    expect(result).not.toHaveProperty("files")
    expect(result).not.toHaveProperty("extraResources")
    expect(result).not.toHaveProperty("extraFiles")
  })

  test.for(ALL_PLATFORM_KEYS)("at the %s platform level", (platform, { expect }) => {
    const result: Record<string, any> = doMergeConfigs([{ [platform]: { files: ["p/**"], extraResources: "r", extraFiles: ["f"] } }])
    expect(result[platform]).toEqual({ fileOptions: { files: ["p/**"], extraResources: "r", extraFiles: ["f"] } })
    expect(warnings()).toEqual([expect.stringContaining(`[${platform}.files, ${platform}.extraResources, ${platform}.extraFiles]`)])
  })

  test("target sections are not touched: flatpak.files is a [src, dest] list of its own", ({ expect }) => {
    const flatpakFiles: [string, string][] = [["build/a", "/share/a"]]
    const result = doMergeConfigs([{ flatpak: { files: flatpakFiles }, nsis: { oneClick: false } }])
    expect(result.flatpak).toEqual({ files: flatpakFiles })
    expect(result.nsis).toEqual({ oneClick: false })
    expect(warnings()).toEqual([])
  })

  test("a nested configuration logs nothing and keeps its values", ({ expect }) => {
    const result = doMergeConfigs([{ fileOptions: { files: ["dist/**"], extraFiles: ["x"] }, mac: { fileOptions: { extraResources: ["m"] } } }])
    expect(result.fileOptions).toEqual({ files: [{ filter: ["dist/**"] }], extraFiles: [{ filter: ["x"] }] })
    expect(result.mac).toEqual({ fileOptions: { extraResources: ["m"] } })
    expect(warnings()).toEqual([])
  })

  test("the caller's own fileOptions object is not rewritten", ({ expect }) => {
    const fileOptions = { files: ["a/**"], extraResources: ["r"] }
    doMergeConfigs([{ fileOptions }, { fileOptions: { extraResources: ["s"] } }])
    expect(fileOptions).toEqual({ files: ["a/**"], extraResources: ["r"] })
  })

  test("a parent config's flat keys and a child's nested keys are merged, not treated as a conflict", ({ expect }) => {
    const result = doMergeConfigs([{ files: ["parent/**"], extraResources: ["p"] }, { fileOptions: { files: ["child/**"], extraResources: ["c"] } }])
    expect(result.fileOptions).toEqual({ files: [{ filter: ["parent/**", "child/**"] }], extraResources: [{ filter: ["p"] }, { filter: ["c"] }] })
    expect(warnings()).toEqual([expect.stringContaining("[files, extraResources]")])
  })
})

describe("deprecation warning", () => {
  test("names v27, what moved, the replacement, migrate-schema and v28, and ends with the breaking-changes link", ({ expect }) => {
    doMergeConfigs([{ files: ["dist/**"], mac: { extraResources: ["r"] } }])
    expect(warnings()).toHaveLength(1)
    const [message] = warnings()
    expect(message).toContain("electron-builder v27")
    expect(message).toContain("[files, mac.extraResources]")
    expect(message).toContain("`fileOptions.files`, `mac.fileOptions.extraResources`")
    expect(message).toContain("electron-builder migrate-schema")
    expect(message).toContain("removed in v28")
    expect(message.endsWith(FILE_OPTIONS_URL)).toBe(true)
  })

  test("links a section that exists on the breaking-changes page", ({ expect }) => {
    expect(FILE_OPTIONS_URL.endsWith(`#${FILE_OPTIONS_ANCHOR}`)).toBe(true)
    const doc = readFileSync(path.join(import.meta.dirname, "../../website/docs/migration/v27-breaking-changes.md"), "utf8")
    expect(doc).toContain(`{#${FILE_OPTIONS_ANCHOR}}`)
  })

  test("is logged once per process", ({ expect }) => {
    doMergeConfigs([{ files: ["a/**"] }])
    doMergeConfigs([{ extraFiles: ["b"] }])
    doMergeConfigs([{ win: { extraResources: ["c"] } }])
    expect(warnings()).toHaveLength(1)
  })
})

describe("flat and nested key both set on the same object", () => {
  test("the nested value wins at the root, and the conflict is reported", ({ expect }) => {
    const result = doMergeConfigs([{ files: ["flat/**"], fileOptions: { files: ["nested/**"] } }])
    expect(result.fileOptions).toEqual({ files: [{ filter: ["nested/**"] }] })
    expect(result).not.toHaveProperty("files")
    expect(warnings()).toHaveLength(1)
    const [message] = warnings()
    expect(message).toContain("electron-builder v27")
    expect(message).toContain("`files` and `fileOptions.files` are both set")
    expect(message).toContain("`fileOptions.files` is used and `files` is ignored")
    expect(message.endsWith(FILE_OPTIONS_URL)).toBe(true)
  })

  test("the nested value wins at the platform level; other flat keys are still moved", ({ expect }) => {
    const result = doMergeConfigs([{ mac: { extraFiles: ["flat"], extraResources: ["moved"], fileOptions: { extraFiles: ["nested"] } } }])
    expect(result.mac).toEqual({ fileOptions: { extraFiles: ["nested"], extraResources: ["moved"] } })
    const messages = warnings()
    expect(messages).toHaveLength(2)
    expect(messages).toContainEqual(expect.stringContaining("`mac.extraFiles` and `mac.fileOptions.extraFiles` are both set"))
    expect(messages).toContainEqual(expect.stringContaining("[mac.extraResources]"))
  })
})

describe("malformed fileOptions", () => {
  test("a fileOptions list at the root is left for the guard, which names the shape and migrate-schema", ({ expect }) => {
    const result = doMergeConfigs([{ fileOptions: ["dist/**"], files: ["x/**"] } as any]) as Record<string, any>
    expect(result.fileOptions).toEqual(["dist/**"])
    expect(result.files).toEqual(["x/**"])

    let error: unknown = null
    try {
      checkLegacyConfiguration(result)
    } catch (e: unknown) {
      error = e
    }
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    const message = (error as Error).message
    expect(message).toContain("`fileOptions` must be an object holding `files`, `extraResources` and/or `extraFiles`, not an array")
    expect(message).toContain("[files]")
    expect(message).toContain('fileOptions: { files: ["dist/**"] }')
    expect(message).toContain("electron-builder migrate-schema")
    expect(message).toContain("--config <path>")
    expect(message).toContain(FILE_OPTIONS_URL)
  })

  test("a platform-level fileOptions string is reported with its path", ({ expect }) => {
    expect(() => checkLegacyConfiguration({ mac: { fileOptions: "dist/**" } } as any)).toThrow(/`mac\.fileOptions` must be an object.*not a string/)
  })

  test("a nested array inside fileOptions.files is a configuration error", ({ expect }) => {
    expect(() => doMergeConfigs([{ fileOptions: { files: [["a"]] } } as any])).toThrow(InvalidConfigurationError)
  })
})

describe("schema", () => {
  test("accepts the nested form at the root and per platform", async ({ expect }) => {
    const config = { fileOptions: { files: ["dist/**"], extraResources: [{ from: "a", to: "b" }], extraFiles: "c" }, mac: { fileOptions: { files: null } } }
    await expect(validateConfiguration(config as any, new DebugLogger(false))).resolves.toBeUndefined()
  })

  test("still accepts the deprecated flat keys (a config validated before normalization)", async ({ expect }) => {
    const config = { files: ["dist/**"], extraResources: "r", win: { extraFiles: [{ from: "a" }] } }
    await expect(validateConfiguration(config as any, new DebugLogger(false))).resolves.toBeUndefined()
  })

  test("rejects an unknown key inside fileOptions", async ({ expect }) => {
    await expect(validateConfiguration({ fileOptions: { asarUnpack: ["x"] } } as any, new DebugLogger(false))).rejects.toThrow(/asarUnpack/)
  })
})

describe("getConfig", () => {
  test("a flat key passed programmatically (or with -c.files) is added to the config file's fileOptions, not a conflict", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "file-options" })
    await mkdir(projectDir, { recursive: true })
    await writeFile(path.join(projectDir, "package.json"), JSON.stringify({ name: "app", version: "1.0.0" }))
    await writeFile(path.join(projectDir, "electron-builder.json"), JSON.stringify({ fileOptions: { files: ["from-file/**"] } }))

    const config = await getConfig(projectDir, null, { files: ["from-cli/**"] })
    expect(config.fileOptions?.files).toEqual([{ filter: ["from-file/**", "from-cli/**"] }])
    expect(config).not.toHaveProperty("files")
    expect(warnings()).toEqual([expect.stringContaining("[files]")])
  })
})

describe("packaging readers see the nested values", () => {
  const projectDir = path.resolve("/project")
  const outDir = path.join(projectDir, "dist")
  const resourcesDir = path.join(outDir, "linux-unpacked", "resources")

  test("getFileMatchers reads root and platform fileOptions, including values written as flat keys", ({ expect }) => {
    const config = doMergeConfigs([{ extraResources: [{ from: "assets", to: "bin" }], linux: { extraResources: ["linux-only/**"] } }])
    const matchers = getFileMatchers(config, "extraResources", resourcesDir, {
      macroExpander: noMacro,
      customBuildOptions: config.linux ?? {},
      globalOutDir: outDir,
      defaultSrc: projectDir,
    })
    expect(matchers?.map(it => ({ from: it.from, to: it.to }))).toEqual([
      { from: projectDir, to: resourcesDir },
      { from: path.join(projectDir, "assets"), to: path.join(resourcesDir, "bin") },
    ])
    expect(matchers?.[0].patterns).toContain("linux-only/**")
  })

  test("getFileMatchers ignores a flat key that bypassed normalization", ({ expect }) => {
    const matchers = getFileMatchers({ extraFiles: ["stale"] }, "extraFiles", resourcesDir, {
      macroExpander: noMacro,
      customBuildOptions: { extraFiles: ["stale"] },
      globalOutDir: outDir,
      defaultSrc: projectDir,
    })
    expect(matchers).toBeNull()
  })

  test("the node_modules matcher reads root and platform fileOptions.files excludes", ({ expect }) => {
    const config = doMergeConfigs([{ files: ["**/*", "!root-secret/**"], linux: { files: ["!linux-secret/**"] } }])
    const packager = { config, debugLogger: { isEnabled: false } } as any
    const matcher = getNodeModuleFileMatcher(projectDir, outDir, noMacro, config.linux ?? {}, packager)
    expect(matcher.patterns).toContain("!root-secret/**")
    expect(matcher.patterns).toContain("!linux-secret/**")
  })
})
