import { checkLegacyConfiguration, RESOLVED_LEGACY_CONFIG_OPTIONS, validateConfiguration, validateSchema } from "app-builder-lib/internal"
import { DebugLogger, InvalidConfigurationError, log } from "builder-util"
import { readFileSync } from "fs"
import * as path from "path"
import { describe, expect, test, vi } from "vitest"
import { resolveExcludedExtensions } from "../../packages/app-builder-lib/src/fileMatcher"
import { assertInstallerDebugLoggingSupported } from "../../packages/app-builder-lib/src/toolsets/nsis"

function expectRejected(config: Record<string, any>): string {
  try {
    checkLegacyConfiguration(config as any)
  } catch (e: any) {
    return e.message
  }
  throw new Error(`expected checkLegacyConfiguration to throw for ${JSON.stringify(config)}`)
}

/** Builds a config with `value` at `path`, e.g. ["mac","identity"] → { mac: { identity: value } }. */
function configWith(path: readonly string[], value: unknown): Record<string, any> {
  const config: Record<string, any> = { appId: "com.example.app", productName: "MyApp" }
  let node = config
  for (const segment of path.slice(0, -1)) {
    node[segment] = node[segment] ?? {}
    node = node[segment]
  }
  node[path[path.length - 1]] = value
  return config
}

describe("checkLegacyConfiguration — every mapped option is reported", () => {
  test.each(RESOLVED_LEGACY_CONFIG_OPTIONS.map(o => [o.fullPath, o] as const))("%s", (_fullPath, option) => {
    const message = expectRejected(configWith([...option.parentPath, option.key], "value"))
    expect(message).toContain(option.fullPath)
    if (option.replacement != null) {
      // The replacement must be named — that is the entire point of the guard over ajv's output.
      const expected = option.scope == null ? option.replacement : [...option.parentPath, option.replacement].join(".")
      expect(message).toContain(option.replacement.includes(" ") ? option.replacement : expected)
    }
    if (option.autoMigrated) {
      expect(message).toContain("electron-builder migrate-schema")
    }
    expect(message).toContain("v27-breaking-changes")
  })
})

describe("checkLegacyConfiguration — never rejects a valid v27 config", () => {
  // The guard must not be able to fail a config the schema accepts. Anything guarded here must also
  // be rejected by scheme.json; if a key is ever re-added to v27, this fails instead of the guard
  // silently blocking a legitimate config.
  test.each(RESOLVED_LEGACY_CONFIG_OPTIONS.map(o => [o.fullPath, o] as const))("v27 schema also rejects %s", async (_fullPath, option) => {
    const config = configWith([...option.parentPath, option.key], "value")
    await expect(validateConfiguration(config as any, new DebugLogger(false))).rejects.toThrow()
  })

  test.each([
    ["fully migrated mac signing", { mac: { sign: { identity: "Developer ID Application: Acme (TEAM)", hardenedRuntime: true, ignore: ["**/*.txt"] } } }],
    ["mac universal", { mac: { universal: { mergeASARs: true, singleArchFiles: "*.node" } } }],
    ["win signtool", { win: { sign: { type: "signtool", certificateFile: "cert.pfx", publisherName: "CN=ACME Inc" } } }],
    ["win sign disabled", { win: { sign: false } }],
    ["nativeModules", { nativeModules: { buildDependenciesFromSource: true, rebuildMode: "parallel" } }],
    ["asar object", { asar: { unpack: ["**/*.node"], disableIntegrity: true } }],
    ["asar true (still valid in v27)", { asar: true }],
    ["asar false", { asar: false }],
    ["electronGet", { electronGet: { mirrorOptions: { mirror: "https://my-mirror/" }, unsafelyDisableChecksums: true } }],
    ["snapcraft", { snapcraft: { base: "core22", core22: { confinement: "strict" } } }],
    ["github publish with tagNamePrefix", { publish: { provider: "github", owner: "o", repo: "r", tagNamePrefix: "" } }],
    ["gitlab publish keeps vPrefixedTagName", { publish: { provider: "gitlab", projectId: 1, vPrefixedTagName: false } }],
    ["fileOptions", { fileOptions: { files: ["dist/**"], extraResources: [{ from: "a", to: "b" }] }, mac: { fileOptions: null }, win: { fileOptions: { extraFiles: "x" } } }],
    ["flat files keys (applied as fileOptions)", { files: ["dist/**"], linux: { extraResources: ["r"] } }],
    ["fileOptions.allowExternalLinks", { fileOptions: { allowExternalLinks: ["../shared-lib"] }, linux: { fileOptions: { allowExternalLinks: true } } }],
    ["fileOptions.excludedExts", { fileOptions: { excludedExts: ["default", "!pdb"] }, linux: { fileOptions: { excludedExts: ["map"] } } }],
    ["fileOptions.excludedExts null and empty", { fileOptions: { excludedExts: null }, win: { fileOptions: { excludedExts: [] } } }],
  ])("%s passes the guard", (_name, config) => {
    expect(() => checkLegacyConfiguration({ appId: "com.example.app", ...config } as any)).not.toThrow()
  })
})

