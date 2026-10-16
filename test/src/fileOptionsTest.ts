import {
  ALL_PLATFORM_KEYS,
  checkLegacyConfiguration,
  doMergeConfigs,
  FILE_OPTION_KEYS,
  FILE_OPTIONS_ANCHOR,
  getConfig,
  getFileMatchers,
  getNodeModuleFileMatcher,
  validateConfiguration,
} from "app-builder-lib/internal"
import { DebugLogger, InvalidConfigurationError, log, serializeToYaml } from "builder-util"
import { deepAssign } from "builder-util-runtime"
import { Configuration } from "electron-builder"
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

/** Merges v26-shaped configurations: the flat keys are no longer in the v27 types. */
function merge(...configs: Array<Record<string, any>>): Configuration {
  return doMergeConfigs(configs as Configuration[])
}

/** The flat keys an object enumerates (the forwarding accessors are non-enumerable). */
function enumeratedFlatKeys(object: object): string[] {
  return Object.keys(object).filter(key => (FILE_OPTION_KEYS as readonly string[]).includes(key))
}

// the warnings under test are logged as a single message string
function warnings(): string[] {
  return warn.mock.calls.map(call => call[0] as string)
}

describe("flat files / extraResources / extraFiles are normalized into fileOptions", () => {
  test("at the configuration root", ({ expect }) => {
    const result = merge({ files: ["dist/**"], extraResources: ["res/**"], extraFiles: { from: "bin", to: "bin" } })
    expect(result.fileOptions).toEqual({
      files: [{ filter: ["dist/**"] }],
      extraResources: [{ filter: ["res/**"] }],
      extraFiles: [{ from: "bin", to: "bin" }],
    })
    expect(enumeratedFlatKeys(result)).toEqual([])
  })

  test.for(ALL_PLATFORM_KEYS)("at the %s platform level", (platform, { expect }) => {
    const result: Record<string, any> = merge({ [platform]: { files: ["p/**"], extraResources: "r", extraFiles: ["f"] } })
    expect(result[platform]).toEqual({ fileOptions: { files: ["p/**"], extraResources: "r", extraFiles: ["f"] } })
    expect(warnings()).toEqual([expect.stringContaining(`[${platform}.files, ${platform}.extraResources, ${platform}.extraFiles]`)])
  })

  test("target sections are not touched: flatpak.files is a [src, dest] list of its own", ({ expect }) => {
    const flatpakFiles: [string, string][] = [["build/a", "/share/a"]]
    const result = merge({ flatpak: { files: flatpakFiles }, nsis: { oneClick: false } })
    expect(result.flatpak).toEqual({ files: flatpakFiles })
    expect(result.nsis).toEqual({ oneClick: false })
    expect(warnings()).toEqual([])
  })

  test("a nested configuration logs nothing and keeps its values", ({ expect }) => {
    const result = merge({ fileOptions: { files: ["dist/**"], extraFiles: ["x"] }, mac: { fileOptions: { extraResources: ["m"] } } })
    expect(result.fileOptions).toEqual({ files: [{ filter: ["dist/**"] }], extraFiles: [{ filter: ["x"] }] })
    expect(result.mac).toEqual({ fileOptions: { extraResources: ["m"] } })
    expect(warnings()).toEqual([])
  })

  test("the caller's own fileOptions object is not rewritten", ({ expect }) => {
    const fileOptions = { files: ["a/**"], extraResources: ["r"] }
    merge({ fileOptions }, { fileOptions: { extraResources: ["s"] } })
    expect(fileOptions).toEqual({ files: ["a/**"], extraResources: ["r"] })
  })

  test("a parent config's flat keys and a child's nested keys are merged, not treated as a conflict", ({ expect }) => {
    const result = merge({ files: ["parent/**"], extraResources: ["p"] }, { fileOptions: { files: ["child/**"], extraResources: ["c"] } })
    expect(result.fileOptions).toEqual({ files: [{ filter: ["parent/**", "child/**"] }], extraResources: [{ filter: ["p"] }, { filter: ["c"] }] })
    expect(warnings()).toEqual([expect.stringContaining("[files, extraResources]")])
  })
})

