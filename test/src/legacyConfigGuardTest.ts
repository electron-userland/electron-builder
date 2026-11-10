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

  test("every guarded path has one entry, so it is reported once", () => {
    const paths = RESOLVED_LEGACY_CONFIG_OPTIONS.map(o => o.fullPath)
    expect(paths.filter((p, i) => paths.indexOf(p) !== i)).toEqual([])
  })
})

const generatedScheme = JSON.parse(readFileSync(path.join(import.meta.dirname, "../../packages/app-builder-lib/scheme.json"), "utf8"))

describe("checkLegacyConfiguration — never rejects a valid v27 config", () => {
  // The guard must not be able to fail a config the schema accepts. Anything guarded here must also
  // be rejected by scheme.json; if a key is ever re-added to v27, this fails instead of the guard
  // silently blocking a legitimate config. scheme.json is checked on its own: validateConfiguration
  // runs the guard first, so it would reject every guarded key whatever the schema says.
  test.each(RESOLVED_LEGACY_CONFIG_OPTIONS.map(o => [o.fullPath, o] as const))("v27 schema also rejects %s", (_fullPath, option) => {
    const config = configWith([...option.parentPath, option.key], "value")
    // a snapcraft.<base> path needs its base selected, or snapcraft is rejected whatever the base options accept
    if (option.parentPath[0] === "snapcraft" && option.parentPath.length > 1) {
      config.snapcraft.base = option.parentPath[1]
    }
    // the key itself is what fails, not the type of the test value
    expect(() => validateSchema(generatedScheme, config)).toThrow(new RegExp(`unknown property '${option.key}'`))
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

  test("a custom signer's union explanation names only the signing options, not other legacy keys of the platform", () => {
    const message = expectRejected({ mac: { sign: "./customSign.js", identity: "Acme (TEAM)", signIgnore: ["x"], mergeASARs: false } })
    expect(message).toContain("single union")
    const unionLine = message.split("\n").find(line => line.includes("is a custom signing function or module path"))
    // signIgnore is neither a moved nor a removed sign field, and still a signing option
    expect(unionLine).toContain("[identity, signIgnore]")
    // mergeASARs is still reported, as a moved universal option
    expect(message).toContain("mac.universal.mergeASARs")
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

  test("vPrefixedTagName is found under every section that holds a publish, as migrate-schema rewrites them", () => {
    for (const section of ["nsis", "nsisWeb", "dmg", "appImage", "snapcraft"]) {
      const config = { [section]: { publish: { provider: "github", owner: "o", repo: "r", vPrefixedTagName: false } } }
      expect(expectRejected(config), section).toContain(`${section}.publish.vPrefixedTagName`)
    }
  })

  test("a removed mas.publish / masDev.publish is reported once, not entry by entry", () => {
    for (const section of ["mas", "masDev"]) {
      const message = expectRejected({ [section]: { publish: { provider: "github", vPrefixedTagName: false, publisherName: ["CN=Acme"] } } })
      expect(message, section).toContain(`\`${section}.publish\` was removed in electron-builder v27.`)
      expect(message, section).toContain("Your configuration uses an option that was removed")
      expect(message, section).not.toContain(`${section}.publish.`)
    }
  })

  test("the root publish value is not a section: a custom provider may have an option named publish", () => {
    const config = { publish: { provider: "custom", publish: { provider: "github", publisherName: ["CN=Acme"], vPrefixedTagName: false } } }
    expect(() => checkLegacyConfiguration(config as any)).not.toThrow()
    expect(() => validateSchema(generatedScheme, config)).not.toThrow()
  })

  test("extraMetadata is free-form package.json metadata, never a publish configuration", () => {
    expect(() => checkLegacyConfiguration({ extraMetadata: { publish: { provider: "github", vPrefixedTagName: false, updaterCacheDirName: "x" } } } as any)).not.toThrow()
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
    ["the legacy", "0.0.0", '"0.0.0"'],
    ["the stock NSIS 3.12", "1.2.1", '"1.2.1"'],
  ] as const)("rejects %s toolsets.nsis bundle, which has no log-enabled variant", (_name, nsis, shown) => {
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
    expect(message).toContain('Remove the `toolsets.nsis` pin (or set it to "latest" or "2.0.4")')
    expect(message.endsWith("https://www.electron.build/docs/migration/v27-config-changes#customnsisbinary-and-customnsisresources-replaced-by-toolsetsnsis")).toBe(true)
  })

  test.each([
    ["unset (the default bundle)", undefined],
    ['"latest"', "latest"],
    ['"2.0.4"', "2.0.4"],
  ] as const)("accepts %s toolsets.nsis, which has a log-enabled bundle", (_name, nsis) => {
    expect(() => assertInstallerDebugLoggingSupported(nsis, "nsis")).not.toThrow()
  })

  test("accepts a custom toolsets.nsis bundle", () => {
    expect(() => assertInstallerDebugLoggingSupported({ url: "file:///opt/nsis-log" }, "nsis")).not.toThrow()
  })
})

describe("options that never had an effect on msiWrapped and msix", () => {
  test("msiWrapped.oneClick: false explains what it still did", () => {
    const message = expectRejected({ msiWrapped: { oneClick: false } })
    expect(message).toContain("nsis.oneClick")
    expect(message).toContain("WixUIExtension")
    expect(message).toContain("additionalLightArgs")
  })

  test.each([
    ["oneClick", false],
    ["perMachine", true],
    ["runAfterFinish", false],
    ["createDesktopShortcut", "always"],
    ["createStartMenuShortcut", false],
    ["menuCategory", "Acme"],
    ["shortcutName", "App"],
  ])("scheme.json rejects msiWrapped.%s, which msi and nsis still accept", (key, value) => {
    expect(() => validateSchema(generatedScheme, { msiWrapped: { [key]: value } })).toThrow(key)
    expect(() => validateSchema(generatedScheme, { msi: { [key]: value }, nsis: { [key]: value } })).not.toThrow()
  })

  test("scheme.json rejects msix.electronUpdaterAware, which appx still accepts", () => {
    expect(() => validateSchema(generatedScheme, { msix: { electronUpdaterAware: true } })).toThrow("electronUpdaterAware")
    expect(() => validateSchema(generatedScheme, { appx: { electronUpdaterAware: true } })).not.toThrow()
  })
})

describe("options Mac App Store builds never read, and the Helper EH / NP bundle ids", () => {
  const masOptions = {
    appId: "com.example.mas",
    artifactName: "${productName}-mas.${ext}",
    asar: { unpack: ["**/*.node"] },
    asarIntegrityDigest: false,
    bundleShortVersion: "1.0",
    bundleVersion: "1",
    category: "public.app-category.games",
    extendInfo: { NSCameraUsageDescription: "camera" },
    fileOptions: { files: ["dist/**"] },
    forceCodeSigning: true,
    helperBundleId: "com.example.mas.helper",
    helperGPUBundleId: "com.example.mas.gpu",
    helperPluginBundleId: "com.example.mas.plugin",
    helperRendererBundleId: "com.example.mas.renderer",
    minimumSystemVersion: "13.0",
    sign: { identity: "Acme (TEAM)", entitlements: "build/entitlements.mas.plist" },
    universal: { mergeASARs: false },
  }

  test("mas and masDev accept every option a Mac App Store build reads", () => {
    const config = { appId: "com.example.app", mas: masOptions, masDev: masOptions }
    expect(() => checkLegacyConfiguration(config as any)).not.toThrow()
    expect(() => validateSchema(generatedScheme, config)).not.toThrow()
  })

  test("a removed mas certificate option is named without its value", () => {
    const message = expectRejected({ mas: { cscInstallerLink: "s3cr3t-link", cscInstallerKeyPassword: "s3cr3t-password", notarize: true } })
    expect(message).toContain("mas.cscInstallerLink")
    expect(message).toContain("mas.cscInstallerKeyPassword")
    expect(message).toContain("mas.notarize")
    expect(message).toContain("CSC_INSTALLER_LINK")
    expect(message).toContain("v27-config-changes#mas-masdev-options")
    expect(message).not.toContain("s3cr3t")
  })

  test("a removed mas option next to a custom signer is not called a signing option", () => {
    const message = expectRejected({ mas: { sign: "./customSign.js", target: "mas" } })
    expect(message).toContain("mas.target")
    expect(message).toContain("mac.target")
    expect(message).not.toContain("single union")
  })

  test("helperEHBundleId names the Electron version that dropped the helper, and the other helper ids are kept", () => {
    const message = expectRejected({ mac: { helperEHBundleId: "com.example.eh", helperRendererBundleId: "com.example.renderer" } })
    expect(message).toContain("mac.helperEHBundleId")
    expect(message).toContain("Electron 4")
    expect(message).not.toContain("helperRendererBundleId")
  })
})

describe("signing certificates are set per platform", () => {
  test("a root cscLink / cscKeyPassword names both platform options and never its value", () => {
    const message = expectRejected({ cscLink: "s3cr3t-link", cscKeyPassword: "s3cr3t-password" })
    expect(message).toContain("`mac.cscLink` and `win.cscLink`")
    expect(message).toContain("`mac.cscKeyPassword` and `win.cscKeyPassword`")
    expect(message).toContain("WIN_CSC_LINK")
    expect(message).toContain("v27-config-changes#signing-certificates-csclink")
    expect(message).not.toContain("s3cr3t")
  })

  test("linux.cscLink names the Snap Store login", () => {
    const message = expectRejected({ linux: { cscLink: "x", cscKeyPassword: "y" } })
    expect(message).toContain("linux.cscLink")
    expect(message).toContain("linux.cscKeyPassword")
    expect(message).toContain("snapcraft.cscLink")
    expect(message).toContain("SNAP_CSC_LINK")
  })

  test("mac and win accept their certificate options", () => {
    const config = {
      appId: "com.example.app",
      mac: { cscLink: "mac.p12", cscKeyPassword: "p", cscInstallerLink: "installer.p12", cscInstallerKeyPassword: "p" },
      win: { cscLink: "win.pfx", cscKeyPassword: "p" },
    }
    expect(() => checkLegacyConfiguration(config as any)).not.toThrow()
    expect(() => validateSchema(generatedScheme, config)).not.toThrow()
  })
})

describe("snapcraft.<base>.publish / artifactName", () => {
  test.each(["publish", "artifactName"])("scheme.json rejects snapcraft.core24.%s and accepts snapcraft.%s", key => {
    expect(() => validateSchema(generatedScheme, { snapcraft: { base: "core24", core24: { [key]: "x" } } })).toThrow(key)
    expect(() => validateSchema(generatedScheme, { snapcraft: { base: "core24", [key]: "x", core24: { grade: "stable" } } })).not.toThrow()
  })

  test("the guard names where the value is read", () => {
    const message = expectRejected({ snapcraft: { base: "core22", core22: { publish: "github" } } })
    expect(message).toContain("`snapcraft.core22.publish` was replaced by `snapcraft.publish`")
    expect(message).toContain("then `linux.publish`, then the root `publish`")
  })
})

describe("publish options electron-builder writes into app-update.yml itself", () => {
  test.each<[string, unknown, string]>([
    ["updaterCacheDirName", "x", "<sanitized package name>-updater"],
    ["verifyUpdateCodeSignature", false, "win.verifyUpdateCodeSignature: false"],
    ["updateManifestPublicKey", "k", "updateManifest.publicKey"],
    ["publisherName", ["CN=Acme"], 'win.sign.publisherName: ["CN=Acme"]'],
  ])("%s is reported in every section and array entry, with what replaces it", (key, value, replacement) => {
    for (const [config, label] of [
      [{ publish: { provider: "generic", url: "https://example.com/", [key]: value } }, "publish"],
      [{ publish: ["github", { provider: "s3", bucket: "b", [key]: value }] }, "publish"],
      [{ win: { publish: { provider: "github", [key]: value } } }, "win.publish"],
      [{ nsis: { publish: { provider: "generic", url: "https://example.com/", [key]: value } } }, "nsis.publish"],
      [{ appImage: { publish: { provider: "github", [key]: value } } }, "appImage.publish"],
    ] as const) {
      const message = expectRejected(config)
      expect(message).toContain(`\`${label}.${key}\` was removed from the publish options in electron-builder v27`)
      expect(message).toContain(replacement)
      expect(message).toContain("v27-config-changes#publish-options-managed-by-electron-builder")
      // publisherName is not rewritten: only the user can tell which win.sign it belongs in
      expect(message.includes("electron-builder migrate-schema")).toBe(key !== "publisherName")
    }
  })

  test.each<[string, unknown]>([
    ["updaterCacheDirName", "x"],
    ["verifyUpdateCodeSignature", false],
    ["updateManifestPublicKey", "k"],
    ["publisherName", ["CN=Acme"]],
  ])("scheme.json rejects %s on generic, github and s3 entries; a custom provider is left to the app-update.yml writer", (key, value) => {
    for (const entry of [
      { provider: "generic", url: "https://example.com/" },
      { provider: "github", owner: "o", repo: "r" },
      { provider: "s3", bucket: "b" },
    ]) {
      expect(() => validateSchema(generatedScheme, { publish: { ...entry, [key]: value } })).toThrow()
    }
    const custom = { publish: { provider: "custom", [key]: value } }
    expect(() => validateSchema(generatedScheme, custom)).not.toThrow()
    expect(() => checkLegacyConfiguration(custom as any)).not.toThrow()
  })
})

describe("Linux target options that never had an effect", () => {
  test("the fpm package metadata stays valid under linux and on the fpm targets, and deb / rpm / pacman keep their compression", () => {
    const config = {
      appId: "com.example.app",
      linux: { synopsis: "s", maintainer: "Maintainer <m@example.com>", vendor: "v", packageCategory: "utils", icon: "build/icons" },
      deb: { synopsis: "d", packageCategory: "net", compression: "zst" },
      rpm: { compression: "xzmt", packageCategory: "Applications/Internet" },
      pacman: { compression: "zstd" },
      apk: { synopsis: "a", maintainer: "Maintainer <m@example.com>" },
      appImage: { category: "Utility" },
    }
    expect(() => checkLegacyConfiguration(config as any)).not.toThrow()
    expect(() => validateSchema(generatedScheme, config)).not.toThrow()
  })

  test("deb.icon names where Linux icons come from", () => {
    const message = expectRejected({ deb: { icon: "build/icon.png" } })
    expect(message).toContain("`deb.icon` was removed in electron-builder v27.")
    expect(message).toContain("`linux.icon`")
    expect(message).toContain("v27-config-changes#linux-target-options-without-effect")
  })
})