describe("checkLegacyConfiguration — aggregation", () => {
  test("reports every legacy key in one throw, not just the first", () => {
    const message = expectRejected({
      electronCompile: true,
      nativeRebuilder: "parallel",
      asarUnpack: ["**/*.node"],
      mac: { identity: "Developer ID Application: Acme (TEAM)", hardenedRuntime: true, mergeASARs: true },
    })
    expect(message).toContain("6 options that were removed")
    for (const key of ["electronCompile", "nativeRebuilder", "asarUnpack", "mac.identity", "mac.hardenedRuntime", "mac.mergeASARs"]) {
      expect(message).toContain(key)
    }
  })

  test("a single legacy key uses the singular header", () => {
    expect(expectRejected({ electronCompile: true })).toContain("an option that was removed")
  })
})

describe("checkLegacyConfiguration — inverted-polarity options spell out the inversion", () => {
  test.each([
    ["npmSkipBuildFromSource", { npmSkipBuildFromSource: true }],
    ["squirrelWindows.noMsi", { squirrelWindows: { noMsi: true } }],
    ["electronGet.isVerifyChecksum", { electronGet: { isVerifyChecksum: false } }],
  ])("%s", (_name, config) => {
    expect(expectRejected(config)).toContain("INVERTED")
  })
})

describe("checkLegacyConfiguration — structural checks", () => {
  test("mac.sign as a custom signer alongside legacy options explains the union", () => {
    const message = expectRejected({ mac: { sign: "./customSign.js", identity: "Developer ID Application: Acme (TEAM)", hardenedRuntime: true } })
    expect(message).toContain("single union")
    expect(message).toContain("identity")
    expect(message).toContain("hardenedRuntime")
  })

  test("mac.sign as a custom signer with no legacy siblings is fine", () => {
    expect(() => checkLegacyConfiguration({ mac: { sign: "./customSign.js" } } as any)).not.toThrow()
  })

  test("win.sign without a type discriminator names the discriminator", () => {
    const message = expectRejected({ win: { sign: { certificateFile: "cert.pfx", publisherName: "CN=ACME Inc" } } })
    expect(message).toContain("missing its `type` discriminator")
    expect(message).toContain('"signtool"')
  })

  test("win.sign: false and win.sign: null are untouched", () => {
    expect(() => checkLegacyConfiguration({ win: { sign: false } } as any)).not.toThrow()
    expect(() => checkLegacyConfiguration({ win: { sign: null } } as any)).not.toThrow()
  })

  test("snapcraft without base says so instead of ajv's 'should be null'", () => {
    const message = expectRejected({ snapcraft: { core22: { confinement: "strict" } } })
    expect(message).toContain("missing the required `base`")
    expect(message).toContain('"core22"')
    expect(message).not.toContain("should be one of these")
  })

  test("snapcraft with flat v26 sub-keys says to nest them under the base", () => {
    const message = expectRejected({ snapcraft: { base: "core22", confinement: "strict", stagePackages: ["libfoo"] } })
    expect(message).toContain("confinement")
    expect(message).toContain("stagePackages")
    expect(message).toContain("snapcraft.core22")
  })

  test("github vPrefixedTagName is reported, gitlab is not", () => {
    const message = expectRejected({ publish: { provider: "github", owner: "o", repo: "r", vPrefixedTagName: false } })
    expect(message).toContain('tagNamePrefix: ""')
    expect(() => checkLegacyConfiguration({ publish: { provider: "gitlab", projectId: 1, vPrefixedTagName: false } } as any)).not.toThrow()
  })

  test("vPrefixedTagName is found in publish arrays and under platform keys", () => {
    expect(
      expectRejected({
        publish: [
          { provider: "s3", bucket: "b" },
          { provider: "github", owner: "o", repo: "r", vPrefixedTagName: true },
        ],
      })
    ).toContain("tagNamePrefix")
    expect(expectRejected({ win: { publish: { provider: "github", owner: "o", repo: "r", vPrefixedTagName: false } } })).toContain("win.publish.vPrefixedTagName")
  })
})