describe("deprecation warning", () => {
  test("names v27, what moved, the replacement and migrate-schema, and ends with the breaking-changes link", ({ expect }) => {
    merge({ files: ["dist/**"], mac: { extraResources: ["r"] } })
    expect(warnings()).toHaveLength(1)
    const [message] = warnings()
    expect(message).toContain("electron-builder v27")
    expect(message).toContain("[files, mac.extraResources]")
    expect(message).toContain("`fileOptions.files`, `mac.fileOptions.extraResources`")
    expect(message).toContain("electron-builder migrate-schema")
    expect(message).toContain("still accepted in v27")
    expect(message).not.toContain("v28")
    expect(message.endsWith(FILE_OPTIONS_URL)).toBe(true)
  })

  test("links a section that exists on the breaking-changes page", ({ expect }) => {
    expect(FILE_OPTIONS_URL.endsWith(`#${FILE_OPTIONS_ANCHOR}`)).toBe(true)
    const doc = readFileSync(path.join(import.meta.dirname, "../../website/docs/migration/v27-breaking-changes.md"), "utf8")
    expect(doc).toContain(`{#${FILE_OPTIONS_ANCHOR}}`)
  })

  test("is logged once per process", ({ expect }) => {
    merge({ files: ["a/**"] })
    merge({ extraFiles: ["b"] })
    merge({ win: { extraResources: ["c"] } })
    expect(warnings()).toHaveLength(1)
  })
})

describe("flat and nested key both set on the same object", () => {
  test("the nested value wins at the root, and the conflict is reported", ({ expect }) => {
    const result = merge({ files: ["flat/**"], fileOptions: { files: ["nested/**"] } })
    expect(result.fileOptions).toEqual({ files: [{ filter: ["nested/**"] }] })
    expect(enumeratedFlatKeys(result)).toEqual([])
    expect(warnings()).toHaveLength(1)
    const [message] = warnings()
    expect(message).toContain("electron-builder v27")
    expect(message).toContain("`files` and `fileOptions.files` are both set")
    expect(message).toContain("`fileOptions.files` is used and `files` is ignored")
    expect(message.endsWith(FILE_OPTIONS_URL)).toBe(true)
  })

  test("the nested value wins at the platform level; other flat keys are still moved", ({ expect }) => {
    const result = merge({ mac: { extraFiles: ["flat"], extraResources: ["moved"], fileOptions: { extraFiles: ["nested"] } } })
    expect(result.mac).toEqual({ fileOptions: { extraFiles: ["nested"], extraResources: ["moved"] } })
    const messages = warnings()
    expect(messages).toHaveLength(2)
    expect(messages).toContainEqual(expect.stringContaining("`mac.extraFiles` and `mac.fileOptions.extraFiles` are both set"))
    expect(messages).toContainEqual(expect.stringContaining("[mac.extraResources]"))
  })
})

describe("malformed fileOptions", () => {
  test("a fileOptions list at the root is left for the guard, which names the shape and migrate-schema", ({ expect }) => {
    const result = merge({ fileOptions: ["dist/**"], files: ["x/**"] }) as Record<string, any>
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
    expect(() => checkLegacyConfiguration({ mac: { fileOptions: "dist/**" } } as unknown as Configuration)).toThrow(/`mac\.fileOptions` must be an object.*not a string/)
  })

  test("a nested array inside fileOptions.files is a configuration error", ({ expect }) => {
    expect(() => merge({ fileOptions: { files: [["a"]] } })).toThrow(InvalidConfigurationError)
  })
})

describe("schema", () => {
  test("has no flat keys any more, at the root or per platform", ({ expect }) => {
    const scheme = JSON.parse(readFileSync(path.join(import.meta.dirname, "../../packages/app-builder-lib/scheme.json"), "utf8"))
    for (const definition of [scheme, scheme.definitions.MacConfiguration, scheme.definitions.WindowsConfiguration, scheme.definitions.LinuxConfiguration]) {
      expect(Object.keys(definition.properties)).toContain("fileOptions")
      expect(enumeratedFlatKeys(definition.properties)).toEqual([])
    }
  })

  test("accepts the nested form at the root and per platform", async ({ expect }) => {
    const config: Configuration = { fileOptions: { files: ["dist/**"], extraResources: [{ from: "a", to: "b" }], extraFiles: "c" }, mac: { fileOptions: { files: null } } }
    await expect(validateConfiguration(config, new DebugLogger(false))).resolves.toBeUndefined()
  })

  test("rejects an unknown key inside fileOptions", async ({ expect }) => {
    await expect(validateConfiguration({ fileOptions: { asarUnpack: ["x"] } } as Configuration, new DebugLogger(false))).rejects.toThrow(/asarUnpack/)
  })
})

