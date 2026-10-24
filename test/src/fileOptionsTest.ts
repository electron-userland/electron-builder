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
import { MacPackager } from "app-builder-lib"
import { DebugLogger, InvalidConfigurationError, log, serializeToYaml } from "builder-util"
import { deepAssign } from "builder-util-runtime"
import { Configuration } from "electron-builder"
import { readFileSync } from "fs"
import { mkdir, writeFile } from "fs/promises"
import * as path from "path"
import { afterEach, beforeEach, describe, MockInstance, test, vi } from "vitest"

const FILE_OPTIONS_URL = "https://www.electron.build/docs/migration/v27-config-changes#file-options-fileoptions"
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

/** Merges configurations that may set flat keys, which the `Configuration` type does not have. */
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

  test("fileOptions.excludedExts is kept as is at the root and per platform", ({ expect }) => {
    const result = merge({ fileOptions: { excludedExts: ["default", "!pdb"] }, linux: { fileOptions: { excludedExts: ["map"] } }, win: { fileOptions: { excludedExts: [] } } })
    expect(result.fileOptions?.excludedExts).toEqual(["default", "!pdb"])
    expect(result.linux?.fileOptions?.excludedExts).toEqual(["map"])
    expect(result.win?.fileOptions?.excludedExts).toEqual([])
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

describe("flat-key warning", () => {
  test("names the keys found, the fileOptions paths they are applied as and migrate-schema, and ends with the docs link", ({ expect }) => {
    merge({ files: ["dist/**"], mac: { extraResources: ["r"] } })
    expect(warnings()).toEqual([
      "`files`, `extraResources` and `extraFiles` belong under `fileOptions`. Found [files, mac.extraResources] outside it; " +
        "they are applied as `fileOptions.files`, `mac.fileOptions.extraResources`. " +
        `Run \`electron-builder migrate-schema\` to update the configuration. ${FILE_OPTIONS_URL}`,
    ])
  })

  test("links a section that exists on the config-changes page", ({ expect }) => {
    expect(FILE_OPTIONS_URL.endsWith(`#${FILE_OPTIONS_ANCHOR}`)).toBe(true)
    const doc = readFileSync(path.join(import.meta.dirname, "../../website/docs/migration/v27-config-changes.md"), "utf8")
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
  test("has only fileOptions, not the flat keys, at the root and per platform", ({ expect }) => {
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

  // e.g. `-c.fileOptions.excludedExts=default` on the command line
  test("accepts a single string for fileOptions.excludedExts at the root and per platform", async ({ expect }) => {
    const config: Configuration = { fileOptions: { excludedExts: "default" }, win: { fileOptions: { excludedExts: ".pdb" } }, mac: { fileOptions: { excludedExts: "map" } } }
    await expect(validateConfiguration(config, new DebugLogger(false))).resolves.toBeUndefined()
  })

  // a number or boolean is not rejected: ajv's coerceTypes turns it into a string
  test.for<[string, unknown]>([
    ["an object", { default: true }],
    ["a list with an object", ["default", { ext: "map" }]],
  ])("rejects %s for fileOptions.excludedExts", async ([, excludedExts], { expect }) => {
    await expect(validateConfiguration({ fileOptions: { excludedExts } } as Configuration, new DebugLogger(false))).rejects.toThrow(/excludedExts/)
    await expect(validateConfiguration({ linux: { fileOptions: { excludedExts } } } as Configuration, new DebugLogger(false))).rejects.toThrow(/excludedExts/)
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
    const loaded = config as Record<string, any>
    expect(loaded.files).toBe(config.fileOptions?.files)
    expect(loaded.extraFiles).toBe(config.fileOptions?.extraFiles)
    expect(loaded.extraResources).toBeUndefined()
    expect((config.mac as Record<string, any>).extraResources).toEqual(["m"])
  })

  test("each read path warns once, naming the nested replacement and the docs link", ({ expect }) => {
    const loaded = merge({ fileOptions: { files: ["dist/**"] }, mac: {} }) as Record<string, any>
    void loaded.files
    void loaded.files
    void loaded.mac.extraResources
    expect(warnings()).toEqual([
      `\`config.files\` is not a configuration property; read \`config.fileOptions.files\`. ${FILE_OPTIONS_URL}`,
      `\`config.mac.extraResources\` is not a configuration property; read \`config.mac.fileOptions.extraResources\`. ${FILE_OPTIONS_URL}`,
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
    const loaded = merge({ win: {} }) as Record<string, any>
    expect(() => {
      loaded.files = ["x"]
    }).toThrow(InvalidConfigurationError)
    expect(() => {
      loaded.win.extraResources = ["x"]
    }).toThrow(
      /`config\.win\.extraResources` is not a configuration property and cannot be assigned; set `config\.win\.fileOptions\.extraResources` instead.*#file-options-fileoptions/
    )
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

describe("fileOptions.excludedExts: a later layer replaces an earlier one", () => {
  test("an extends child replaces its parent's list, at the root and per platform", ({ expect }) => {
    const merged = merge(
      { fileOptions: { excludedExts: ["default", "!pdb"] }, linux: { fileOptions: { excludedExts: ["map"] } }, win: { fileOptions: { excludedExts: ["map"] } } },
      { fileOptions: { excludedExts: ["default"] }, linux: { fileOptions: { excludedExts: [] } } }
    )
    expect(merged.fileOptions?.excludedExts).toEqual(["default"])
    expect(merged.linux?.fileOptions?.excludedExts).toEqual([])
    expect(merged.win?.fileOptions?.excludedExts).toEqual(["map"])
  })

  test("a child that does not set it, or sets it to null, keeps the parent's list", ({ expect }) => {
    expect(merge({ fileOptions: { excludedExts: ["map"] } }, { fileOptions: { files: ["dist/**"] } }).fileOptions?.excludedExts).toEqual(["map"])
    expect(merge({ fileOptions: { excludedExts: ["map"] } }, { fileOptions: { excludedExts: null } }).fileOptions?.excludedExts).toEqual(["map"])
  })

  test("the configs it is given are untouched", ({ expect }) => {
    const parent = { fileOptions: { excludedExts: ["default", "!pdb"] } }
    merge(parent, { fileOptions: { excludedExts: ["map"] } })
    expect(parent).toEqual({ fileOptions: { excludedExts: ["default", "!pdb"] } })
  })

  test("a programmatic (or -c) configuration replaces the config file's list", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "excluded-exts" })
    await mkdir(projectDir, { recursive: true })
    await writeFile(path.join(projectDir, "package.json"), JSON.stringify({ name: "app", version: "1.0.0" }))
    await writeFile(
      path.join(projectDir, "electron-builder.json"),
      JSON.stringify({ fileOptions: { excludedExts: ["default", "!pdb"] }, mac: { fileOptions: { excludedExts: ["map"] } } })
    )

    const config = await getConfig(projectDir, null, { fileOptions: { excludedExts: ["default"] }, mac: { fileOptions: { excludedExts: null } } })
    expect(config.fileOptions?.excludedExts).toEqual(["default"])
    expect(config.mac?.fileOptions?.excludedExts).toEqual(["map"])
  })

  describe("mac → mas → masDev", () => {
    function platformConfig(type: "mas" | "mas-dev", mac: Record<string, any>, mas?: Record<string, any> | null, masDev?: Record<string, any> | null): Record<string, any> {
      const packager = { platformSpecificBuildOptions: mac, config: { mas, masDev } }
      return (MacPackager.prototype.getPlatformConfig as (this: unknown, type: string) => { config: Record<string, any> }).call(packager, type).config
    }

    test("mas replaces mac's list, and masDev replaces mas's", ({ expect }) => {
      const mac = { fileOptions: { excludedExts: ["default", "!pdb"], files: ["a/**"] } }
      const mas = { fileOptions: { excludedExts: ["default"] } }
      const masDev = { fileOptions: { excludedExts: ["map"] } }
      expect(platformConfig("mas", mac, mas).fileOptions).toEqual({ excludedExts: ["default"], files: ["a/**"] })
      expect(platformConfig("mas-dev", mac, mas, masDev).fileOptions.excludedExts).toEqual(["map"])
    })

    test("a layer that does not set it, or sets it to null, keeps the previous layer's list", ({ expect }) => {
      const mac = { fileOptions: { excludedExts: ["map"] } }
      expect(platformConfig("mas", mac, {}).fileOptions.excludedExts).toEqual(["map"])
      expect(platformConfig("mas", mac, { fileOptions: { excludedExts: null } }).fileOptions.excludedExts).toEqual(["map"])
      expect(platformConfig("mas-dev", mac, null, { fileOptions: { extraFiles: ["x"] } }).fileOptions.excludedExts).toEqual(["map"])
    })

    test("merging the mas configuration does not change the fileOptions of the mac or mas one", ({ expect }) => {
      const mac = { fileOptions: { excludedExts: ["default"] } }
      const mas = { fileOptions: { excludedExts: ["default", "!pdb"], extraFiles: ["mas-f"] } }
      const masDev = { fileOptions: { extraFiles: ["dev-f"] } }
      platformConfig("mas-dev", mac, mas, masDev)
      expect(mac).toEqual({ fileOptions: { excludedExts: ["default"] } })
      expect(mas).toEqual({ fileOptions: { excludedExts: ["default", "!pdb"], extraFiles: ["mas-f"] } })

      // also when mac has no fileOptions object to copy
      const masOnly = { fileOptions: { excludedExts: ["map"] } }
      platformConfig("mas-dev", { fileOptions: null }, masOnly, masDev)
      expect(masOnly).toEqual({ fileOptions: { excludedExts: ["map"] } })
    })
  })
})
