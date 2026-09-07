import { checkLegacyConfiguration, RESOLVED_LEGACY_CONFIG_OPTIONS, validateConfiguration } from "app-builder-lib/internal"
import { DebugLogger } from "builder-util"
import { describe, expect, test } from "vitest"

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
    expect(expectRejected({ publish: [{ provider: "s3", bucket: "b" }, { provider: "github", owner: "o", repo: "r", vPrefixedTagName: true }] })).toContain("tagNamePrefix")
    expect(expectRejected({ win: { publish: { provider: "github", owner: "o", repo: "r", vPrefixedTagName: false } } })).toContain("win.publish.vPrefixedTagName")
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