describe("getConfig", () => {
  test("a flat key passed programmatically (or with -c.files) is added to the config file's fileOptions, not a conflict", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "file-options" })
    await mkdir(projectDir, { recursive: true })
    await writeFile(path.join(projectDir, "package.json"), JSON.stringify({ name: "app", version: "1.0.0" }))
    await writeFile(path.join(projectDir, "electron-builder.json"), JSON.stringify({ fileOptions: { files: ["from-file/**"] } }))

    const config = await getConfig(projectDir, null, { files: ["from-cli/**"] } as Configuration)
    expect(config.fileOptions?.files).toEqual([{ filter: ["from-file/**", "from-cli/**"] }])
    expect(enumeratedFlatKeys(config)).toEqual([])
    expect(warnings()).toEqual([expect.stringContaining("[files]")])
  })

  test("the caller's config object and its platform sections are not rewritten or decorated", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "file-options-caller" })
    await mkdir(projectDir, { recursive: true })
    await writeFile(path.join(projectDir, "package.json"), JSON.stringify({ name: "app", version: "1.0.0" }))

    const mac: Record<string, any> = { target: "dir", extraResources: ["mac-r"] }
    const win: Record<string, any> = { fileOptions: { extraFiles: ["win-f"] } }
    const options: Record<string, any> = { files: ["dist/**"], publish: null, mac, win }
    const snapshot = (it: object) => ({ names: Object.getOwnPropertyNames(it), descriptors: JSON.stringify(Object.getOwnPropertyDescriptors(it)) })
    const before = [options, mac, win, win.fileOptions].map(snapshot)

    const config = await getConfig(projectDir, null, options as Configuration)

    expect([options, mac, win, win.fileOptions].map(snapshot)).toEqual(before)
    for (const holder of [options, mac, win]) {
      for (const key of FILE_OPTION_KEYS) {
        expect(Object.getOwnPropertyDescriptor(holder, key)?.get).toBeUndefined()
      }
    }
    // still plain writable objects
    mac.files = ["mine"]
    options.extraFiles = ["mine"]
    expect(mac.files).toEqual(["mine"])

    // while the returned configuration (its own copies) forwards reads and rejects writes
    expect(config.mac).not.toBe(mac)
    expect(config.win).not.toBe(win)
    expect((config.mac as Record<string, any>).extraResources).toEqual(["mac-r"])
    expect((config as Record<string, any>).files).toEqual([{ filter: ["dist/**"] }])
    expect(() => {
      ;(config.mac as Record<string, any>).files = ["x"]
    }).toThrow(InvalidConfigurationError)
  })

  test("doMergeConfigs leaves the configs it is given untouched", ({ expect }) => {
    const mac: Record<string, any> = { extraFiles: ["f"] }
    const input: Record<string, any> = { files: ["a/**"], mac }
    const merged = merge(input, { mac: { extraFiles: ["g"] } })
    expect(input).toEqual({ files: ["a/**"], mac: { extraFiles: ["f"] } })
    expect(Object.getOwnPropertyNames(mac)).toEqual(["extraFiles"])
    expect(merged.mac?.fileOptions).toEqual({ extraFiles: ["f", "g"] })
  })
})

describe("every config entry path is normalized before validation", () => {
  test("config file, extends parent, platform sections and options passed programmatically or with -c", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "file-options-paths" })
    await mkdir(projectDir, { recursive: true })
    await writeFile(path.join(projectDir, "package.json"), JSON.stringify({ name: "app", version: "1.0.0" }))
    await writeFile(path.join(projectDir, "parent.json"), JSON.stringify({ extraFiles: ["from-parent"], linux: { files: ["!parent-linux/**"] } }))
    await writeFile(
      path.join(projectDir, "electron-builder.json"),
      JSON.stringify({ extends: "./parent.json", files: ["from-file/**"], mac: { extraResources: ["from-file-mac"] } })
    )

    const config = await getConfig(projectDir, null, { extraResources: ["from-cli"], win: { extraFiles: ["from-cli-win"] } } as Configuration)
    await expect(validateConfiguration(config, new DebugLogger(false))).resolves.toBeUndefined()
    expect(config.fileOptions).toEqual({ files: [{ filter: ["from-file/**"] }], extraFiles: [{ filter: ["from-parent"] }], extraResources: [{ filter: ["from-cli"] }] })
    expect(config.mac?.fileOptions).toEqual({ extraResources: ["from-file-mac"] })
    expect(config.win?.fileOptions).toEqual({ extraFiles: ["from-cli-win"] })
    expect(config.linux?.fileOptions).toEqual({ files: ["!parent-linux/**"] })
    for (const holder of [config, config.mac, config.win, config.linux]) {
      expect(enumeratedFlatKeys(holder ?? {})).toEqual([])
    }
  })
})