describe("checkLegacyConfiguration — includePdb replaced by fileOptions.excludedExts", () => {
  test('includePdb: true names fileOptions.excludedExts, the "!pdb" entry, migrate-schema and its breaking-changes section', () => {
    const message = expectRejected({ includePdb: true })
    expect(message).toContain("`includePdb` was replaced by `fileOptions.excludedExts` in electron-builder v27.")
    expect(message).toContain('"excludedExts": ["default", "!pdb"]')
    // the command-line form: one flag per entry (quoting is left to the shell: cmd.exe keeps single quotes)
    expect(message).toContain("`-c.fileOptions.excludedExts=default -c.fileOptions.excludedExts=!pdb`, single-quoting the second one in an interactive bash or zsh")
    expect(message).toContain("electron-builder migrate-schema")
    expect(message).toContain("https://www.electron.build/docs/migration/v27-config-changes#includepdb-fileoptionsexcludedexts")
  })

  test('includePdb: false is reported too, with ["default"] (also as a -c value) in its place where it overrides an includePdb: true from another layer', () => {
    const message = expectRejected({ includePdb: false })
    expect(message).toContain("`includePdb: false` was the default: where it overrides an `includePdb: true` from another layer")
    expect(message).toContain('set `"fileOptions": { "excludedExts": ["default"] }` in its place')
    expect(message).toContain("`-c.fileOptions.excludedExts=default`")
    expect(message).toContain("otherwise remove it.")
    expect(message).toContain("https://www.electron.build/docs/migration/v27-config-changes#includepdb-fileoptionsexcludedexts")
  })

  test("the config-changes page has the linked section", () => {
    const doc = readFileSync(path.join(import.meta.dirname, "../../website/docs/migration/v27-config-changes.md"), "utf8")
    expect(doc).toContain("{#includepdb-fileoptionsexcludedexts}")
  })

  describe("schema", () => {
    const logger = new DebugLogger(false)
    const scheme = JSON.parse(readFileSync(path.join(import.meta.dirname, "../../packages/app-builder-lib/scheme.json"), "utf8"))

    test.each([
      ["root", { fileOptions: { excludedExts: ["default", "!pdb"] } }],
      // what migrate-schema writes for includePdb: false, and the -c.fileOptions.excludedExts=default the guard suggests
      ['["default"]', { fileOptions: { excludedExts: ["default"] } }],
      ["a single string", { fileOptions: { excludedExts: "default" }, win: { fileOptions: { excludedExts: "map" } } }],
      ["per platform", { linux: { fileOptions: { excludedExts: ["map"] } }, mac: { fileOptions: { excludedExts: ["default", "map"] } } }],
      ["null", { fileOptions: { excludedExts: null } }],
      ["empty", { win: { fileOptions: { excludedExts: [] } } }],
      [
        "in every platform section",
        {
          fileOptions: { excludedExts: ["default", "!pdb"] },
          mac: { fileOptions: { excludedExts: null } },
          mas: { fileOptions: { excludedExts: [] } },
          // valid, though "!pdb" has no effect without "default" (resolving it warns)
          masDev: { fileOptions: { excludedExts: ["map", "!pdb"] } },
          win: { fileOptions: { excludedExts: "default" } },
          linux: { fileOptions: { excludedExts: ["map"] } },
        },
      ],
    ])("accepts fileOptions.excludedExts %s", async (_name, config) => {
      await expect(validateConfiguration(config as any, logger)).resolves.toBeUndefined()
    })

    // checked for every platform section up front, not only when a target of that platform (e.g. mas-dev) is packed
    test.each([
      ["masDev.fileOptions.excludedExts", { masDev: { fileOptions: { excludedExts: ["*.map"] } } }, '"*.map" in `masDev.fileOptions.excludedExts` is not a file extension'],
      ["win.fileOptions.excludedExts", { win: { fileOptions: { excludedExts: ["!pdb"] } } }, '`win.fileOptions.excludedExts` ["!pdb"] only removes extensions'],
      ["mas.fileOptions.excludedExts", { mas: { fileOptions: { excludedExts: "!default" } } }, '"!default" in `mas.fileOptions.excludedExts` is not supported'],
      ["fileOptions.excludedExts", { fileOptions: { excludedExts: ["!pdb"] } }, '`fileOptions.excludedExts` ["!pdb"] only removes extensions'],
      [
        "fileOptions.excludedExts, with valid platform values",
        { fileOptions: { excludedExts: "!pdb" }, win: { fileOptions: { excludedExts: ["default"] } } },
        '`fileOptions.excludedExts` "!pdb" only removes extensions',
      ],
    ])("rejects an invalid %s, naming its path", async (_name, config, message) => {
      const result = validateConfiguration(config, logger)
      await expect(result).rejects.toThrow(InvalidConfigurationError)
      await expect(result).rejects.toThrow(message)
    })

    test.each([true, false])("rejects includePdb: %s, and so does scheme.json on its own", async value => {
      await expect(validateConfiguration({ includePdb: value } as any, logger)).rejects.toThrow("fileOptions.excludedExts")
      // validateConfiguration runs the guard first; scheme.json (what an editor validates against) must not have the key either
      expect(() => validateSchema(scheme, { includePdb: value })).toThrow("includePdb")
    })

    test("rejects a fileOptions.excludedExts that is not a string or a list of strings", async () => {
      await expect(validateConfiguration({ fileOptions: { excludedExts: ["default", { ext: "pdb" }] } } as any, logger)).rejects.toThrow("excludedExts")
      await expect(validateConfiguration({ linux: { fileOptions: { excludedExts: { pdb: true } } } } as any, logger)).rejects.toThrow("excludedExts")
    })

    test.each([
      ["mas", { mas: { fileOptions: { excludedExts: "!obj" } } }, "(it replaces the root list and `mac`'s rather than removing from them)"],
      ["masDev", { masDev: { fileOptions: { excludedExts: ["!obj"] } } }, "(it replaces the root list, `mac`'s and `mas`'s rather than removing from them)"],
      ["win", { win: { fileOptions: { excludedExts: ["!obj"] } } }, "(it replaces the root list rather than removing from it)"],
    ])("a removals-only %s list is told that it replaces the lists before it", async (_name, config, note) => {
      await expect(validateConfiguration(config as any, logger)).rejects.toThrow(note)
    })

    test("a removals-only root list is not told about other lists", async () => {
      await expect(validateConfiguration({ fileOptions: { excludedExts: ["!obj"] } } as any, logger)).rejects.toThrow(/^(?![\s\S]*\(it replaces)[\s\S]*only removes extensions/)
    })

    test('a "!ext" that removes nothing is reported when the configuration is validated, naming the section, and not again when packing', async () => {
      log.resetLimits()
      const warn = vi.spyOn(log, "warn").mockImplementation(() => log)
      try {
        const excludedExts = ["map", "!zzz-unused"]
        await validateConfiguration({ masDev: { fileOptions: { excludedExts } } }, logger)
        expect(warn.mock.calls.map(call => call[0])).toEqual([expect.stringContaining('"!zzz-unused" in `masDev.fileOptions.excludedExts` has no effect')])
        expect(resolveExcludedExtensions({}, { fileOptions: { excludedExts } })).toEqual(["map"])
        expect(warn).toHaveBeenCalledTimes(1)
      } finally {
        warn.mockRestore()
        log.resetLimits()
      }
    })

    test('the same "!ext" in two sections is reported for each, with advice that fits the list', async () => {
      log.resetLimits()
      const warn = vi.spyOn(log, "warn").mockImplementation(() => log)
      try {
        await validateConfiguration(
          {
            fileOptions: { excludedExts: ["map", "!pdb"] },
            win: { fileOptions: { excludedExts: ["obj", "!pdb"] } },
            linux: { fileOptions: { excludedExts: ["default", "!zzz-none"] } },
            mac: { fileOptions: { excludedExts: ["default", "!PDB"] } },
            mas: { fileOptions: { excludedExts: ["map", "!PDB", "!MAP"] } },
          },
          logger
        )
        expect(warn.mock.calls.map(call => call[0])).toEqual([
          '"!pdb" in `fileOptions.excludedExts` has no effect: "pdb" is not otherwise excluded. List "default" too to exclude the default extensions except "pdb".',
          '"!PDB" in `mac.fileOptions.excludedExts` has no effect: "PDB" is not otherwise excluded. Extensions are case-sensitive: did you mean "!pdb"?',
          // without "default", "!pdb" would not remove anything either
          '"!PDB" in `mas.fileOptions.excludedExts` has no effect: "PDB" is not otherwise excluded. Extensions are case-sensitive, and the list does not have "default": list "default" and "!pdb" to exclude the default extensions except "pdb".',
          '"!MAP" in `mas.fileOptions.excludedExts` has no effect: "MAP" is not otherwise excluded. Extensions are case-sensitive: did you mean "!map"?',
          '"!pdb" in `win.fileOptions.excludedExts` has no effect: "pdb" is not otherwise excluded. List "default" too to exclude the default extensions except "pdb".',
          '"!zzz-none" in `linux.fileOptions.excludedExts` has no effect: "zzz-none" is not otherwise excluded. Remove the entry.',
        ])
      } finally {
        warn.mockRestore()
        log.resetLimits()
      }
    })
  })
})

describe("PackagerOptions — removed programmatic fields", () => {
  // v26 accepted these as siblings of `config`. `build()` rejected them with a bare
  // `Unknown option "devMetadata"`, and a directly constructed Packager ignored them entirely.
  test.each([
    ["devMetadata", "config"],
    ["extraMetadata", "config.extraMetadata"],
  ])("new Packager({ %s }) names the replacement", async (key, replacement) => {
    const { Packager } = await import("app-builder-lib")
    expect(() => new Packager({ projectDir: process.cwd(), [key]: { foo: 1 } } as any)).toThrow(new RegExp(replacement.replace(".", "\\.")))
  })

  test("a valid v27 options object is accepted", async () => {
    const { Packager } = await import("app-builder-lib")
    expect(() => new Packager({ projectDir: process.cwd(), config: { extraMetadata: { foo: 1 } } } as any)).not.toThrow()
  })
})

// Issue #10274: v26 customNsisBinary / customNsisResources are removed in favour of toolsets.nsis + installerDebugLogging.
describe("checkLegacyConfiguration — removed custom NSIS bundle keys", () => {
  const url = "https://downloads.example.com/nsisbi.7z?token=s3cr3t-token"
  const checksum = "374cfc092fd1bd1898472df627549ecc165b0d6ba88e82deba085673aec95336"

  test("customNsisBinary names toolsets.nsis, installerDebugLogging, the bundle layout and the migration guide, never its values", () => {
    const message = expectRejected({ nsis: { customNsisBinary: { url, checksum, debugLogging: true } } })
    expect(message).toContain("`nsis.customNsisBinary` was replaced by `toolsets.nsis` and `nsis.installerDebugLogging` in electron-builder v27.")
    expect(message).toContain("toolsets#custom-nsis-bundle-layout")
    expect(message).toContain("v26-to-v27#step-4-custom-nsis-migration-guide")
    expect(message).toContain("v27-config-changes#customnsisbinary-and-customnsisresources-replaced-by-toolsetsnsis")
    expect(message).not.toContain(url)
    expect(message).not.toContain(checksum)
  })

  test("portable.customNsisBinary has no installerDebugLogging replacement", () => {
    const message = expectRejected({ portable: { customNsisBinary: { debugLogging: true } } })
    expect(message).toContain("`portable.customNsisBinary` was replaced by `toolsets.nsis` in electron-builder v27.")
    expect(message).not.toContain("portable.installerDebugLogging")
  })

  test("installerDebugLogging is a valid v27 option for nsis and nsisWeb, not for portable", async () => {
    const logger = new DebugLogger(false)
    await expect(validateConfiguration({ nsis: { installerDebugLogging: true }, nsisWeb: { installerDebugLogging: false } } as any, logger)).resolves.toBeUndefined()
    await expect(validateConfiguration({ portable: { installerDebugLogging: true } } as any, logger)).rejects.toThrow("installerDebugLogging")
  })
})

describe("assertInstallerDebugLoggingSupported", () => {
  test.each([
    ["unset", undefined, "unset"],
    ["latest", "latest", '"latest"'],
    ["a pinned version", "1.2.1", '"1.2.1"'],
  ] as const)("rejects %s toolsets.nsis, which is not log-enabled", (_name, nsis, shown) => {
    let error: unknown
    try {
      assertInstallerDebugLoggingSupported(nsis, "nsis-web")
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    const message = (error as Error).message
    expect(message).toContain("`installerDebugLogging` (nsis-web target) needs a log-enabled NSIS")
    expect(message).toContain("NSIS_CONFIG_LOG=yes")
    expect(message).toContain(`\`toolsets.nsis\` is ${shown}`)
    expect(message.endsWith("https://www.electron.build/docs/migration/v27-config-changes#customnsisbinary-and-customnsisresources-replaced-by-toolsetsnsis")).toBe(true)
  })

  test("accepts a custom toolsets.nsis bundle", () => {
    expect(() => assertInstallerDebugLoggingSupported({ url: "file:///opt/nsis-log" }, "nsis")).not.toThrow()
  })
})