describe("reads of the flat keys on the loaded configuration are forwarded", () => {
  test("the root and platform getters return the fileOptions value", ({ expect }) => {
    const config = merge({ fileOptions: { files: ["dist/**"], extraFiles: ["e"] }, mac: { fileOptions: { extraResources: ["m"] } } })
    const legacy = config as Record<string, any>
    expect(legacy.files).toBe(config.fileOptions?.files)
    expect(legacy.extraFiles).toBe(config.fileOptions?.extraFiles)
    expect(legacy.extraResources).toBeUndefined()
    expect((config.mac as Record<string, any>).extraResources).toEqual(["m"])
  })

  test("each read path warns once, naming the nested replacement and the docs link", ({ expect }) => {
    const legacy = merge({ fileOptions: { files: ["dist/**"] }, mac: {} }) as Record<string, any>
    void legacy.files
    void legacy.files
    void legacy.mac.extraResources
    expect(warnings()).toEqual([
      `electron-builder v27: \`config.files\` is now \`config.fileOptions.files\`. Reading \`config.files\` still returns that value in v27, with this warning; read \`config.fileOptions.files\` instead. ${FILE_OPTIONS_URL}`,
      expect.stringContaining("`config.mac.extraResources` is now `config.mac.fileOptions.extraResources`"),
    ])
  })

  test("the getters are invisible to Object.keys, JSON, the effective config dump and deepAssign", ({ expect }) => {
    const config = merge({ files: ["dist/**"], linux: { extraResources: ["r"] } })
    warn.mockClear()
    const json = JSON.parse(JSON.stringify(config))
    expect(enumeratedFlatKeys(config)).toEqual([])
    expect(enumeratedFlatKeys(json)).toEqual([])
    expect(enumeratedFlatKeys(json.linux)).toEqual([])
    // the effective config file is a YAML dump; at the root, `files:` etc. could only come from the getters
    expect(serializeToYaml(config)).not.toMatch(/^(files|extraResources|extraFiles):/m)
    expect(serializeToYaml(config)).toBe(serializeToYaml(json))
    const copy = deepAssign({ linux: {} }, config) as Record<string, any>
    expect(Object.getOwnPropertyNames(copy)).not.toContain("files")
    expect(Object.getOwnPropertyNames(copy.linux)).not.toContain("extraResources")
    expect(warnings()).toEqual([])
  })

  test("re-normalizing a loaded configuration neither reads the getters nor sees them as flat keys", ({ expect }) => {
    const config = merge({ files: ["dist/**"] })
    warn.mockClear()
    const again = merge(config)
    expect(again.fileOptions).toEqual({ files: [{ filter: ["dist/**"] }] })
    expect(warnings()).toEqual([])
  })

  test("assigning a flat key throws a configuration error naming the nested replacement", ({ expect }) => {
    const legacy = merge({ win: {} }) as Record<string, any>
    expect(() => {
      legacy.files = ["x"]
    }).toThrow(InvalidConfigurationError)
    expect(() => {
      legacy.win.extraResources = ["x"]
    }).toThrow(/`config\.win\.extraResources` cannot be assigned, it is now `config\.win\.fileOptions\.extraResources`.*#file-options-fileoptions/)
  })
})

describe("packaging readers see the nested values", () => {
  const projectDir = path.resolve("/project")
  const outDir = path.join(projectDir, "dist")
  const resourcesDir = path.join(outDir, "linux-unpacked", "resources")

  test("getFileMatchers reads root and platform fileOptions, including values written as flat keys", ({ expect }) => {
    const config = merge({ extraResources: [{ from: "assets", to: "bin" }], linux: { extraResources: ["linux-only/**"] } })
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
    const matchers = getFileMatchers({ extraFiles: ["stale"] } as Configuration, "extraFiles", resourcesDir, {
      macroExpander: noMacro,
      customBuildOptions: { extraFiles: ["stale"] } as Configuration,
      globalOutDir: outDir,
      defaultSrc: projectDir,
    })
    expect(matchers).toBeNull()
  })

  test("the node_modules matcher reads root and platform fileOptions.files excludes", ({ expect }) => {
    const config = merge({ files: ["**/*", "!root-secret/**"], linux: { files: ["!linux-secret/**"] } })
    const packager = { config, debugLogger: { isEnabled: false } } as unknown as Parameters<typeof getNodeModuleFileMatcher>[4]
    const matcher = getNodeModuleFileMatcher(projectDir, outDir, noMacro, config.linux ?? {}, packager)
    expect(matcher.patterns).toContain("!root-secret/**")
    expect(matcher.patterns).toContain("!linux-secret/**")
  })
})
