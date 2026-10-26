import { doMergeConfigs } from "app-builder-lib/internal"
import { Configuration } from "electron-builder"
import { readFileSync } from "fs"
import * as path from "path"
import { describe, expect, test } from "vitest"
import {
  FEED_QUERY_ADVISORY,
  FORCE_CODE_SIGNING_ADVISORY,
  INCLUDE_PDB_CHANGES,
  includePdbManualStep,
  MAC_ENTITLEMENTS_ADVISORY,
  migrateConfig,
  NSIS_PER_MACHINE_UPDATE_ADVISORY,
  NSIS_WEB_ADVISORY,
  pdbFilesPatternsAdvisory,
  platformExcludedExtsPdbChange,
  PORTABLE_DEBUG_LOGGING_DROPPED,
  WIN_MISSING_PUBLISHER_NAME_ADVISORY,
  WIN_PUBLISHER_NAME_DN_ADVISORY,
  WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY,
} from "../../packages/electron-builder/src/cli/migrate-schema"

describe("migrateConfig — no-op cases", () => {
  test("already-migrated config produces no changes", () => {
    const input = {
      appId: "com.example.app",
      productName: "My App",
      nativeModules: { npmRebuild: true, rebuildMode: "sequential" },
      asar: { unpack: ["**/*.node"] },
    }
    const result = migrateConfig(input)
    expect(result.modified).toBe(false)
    expect(result.changes).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
    expect(result.migrated).toEqual(input)
  })

  test("empty config produces no changes", () => {
    const result = migrateConfig({})
    expect(result.modified).toBe(false)
    expect(result.migrated).toEqual({})
  })
})

describe("migrateConfig — electronCompile", () => {
  test("removes electronCompile: true", () => {
    const result = migrateConfig({ electronCompile: true, appId: "com.a.b" })
    expect("electronCompile" in result.migrated).toBe(false)
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0].key).toBe("electronCompile")
  })

  test("removes electronCompile: false", () => {
    const result = migrateConfig({ electronCompile: false })
    expect("electronCompile" in result.migrated).toBe(false)
  })
})

describe("migrateConfig — linux.syncDesktopName", () => {
  test("removes linux.syncDesktopName: true (behaviour is now the default)", () => {
    const result = migrateConfig({ linux: { target: "deb", syncDesktopName: true } })
    expect("syncDesktopName" in result.migrated.linux).toBe(false)
    expect(result.migrated.linux.target).toBe("deb")
    expect(result.changes.some(c => c.key === "linux.syncDesktopName")).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  test("removes linux.syncDesktopName: false and warns about the behaviour change", () => {
    const result = migrateConfig({ linux: { syncDesktopName: false } })
    expect("syncDesktopName" in result.migrated.linux).toBe(false)
    expect(result.changes.some(c => c.key === "linux.syncDesktopName")).toBe(true)
    expect(result.warnings.some(w => w.includes("syncDesktopName") && w.includes("desktopName"))).toBe(true)
  })

  test("no-op when linux config has no syncDesktopName", () => {
    const result = migrateConfig({ linux: { target: "deb" } })
    expect(result.modified).toBe(false)
    expect(result.warnings).toHaveLength(0)
  })
})

describe("migrateConfig — framework / nodeVersion / launchUiVersion", () => {
  test("removes all three when present", () => {
    const result = migrateConfig({ framework: "electron", nodeVersion: "current", launchUiVersion: "0.1.0" })
    expect("framework" in result.migrated).toBe(false)
    expect("nodeVersion" in result.migrated).toBe(false)
    expect("launchUiVersion" in result.migrated).toBe(false)
    expect(result.changes).toHaveLength(3)
  })

  test("removes only the keys present", () => {
    const result = migrateConfig({ framework: "electron" })
    expect("framework" in result.migrated).toBe(false)
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0].key).toBe("framework")
  })
})

describe("migrateConfig — disableDefaultIgnoredFiles", () => {
  test("removes the root-level key", () => {
    const result = migrateConfig({ disableDefaultIgnoredFiles: true, appId: "com.a.b" })
    expect("disableDefaultIgnoredFiles" in result.migrated).toBe(false)
    expect(result.migrated.appId).toBe("com.a.b")
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0].key).toBe("disableDefaultIgnoredFiles")
  })

  test("removes the key from every platform config (mac/mas/masDev/win/linux)", () => {
    const result = migrateConfig({
      disableDefaultIgnoredFiles: false,
      mac: { disableDefaultIgnoredFiles: true },
      mas: { disableDefaultIgnoredFiles: true },
      masDev: { disableDefaultIgnoredFiles: true },
      win: { disableDefaultIgnoredFiles: true, target: "nsis" },
      linux: { disableDefaultIgnoredFiles: true },
    })
    expect("disableDefaultIgnoredFiles" in result.migrated).toBe(false)
    for (const platform of ["mac", "mas", "masDev", "win", "linux"]) {
      expect("disableDefaultIgnoredFiles" in result.migrated[platform]).toBe(false)
    }
    expect(result.migrated.win.target).toBe("nsis")
    // root + 5 platforms
    expect(result.changes.filter(c => c.key === "disableDefaultIgnoredFiles")).toHaveLength(6)
  })
})

describe("migrateConfig — includePdb", () => {
  const created = 'moved includePdb: true → fileOptions.excludedExts: ["default", "!pdb"]'
  const appended = 'moved includePdb: true → "!pdb" in fileOptions.excludedExts'
  const unneeded = "removed includePdb (fileOptions.excludedExts already keeps .pdb files)"
  const removed = INCLUDE_PDB_CHANGES.removed
  const overridesParent = INCLUDE_PDB_CHANGES.overridesParent
  const listKeepsPdb = INCLUDE_PDB_CHANGES.listKeepsPdb
  const platformChange = (platform: string) => `added "!pdb" to ${platform}.fileOptions.excludedExts (includePdb: true; a platform-level excludedExts replaces the root one)`

  test('includePdb: true becomes fileOptions.excludedExts: ["default", "!pdb"]', () => {
    const result = migrateConfig({ appId: "com.a.b", includePdb: true })
    expect(result.migrated).toEqual({ appId: "com.a.b", fileOptions: { excludedExts: ["default", "!pdb"] } })
    expect(result.changes).toEqual([{ key: "includePdb", description: created }])
    expect(result.warnings).toHaveLength(0)
    expect(result.modified).toBe(true)
  })

  // v26 validated with ajv `coerceTypes: true`, which reads "false" / 0 / null as false
  // In v26 it overrode an includePdb: true of another config layer, which a single file does not show, so the v27 default is written out.
  test.each([false, null, "false", 0])('includePdb: %j becomes fileOptions.excludedExts: ["default"] without touching a platform list', value => {
    const result = migrateConfig({ appId: "com.a.b", includePdb: value, win: { fileOptions: { excludedExts: ["default"] } } })
    expect(result.migrated).toEqual({ appId: "com.a.b", fileOptions: { excludedExts: ["default"] }, win: { fileOptions: { excludedExts: ["default"] } } })
    expect(result.changes).toEqual([{ key: "includePdb", description: overridesParent }])
    expect(result.warnings).toHaveLength(0)
    expect(result.modified).toBe(true)
  })

  // and "true" / 1 as true
  test.each(["true", 1])("includePdb: %j migrates like true", value => {
    const result = migrateConfig({ includePdb: value, win: { fileOptions: { excludedExts: ["default"] } } })
    expect(result.migrated).toEqual({ fileOptions: { excludedExts: ["default", "!pdb"] }, win: { fileOptions: { excludedExts: ["default", "!pdb"] } } })
    expect(result.changes.map(c => c.description)).toEqual([created, platformChange("win")])
  })

  // v26 rejected any other value; keeping it makes the build guard report it
  test.each<unknown>(["yes", "TRUE", 2, [true], { value: true }])("includePdb: %j, which v26 rejected, is kept with a warning", value => {
    const input = { includePdb: value, extends: "./base.json" }
    const result = migrateConfig(structuredClone(input))
    expect(result.migrated).toEqual(input)
    expect(result.modified).toBe(false)
    expect(result.changes).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('includePdb is not a boolean (v26 accepted true / false, "true" / "false", 1 / 0 and null), so it was left in place.')
  })

  test.each<[string, unknown, unknown]>([
    ["a file", false, "./base.json"],
    ["a list of files", "false", ["./a.json", "./b.json"]],
    ["a file (null)", null, "./base.json"],
    ["a preset (0)", 0, "react-cra"],
    ["nothing (extends: null)", false, null],
  ])('includePdb: false in a config that extends %s becomes excludedExts: ["default"] as well', (_name, value, parent) => {
    const result = migrateConfig({ extends: parent, includePdb: value, files: ["dist/**"], win: { fileOptions: { excludedExts: ["default"] } } })
    expect(result.migrated).toEqual({ extends: parent, fileOptions: { files: ["dist/**"], excludedExts: ["default"] }, win: { fileOptions: { excludedExts: ["default"] } } })
    expect(result.changes.map(c => c.description)).toEqual(["moved files → fileOptions.files", overridesParent])
    expect(result.warnings).toHaveLength(0)
  })

  // v26 merged a later entry of an extends list over an earlier one, so release.json's false beat base.json's true; release.json has no
  // extends of its own, so only the written-out ["default"] (a later excludedExts replaces an earlier one) keeps that.
  test('includePdb: false in a config listed after another in an extends list becomes excludedExts: ["default"], which still overrides that one\'s includePdb: true', () => {
    const base = migrateConfig({ includePdb: true }).migrated
    const release = migrateConfig({ includePdb: false })
    expect(release.migrated).toEqual({ fileOptions: { excludedExts: ["default"] } })
    expect(release.changes).toEqual([{ key: "includePdb", description: overridesParent }])
    const child = migrateConfig({ extends: ["./base.json", "./release.json"] }).migrated
    const merge = (...configs: Record<string, any>[]) => doMergeConfigs(configs as Configuration[]).fileOptions?.excludedExts
    expect(merge(base, release.migrated, child)).toEqual(["default"])
    // removed instead, the base's list would keep .pdb files
    expect(merge(base, {}, child)).toEqual(["default", "!pdb"])
  })

  test.each<[string, string[] | string | null, string[] | string, string]>([
    ["an existing list is kept, since it already replaces another layer's", ["default", "map"], ["default", "map"], removed],
    // the list ships .pdb files, which the description says instead of "excluded by default"
    ["a list without .pdb files is kept", ["map"], ["map"], listKeepsPdb],
    ["an empty list is kept", [], [], listKeepsPdb],
    ['a list with "!pdb" is kept', ["default", "!pdb"], ["default", "!pdb"], listKeepsPdb],
    // a single string is a one-entry list
    ["a string list is kept", "default", "default", removed],
    ["a string list without .pdb files is kept", "map", "map", listKeepsPdb],
    ["a null list is replaced", null, ["default"], overridesParent],
  ])("includePdb: false next to a root fileOptions.excludedExts: %s", (_name, list, expected, description) => {
    const result = migrateConfig({ includePdb: false, fileOptions: { excludedExts: list } })
    expect(result.migrated).toEqual({ fileOptions: { excludedExts: expected } })
    expect(result.changes).toEqual([{ key: "includePdb", description }])
  })

  test("includePdb: false is kept with a warning when fileOptions is not an object", () => {
    const input = { includePdb: false, fileOptions: ["x"] }
    const result = migrateConfig(structuredClone(input))
    expect(result.migrated).toEqual(input)
    expect(result.warnings).toEqual([`fileOptions is not an object; ${includePdbManualStep(false)}`])
    expect(result.warnings[0]).toContain('replace includePdb: false with fileOptions.excludedExts: ["default"] manually')
  })

  test("joins the fileOptions the flat keys move into, or an existing (or null) fileOptions", () => {
    const withFiles = migrateConfig({ includePdb: true, files: ["dist/**"] })
    expect(withFiles.migrated).toEqual({ fileOptions: { files: ["dist/**"], excludedExts: ["default", "!pdb"] } })
    expect(withFiles.changes.map(c => c.description)).toEqual(["moved files → fileOptions.files", created])
    expect(migrateConfig({ includePdb: true, extraFiles: ["e"], fileOptions: { files: ["dist/**"] } }).migrated).toEqual({
      fileOptions: { files: ["dist/**"], extraFiles: ["e"], excludedExts: ["default", "!pdb"] },
    })
    expect(migrateConfig({ includePdb: true, fileOptions: null }).migrated).toEqual({ fileOptions: { excludedExts: ["default", "!pdb"] } })
  })

  test.each<[string, string[] | string | null, string[] | string, string]>([
    ['a list with "default" gets "!pdb"', ["default", "map"], ["default", "map", "!pdb"], appended],
    // a single string is a one-entry list
    ['a string "default" becomes a list with "!pdb"', "default", ["default", "!pdb"], appended],
    ['a string "pdb" becomes a list with "!pdb"', "pdb", ["pdb", "!pdb"], appended],
    ['a string without "default" already keeps .pdb files', "map", "map", unneeded],
    ['a list with "pdb" gets "!pdb"', ["map", ".pdb"], ["map", ".pdb", "!pdb"], appended],
    ['"!pdb" is not added twice', ["default", "!pdb"], ["default", "!pdb"], unneeded],
    // "!pdb" would only make the build warn that it has no effect
    ['a list without "default" already keeps .pdb files', ["map"], ["map"], unneeded],
    ["an empty list already keeps .pdb files", [], [], unneeded],
    ["a null list is replaced", null, ["default", "!pdb"], created],
  ])("an existing root fileOptions.excludedExts: %s", (_name, list, expected, description) => {
    const result = migrateConfig({ includePdb: true, fileOptions: { excludedExts: list } })
    expect(result.migrated).toEqual({ fileOptions: { excludedExts: expected } })
    expect(result.changes).toEqual([{ key: "includePdb", description }])
  })

  test('"!pdb" is added to each platform-level excludedExts that excludes .pdb files, since it replaces the root one', () => {
    const result = migrateConfig({
      includePdb: true,
      mac: { fileOptions: { excludedExts: ["default"] } },
      mas: { fileOptions: { excludedExts: ["map"] } },
      masDev: { fileOptions: { excludedExts: null } },
      win: { files: ["w/**"], fileOptions: { excludedExts: ["default", "map"] } },
      linux: { fileOptions: { excludedExts: ["default", "!pdb"] } },
    })
    expect(result.migrated).toEqual({
      fileOptions: { excludedExts: ["default", "!pdb"] },
      mac: { fileOptions: { excludedExts: ["default", "!pdb"] } },
      mas: { fileOptions: { excludedExts: ["map"] } },
      masDev: { fileOptions: { excludedExts: null } },
      win: { fileOptions: { files: ["w/**"], excludedExts: ["default", "map", "!pdb"] } },
      linux: { fileOptions: { excludedExts: ["default", "!pdb"] } },
    })
    expect(result.changes.map(c => c.description)).toEqual(["moved win.files → win.fileOptions.files", created, platformChange("mac"), platformChange("win")])
    expect(result.changes.map(c => c.key).slice(2)).toEqual(["mac.fileOptions.excludedExts", "win.fileOptions.excludedExts"])
  })

  test('a platform-level string excludedExts that excludes .pdb files becomes a list with "!pdb"', () => {
    const result = migrateConfig({
      includePdb: true,
      win: { fileOptions: { excludedExts: "default" } },
      linux: { fileOptions: { excludedExts: "map" } },
      mac: { fileOptions: { excludedExts: "!pdb" } },
    })
    expect(result.migrated).toEqual({
      fileOptions: { excludedExts: ["default", "!pdb"] },
      win: { fileOptions: { excludedExts: ["default", "!pdb"] } },
      linux: { fileOptions: { excludedExts: "map" } },
      mac: { fileOptions: { excludedExts: "!pdb" } },
    })
    expect(result.changes.map(c => c.description)).toEqual([created, platformChange("win")])
    expect(result.warnings).toHaveLength(0)
  })

  test.each<[string, Record<string, any>]>([
    ["fileOptions is not an object", { includePdb: true, fileOptions: ["x"] }],
    ["fileOptions.excludedExts is not a string or an array", { includePdb: true, fileOptions: { excludedExts: { ext: "pdb" } } }],
  ])("includePdb: true is kept with a warning when %s", (problem, input) => {
    const result = migrateConfig(structuredClone(input))
    expect(result.migrated).toEqual(input)
    expect(result.modified).toBe(false)
    expect(result.warnings).toEqual([`${problem}; replace includePdb: true with fileOptions.excludedExts: ["default", "!pdb"] manually.`])
  })

  test('includePdb: true kept next to a root list it cannot migrate still adds "!pdb" to a platform list, which replaces the root one', () => {
    const input = { includePdb: true, fileOptions: { excludedExts: { ext: "pdb" } }, win: { fileOptions: { excludedExts: ["default"] } } }
    const result = migrateConfig(structuredClone(input))
    expect(result.migrated).toEqual({ ...input, win: { fileOptions: { excludedExts: ["default", "!pdb"] } } })
    expect(result.changes).toEqual([platformExcludedExtsPdbChange("win")])
    expect(result.warnings).toEqual(['fileOptions.excludedExts is not a string or an array; replace includePdb: true with fileOptions.excludedExts: ["default", "!pdb"] manually.'])
    expect(migrateConfig(result.migrated).changes).toHaveLength(0)
  })

  test("a second run makes no changes", () => {
    const first = migrateConfig({ includePdb: true, files: ["dist/**"], win: { fileOptions: { excludedExts: ["default"] } } })
    const second = migrateConfig(first.migrated)
    expect(second.modified).toBe(false)
    expect(second.changes).toHaveLength(0)
    expect(second.warnings).toHaveLength(0)
    expect(second.migrated).toEqual(first.migrated)
  })
})

// v26 excluded .pdb files whatever `files` said unless includePdb was true; in v27 a pattern that names them includes the ones it matches,
// also in a config that extends this one (e.g. a release layer migrated from includePdb: false).
describe("migrateConfig — files patterns that name .pdb files", () => {
  test("the advisory names each pattern with the key that sets it", () => {
    const patterns = [
      { key: "fileOptions.files", pattern: "native/*.pdb" },
      { key: "win.fileOptions.files", pattern: "**/*.{node,pdb}" },
    ]
    expect(pdbFilesPatternsAdvisory(patterns)).toBe(
      'files patterns that name .pdb files detected: fileOptions.files "native/*.pdb", win.fileOptions.files "**/*.{node,pdb}". ' +
        "In v27 such a pattern ships the .pdb files it matches (v26 excluded .pdb files whatever files said, unless includePdb was true), also in configs that extend this one. " +
        'To keep them out, remove the pattern, or add a negation after it, such as "!native/*.pdb". ' +
        "See https://www.electron.build/docs/migration/v27-config-changes#includepdb-fileoptionsexcludedexts"
    )
  })

  test.each<[string, Record<string, any>, Array<{ key: string; pattern: string }>]>([
    ["a debug base with includePdb: true", { includePdb: true, files: ["**/*", "native/*.pdb"] }, [{ key: "fileOptions.files", pattern: "native/*.pdb" }]],
    [
      "a flat files key next to includePdb: false",
      { extends: "./base.json", includePdb: false, files: ["**/*", "native/*.pdb"] },
      [{ key: "fileOptions.files", pattern: "native/*.pdb" }],
    ],
    ["a brace alternative, without includePdb", { files: ["dist/**/*", "native/*.{node,pdb}"] }, [{ key: "fileOptions.files", pattern: "native/*.{node,pdb}" }]],
    ["a single string", { files: "**/*.pdb", asarUnpack: "x" }, [{ key: "fileOptions.files", pattern: "**/*.pdb" }]],
    [
      "platform keys, and the filter of a FileSet without from or with from '.'",
      {
        npmRebuild: false,
        linux: { files: { filter: "*.pdb" } },
        mac: { entitlements: "build/e.plist", files: [{ filter: ["**/*.pdb", "!x.pdb"] }, { from: "native", filter: "*.pdb" }] },
        win: { fileOptions: { files: [{ from: ".", to: "x", filter: "addon.pdb" }, "**/*"] } },
      },
      [
        { key: "mac.fileOptions.files", pattern: "**/*.pdb" },
        { key: "win.fileOptions.files", pattern: "addon.pdb" },
        { key: "linux.fileOptions.files", pattern: "*.pdb" },
      ],
    ],
    [
      "a FileSet whose from is the app directory spelled './', '' or './.'",
      { files: [{ from: "./", filter: "a.pdb" }], win: { files: [{ from: "", filter: ["b.pdb"] }] }, linux: { files: [{ from: "./.", filter: "c.pdb" }] } },
      [
        { key: "fileOptions.files", pattern: "a.pdb" },
        { key: "win.fileOptions.files", pattern: "b.pdb" },
        { key: "linux.fileOptions.files", pattern: "c.pdb" },
      ],
    ],
  ])("%s is advised", (_name, input, patterns) => {
    const result = migrateConfig(input)
    expect(result.modified).toBe(true)
    expect(result.advisories).toEqual([pdbFilesPatternsAdvisory(patterns)])
  })

  test("an advisory alone does not modify a migrated config", () => {
    const input = { fileOptions: { files: ["**/*", "native/*.pdb"], excludedExts: ["default"] } }
    const result = migrateConfig(structuredClone(input))
    expect(result.migrated).toEqual(input)
    expect(result.modified).toBe(false)
    expect(result.changes).toHaveLength(0)
    expect(result.advisories).toEqual([pdbFilesPatternsAdvisory([{ key: "fileOptions.files", pattern: "native/*.pdb" }])])
  })

  test.each<[string, Record<string, any>]>([
    ["a negation", { files: ["**/*", "!**/*.pdb", "!native/*.{node,pdb}"] }],
    ["another extension", { files: ["**/*", "**/*.pdbx", "**/*.d.ts", "native/**"] }],
    ["a FileSet from another directory", { files: [{ from: "native", filter: ["*.pdb"] }] }],
    ["extraResources", { fileOptions: { extraResources: ["*.pdb"], extraFiles: [{ from: ".", filter: "*.pdb" }] } }],
    // the flat key is dropped, since fileOptions.files is also set
    ["a flat files key next to fileOptions.files", { files: ["native/*.pdb"], fileOptions: { files: ["**/*"] } }],
    // the flat key is kept with a warning
    ["a fileOptions that is not an object", { files: ["native/*.pdb"], fileOptions: ["x"] }],
  ])("%s is not advised", (_name, input) => {
    expect(migrateConfig(input).advisories).toHaveLength(0)
  })
})

describe("migrateConfig — nativeModules grouping", () => {
  test("moves buildDependenciesFromSource under nativeModules", () => {
    const result = migrateConfig({ buildDependenciesFromSource: true })
    expect("buildDependenciesFromSource" in result.migrated).toBe(false)
    expect(result.migrated.nativeModules).toEqual({ buildDependenciesFromSource: true })
    expect(result.changes.some(c => c.key === "buildDependenciesFromSource")).toBe(true)
  })

  test("moves nodeGypRebuild under nativeModules", () => {
    const result = migrateConfig({ nodeGypRebuild: false })
    expect(result.migrated.nativeModules).toEqual({ nodeGypRebuild: false })
  })

  test("moves npmRebuild under nativeModules", () => {
    const result = migrateConfig({ npmRebuild: true })
    expect(result.migrated.nativeModules).toEqual({ npmRebuild: true })
  })

  test("renames nativeRebuilder → nativeModules.rebuildMode", () => {
    const result = migrateConfig({ nativeRebuilder: "parallel" })
    expect("nativeRebuilder" in result.migrated).toBe(false)
    expect(result.migrated.nativeModules).toEqual({ rebuildMode: "parallel" })
    expect(result.changes.some(c => c.key === "nativeRebuilder")).toBe(true)
  })

  test("groups all four in one pass", () => {
    const result = migrateConfig({
      buildDependenciesFromSource: true,
      nodeGypRebuild: false,
      npmRebuild: true,
      nativeRebuilder: "sequential",
    })
    expect(result.migrated.nativeModules).toEqual({
      buildDependenciesFromSource: true,
      nodeGypRebuild: false,
      npmRebuild: true,
      rebuildMode: "sequential",
    })
    expect(["buildDependenciesFromSource", "nodeGypRebuild", "npmRebuild"] as const).toSatisfy((keys: readonly string[]) => keys.every(k => !(k in result.migrated)))
  })

  test("merges with existing nativeModules", () => {
    const result = migrateConfig({ npmRebuild: false, nativeModules: { rebuildMode: "parallel" } })
    expect(result.migrated.nativeModules).toEqual({ rebuildMode: "parallel", npmRebuild: false })
  })

  test("npmSkipBuildFromSource → buildDependenciesFromSource → nativeModules", () => {
    const result = migrateConfig({ npmSkipBuildFromSource: true })
    // npmSkipBuildFromSource: true means skip, so buildDependenciesFromSource = false
    expect("npmSkipBuildFromSource" in result.migrated).toBe(false)
    expect(result.migrated.nativeModules).toEqual({ buildDependenciesFromSource: false })
  })

  test("npmSkipBuildFromSource: false → buildDependenciesFromSource: true", () => {
    const result = migrateConfig({ npmSkipBuildFromSource: false })
    expect(result.migrated.nativeModules).toEqual({ buildDependenciesFromSource: true })
  })
})

describe("migrateConfig — asar legacy keys", () => {
  test("renames asar-unpack → asar.unpack", () => {
    const result = migrateConfig({ "asar-unpack": "**/*.node" })
    expect("asar-unpack" in result.migrated).toBe(false)
    expect("asarUnpack" in result.migrated).toBe(false)
    expect(result.migrated.asar?.unpack).toBe("**/*.node")
  })

  test("renames asar-unpack-dir → asar.unpack", () => {
    const result = migrateConfig({ "asar-unpack-dir": "resources/**" })
    expect("asar-unpack-dir" in result.migrated).toBe(false)
    expect("asarUnpack" in result.migrated).toBe(false)
    expect(result.migrated.asar?.unpack).toBe("resources/**")
  })

  test("merges asar-unpack and asar-unpack-dir into asar.unpack array", () => {
    const result = migrateConfig({ "asar-unpack": "**/*.node", "asar-unpack-dir": "resources/**" })
    expect("asarUnpack" in result.migrated).toBe(false)
    expect(result.migrated.asar?.unpack).toEqual(["**/*.node", "resources/**"])
  })

  test("moves legacy asar.unpack to asar.unpack (round-trip idempotent)", () => {
    const result = migrateConfig({ asar: { unpack: "**/*.node" } })
    expect("asarUnpack" in result.migrated).toBe(false)
    expect(result.migrated.asar?.unpack).toBe("**/*.node")
  })

  test("moves asar.unpackDir → asar.unpack", () => {
    const result = migrateConfig({ asar: { unpackDir: "resources/**" } })
    expect("asarUnpack" in result.migrated).toBe(false)
    expect(result.migrated.asar?.unpack).toBe("resources/**")
  })

  test("preserves other asar fields when moving unpack", () => {
    const result = migrateConfig({ asar: { unpack: "**/*.node", smartUnpack: true } })
    expect("asarUnpack" in result.migrated).toBe(false)
    expect(result.migrated.asar).toEqual({ smartUnpack: true, unpack: "**/*.node" })
  })

  test("merges legacy asar-unpack with existing asarUnpack into asar.unpack", () => {
    const result = migrateConfig({ "asar-unpack": "**/*.node", asarUnpack: ["existing/**"] })
    expect("asarUnpack" in result.migrated).toBe(false)
    expect(result.migrated.asar?.unpack).toEqual(["existing/**", "**/*.node"])
  })
})

describe("migrateConfig — appImage.systemIntegration", () => {
  test("removes appImage.systemIntegration", () => {
    const result = migrateConfig({ appImage: { systemIntegration: "ask", summary: "My App" } })
    expect("systemIntegration" in result.migrated.appImage).toBe(false)
    expect(result.migrated.appImage).toEqual({ summary: "My App" })
    expect(result.changes.some(c => c.key === "appImage.systemIntegration")).toBe(true)
  })

  test("removes entire appImage when systemIntegration is only key", () => {
    const result = migrateConfig({ appImage: { systemIntegration: "ask" } })
    expect("appImage" in result.migrated).toBe(false)
  })
})

describe("migrateConfig — snap → snapcraft", () => {
  test("nests options under the explicit base and removes snap", () => {
    const result = migrateConfig({ snap: { summary: "My App", confinement: "strict", base: "core22" } })
    expect("snap" in result.migrated).toBe(false)
    expect(result.migrated.snapcraft).toEqual({
      base: "core22",
      core22: { summary: "My App", confinement: "strict" },
    })
    expect(result.warnings).toHaveLength(0)
    expect(result.changes.some(c => c.key === "snap")).toBe(true)
  })

  test("defaults base to core20 and warns when base is absent", () => {
    const result = migrateConfig({ snap: { summary: "My App" } })
    expect(result.migrated.snapcraft).toEqual({
      base: "core20",
      core20: { summary: "My App" },
    })
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain("core20")
  })

  test("base: custom is moved verbatim without per-base nesting", () => {
    const result = migrateConfig({ snap: { base: "custom", yaml: { name: "my-snap" } } })
    expect(result.migrated.snapcraft).toEqual({ base: "custom", yaml: { name: "my-snap" } })
    expect(result.warnings).toHaveLength(0)
  })

  test("unrecognized base falls back to core20 with a warning", () => {
    const result = migrateConfig({ snap: { base: "core99", summary: "x" } })
    expect(result.migrated.snapcraft).toEqual({ base: "core20", core20: { summary: "x" } })
    expect(result.warnings[0]).toContain("unrecognized base")
  })

  test("merges into an existing snapcraft block", () => {
    const result = migrateConfig({ snap: { summary: "My App", base: "core22" }, snapcraft: { base: "core22", core22: { confinement: "strict" } } })
    expect(result.migrated.snapcraft).toEqual({
      base: "core22",
      core22: { confinement: "strict", summary: "My App" },
    })
  })
})

describe("migrateConfig — helper-bundle-id", () => {
  test("moves helper-bundle-id into mac.helperBundleId", () => {
    const result = migrateConfig({ "helper-bundle-id": "com.example.helper" })
    expect("helper-bundle-id" in result.migrated).toBe(false)
    expect(result.migrated.mac).toEqual({ helperBundleId: "com.example.helper" })
    expect(result.changes.some(c => c.key === "helper-bundle-id")).toBe(true)
  })

  test("does not overwrite an existing mac.helperBundleId", () => {
    const result = migrateConfig({ "helper-bundle-id": "com.old.helper", mac: { helperBundleId: "com.new.helper", category: "public.app-category.utilities" } })
    expect(result.migrated.mac).toEqual({ helperBundleId: "com.new.helper", category: "public.app-category.utilities" })
  })
})

describe("migrateConfig — squirrelWindows.noMsi", () => {
  test("inverts noMsi: true → msi: false", () => {
    const result = migrateConfig({ squirrelWindows: { noMsi: true } })
    expect("noMsi" in result.migrated.squirrelWindows).toBe(false)
    expect(result.migrated.squirrelWindows.msi).toBe(false)
    expect(result.changes.some(c => c.key === "squirrelWindows.noMsi")).toBe(true)
  })

  test("inverts noMsi: false → msi: true", () => {
    const result = migrateConfig({ squirrelWindows: { noMsi: false } })
    expect(result.migrated.squirrelWindows.msi).toBe(true)
  })

  test("does not overwrite an existing msi value", () => {
    const result = migrateConfig({ squirrelWindows: { noMsi: true, msi: true } })
    expect(result.migrated.squirrelWindows.msi).toBe(true)
    expect("noMsi" in result.migrated.squirrelWindows).toBe(false)
  })
})

describe("migrateConfig — GitHub vPrefixedTagName", () => {
  test("replaces vPrefixedTagName: false with tagNamePrefix: ''", () => {
    const result = migrateConfig({
      publish: { provider: "github", vPrefixedTagName: false },
    })
    expect(result.migrated.publish).toEqual({ provider: "github", tagNamePrefix: "" })
    expect(result.changes.some(c => c.key.includes("vPrefixedTagName"))).toBe(true)
  })

  test("replaces vPrefixedTagName: true with tagNamePrefix: 'v'", () => {
    const result = migrateConfig({
      publish: { provider: "github", vPrefixedTagName: true },
    })
    expect(result.migrated.publish).toEqual({ provider: "github", tagNamePrefix: "v" })
  })

  test("preserves vPrefixedTagName on gitlab entries (still functional in v27)", () => {
    const result = migrateConfig({
      publish: { provider: "gitlab", vPrefixedTagName: false },
    })
    // GitLab keeps vPrefixedTagName — it must not be stripped (no tagNamePrefix equivalent on GitLab),
    // otherwise the migrator would silently flip tags from "1.2.3" to "v1.2.3".
    expect(result.migrated.publish).toEqual({ provider: "gitlab", vPrefixedTagName: false })
  })

  test("handles publish as array", () => {
    const result = migrateConfig({
      publish: [
        { provider: "github", vPrefixedTagName: false },
        { provider: "s3", bucket: "my-bucket" },
      ],
    })
    expect(result.migrated.publish[0]).toEqual({ provider: "github", tagNamePrefix: "" })
    expect(result.migrated.publish[1]).toEqual({ provider: "s3", bucket: "my-bucket" })
  })

  test("handles publish nested in mac config", () => {
    const result = migrateConfig({
      mac: { publish: { provider: "github", vPrefixedTagName: false } },
    })
    expect(result.migrated.mac.publish).toEqual({ provider: "github", tagNamePrefix: "" })
  })

  test("ignores publish entries without vPrefixedTagName", () => {
    const result = migrateConfig({
      publish: { provider: "github", owner: "me", repo: "myapp" },
    })
    expect(result.modified).toBe(false)
  })
})

describe("migrateConfig — win.sign unification", () => {
  test("moves win.azureSignOptions into win.sign: { type: 'azure' }", () => {
    const result = migrateConfig({
      win: {
        azureSignOptions: {
          endpoint: "https://weu.codesigning.azure.net/",
          codeSigningAccountName: "my-account",
          certificateProfileName: "my-profile",
          publisherName: "CN=My Company",
        },
      },
    })
    expect(result.migrated.win.azureSignOptions).toBeUndefined()
    expect(result.migrated.win.sign).toEqual({
      type: "azure",
      endpoint: "https://weu.codesigning.azure.net/",
      codeSigningAccountName: "my-account",
      certificateProfileName: "my-profile",
      publisherName: "CN=My Company",
    })
    expect(result.changes.some(c => c.key === "win.azureSignOptions")).toBe(true)
    expect(result.modified).toBe(true)
  })

  test("moves extra azure index-signature keys into additionalMetadata", () => {
    const result = migrateConfig({
      win: {
        azureSignOptions: {
          endpoint: "https://weu.codesigning.azure.net/",
          codeSigningAccountName: "my-account",
          certificateProfileName: "my-profile",
          publisherName: "CN=My Company",
          ExcludeCredentials: "ManagedIdentityCredential",
          CorrelationId: "my-build-id",
        },
      },
    })
    expect(result.migrated.win.sign).toMatchObject({
      type: "azure",
      additionalMetadata: {
        ExcludeCredentials: "ManagedIdentityCredential",
        CorrelationId: "my-build-id",
      },
    })
    expect("ExcludeCredentials" in result.migrated.win.sign).toBe(false)
  })

  test("moves win.signtoolOptions into win.sign: { type: 'signtool' }", () => {
    const result = migrateConfig({
      win: {
        signtoolOptions: {
          certificateFile: "C:\\certs\\my.pfx",
          certificatePassword: "secret",
          signingHashAlgorithms: ["sha256"],
        },
      },
    })
    expect(result.migrated.win.signtoolOptions).toBeUndefined()
    expect(result.migrated.win.sign).toEqual({
      type: "signtool",
      certificateFile: "C:\\certs\\my.pfx",
      certificatePassword: "secret",
      signingHashAlgorithms: ["sha256"],
    })
    expect(result.changes.some(c => c.key === "win.signtoolOptions")).toBe(true)
    expect(result.modified).toBe(true)
  })

  test("replaces win.signExecutable: false with win.sign: false", () => {
    const result = migrateConfig({ win: { signExecutable: false } })
    expect(result.migrated.win.signExecutable).toBeUndefined()
    expect(result.migrated.win.sign).toBe(false)
    expect(result.changes.some(c => c.key === "win.signExecutable")).toBe(true)
  })

  test("removes win.signExecutable: true (no-op value)", () => {
    const result = migrateConfig({ win: { signExecutable: true } })
    expect(result.migrated.win.signExecutable).toBeUndefined()
    expect("sign" in result.migrated.win).toBe(false)
    expect(result.changes.some(c => c.key === "win.signExecutable")).toBe(true)
  })

  test("removes win.signAndEditExecutable: true (no-op value)", () => {
    const result = migrateConfig({ win: { signAndEditExecutable: true } })
    expect(result.migrated.win.signAndEditExecutable).toBeUndefined()
    expect(result.changes.some(c => c.key === "win.signAndEditExecutable")).toBe(true)
  })

  test("warns when win.signAndEditExecutable is false (no equivalent in v27)", () => {
    const result = migrateConfig({ win: { signAndEditExecutable: false } })
    expect(result.migrated.win.signAndEditExecutable).toBeUndefined()
    expect(result.warnings.some(w => w.includes("signAndEditExecutable"))).toBe(true)
  })

  test("warns when both azureSignOptions and signtoolOptions are present", () => {
    const result = migrateConfig({
      win: {
        azureSignOptions: { endpoint: "https://weu.codesigning.azure.net/", codeSigningAccountName: "a", certificateProfileName: "p", publisherName: "CN=Me" },
        signtoolOptions: { certificateFile: "my.pfx" },
      },
    })
    expect(result.warnings.some(w => w.includes("signtoolOptions"))).toBe(true)
    expect(result.migrated.win.sign?.type).toBe("azure")
    expect(result.migrated.win.signtoolOptions).toBeUndefined()
  })

  test("no-op when win.sign is already set and azureSignOptions is absent", () => {
    const result = migrateConfig({ win: { sign: { type: "azure", endpoint: "https://e", codeSigningAccountName: "a", certificateProfileName: "p", publisherName: "CN=Me" } } })
    expect(result.modified).toBe(false)
  })
})

describe("migrateConfig — full migration (multiple changes at once)", () => {
  test("applies all transformations in one pass", () => {
    const input = {
      electronCompile: true,
      framework: "electron",
      nodeVersion: "current",
      npmSkipBuildFromSource: false,
      nodeGypRebuild: false,
      npmRebuild: true,
      nativeRebuilder: "sequential",
      "asar-unpack": "**/*.node",
      asar: { unpackDir: "resources/**" },
      appImage: { systemIntegration: "ask" },
      publish: { provider: "github", vPrefixedTagName: false },
    }
    const result = migrateConfig(input)
    expect("electronCompile" in result.migrated).toBe(false)
    expect("framework" in result.migrated).toBe(false)
    expect("nodeVersion" in result.migrated).toBe(false)
    expect("npmSkipBuildFromSource" in result.migrated).toBe(false)
    expect(result.migrated.nativeModules).toMatchObject({
      buildDependenciesFromSource: true,
      nodeGypRebuild: false,
      npmRebuild: true,
      rebuildMode: "sequential",
    })
    expect("asarUnpack" in result.migrated).toBe(false)
    expect(result.migrated.asar?.unpack).toEqual(["**/*.node", "resources/**"])
    expect("appImage" in result.migrated).toBe(false)
    expect(result.migrated.publish).toEqual({ provider: "github", tagNamePrefix: "" })
    expect(result.modified).toBe(true)
  })
})

describe("migrateConfig — asar consolidation", () => {
  test("moves root-level asarUnpack → asar.unpack", () => {
    const result = migrateConfig({ asarUnpack: "**/*.node" })
    expect("asarUnpack" in result.migrated).toBe(false)
    expect(result.migrated.asar).toEqual({ unpack: "**/*.node" })
    expect(result.changes.some(c => c.key === "asarUnpack")).toBe(true)
  })

  test("merges asarUnpack into existing asar object", () => {
    const result = migrateConfig({ asar: { smartUnpack: false }, asarUnpack: "**/*.node" })
    expect("asarUnpack" in result.migrated).toBe(false)
    expect(result.migrated.asar).toEqual({ smartUnpack: false, unpack: "**/*.node" })
  })

  test("moves disableSanityCheckAsar → asar.disableSanityCheck", () => {
    const result = migrateConfig({ disableSanityCheckAsar: true })
    expect("disableSanityCheckAsar" in result.migrated).toBe(false)
    expect(result.migrated.asar).toEqual({ disableSanityCheck: true })
    expect(result.changes.some(c => c.key === "disableSanityCheckAsar")).toBe(true)
  })

  test("moves disableAsarIntegrity → asar.disableIntegrity", () => {
    const result = migrateConfig({ disableAsarIntegrity: true })
    expect("disableAsarIntegrity" in result.migrated).toBe(false)
    expect(result.migrated.asar).toEqual({ disableIntegrity: true })
    expect(result.changes.some(c => c.key === "disableAsarIntegrity")).toBe(true)
  })

  test("replaces asar: true with absent asar key when no sub-fields", () => {
    const result = migrateConfig({ asar: true })
    expect("asar" in result.migrated).toBe(false)
    expect(result.changes.some(c => c.key === "asar")).toBe(true)
  })

  test("replaces asar: true with asar object when sub-fields are present", () => {
    const result = migrateConfig({ asar: true, asarUnpack: "**/*.node" })
    expect("asarUnpack" in result.migrated).toBe(false)
    expect(result.migrated.asar).toEqual({ unpack: "**/*.node" })
  })

  test("drops the no-op root keys when asar: false (they would fail v27 validation)", () => {
    const result = migrateConfig({ asar: false, asarUnpack: "**/*.node", disableSanityCheckAsar: true })
    expect(result.migrated).toEqual({ asar: false })
    expect(result.changes.map(c => c.key)).toEqual(["asarUnpack", "disableSanityCheckAsar"])
  })

  test("consolidates all three properties together", () => {
    const result = migrateConfig({
      asar: { ordering: "order.txt" },
      asarUnpack: "**/*.node",
      disableSanityCheckAsar: true,
      disableAsarIntegrity: true,
    })
    expect("asarUnpack" in result.migrated).toBe(false)
    expect("disableSanityCheckAsar" in result.migrated).toBe(false)
    expect("disableAsarIntegrity" in result.migrated).toBe(false)
    expect(result.migrated.asar).toEqual({
      ordering: "order.txt",
      unpack: "**/*.node",
      disableSanityCheck: true,
      disableIntegrity: true,
    })
  })
})

describe("migrateConfig — mac signing consolidation", () => {
  test("moves identity and signing fields into mac.sign", () => {
    const result = migrateConfig({ mac: { identity: "Developer ID Application: X", hardenedRuntime: true, entitlements: "build/e.plist" } })
    expect("identity" in result.migrated.mac).toBe(false)
    expect("hardenedRuntime" in result.migrated.mac).toBe(false)
    expect(result.migrated.mac.sign).toEqual({ identity: "Developer ID Application: X", hardenedRuntime: true, entitlements: "build/e.plist" })
    expect(result.changes.some(c => c.key === "mac.identity")).toBe(true)
  })

  test("moves mac.type → sign.type", () => {
    const result = migrateConfig({ mac: { type: "development" } })
    expect("type" in result.migrated.mac).toBe(false)
    expect(result.migrated.mac.sign).toEqual({ type: "development" })
    expect(result.changes.some(c => c.key === "mac.type")).toBe(true)
  })

  test("renames signIgnore → sign.ignore", () => {
    const result = migrateConfig({ mac: { signIgnore: ["foo", "bar"] } })
    expect("signIgnore" in result.migrated.mac).toBe(false)
    expect(result.migrated.mac.sign).toEqual({ ignore: ["foo", "bar"] })
  })

  test("preserves mac.identity: null as sign.identity: null (skip signing)", () => {
    const result = migrateConfig({ mac: { identity: null } })
    expect(result.migrated.mac.sign).toEqual({ identity: null })
  })

  test("applies to mas and masDev too", () => {
    const result = migrateConfig({ mas: { entitlements: "mas.plist" }, masDev: { hardenedRuntime: false } })
    expect(result.migrated.mas.sign).toEqual({ entitlements: "mas.plist" })
    expect(result.migrated.masDev.sign).toEqual({ hardenedRuntime: false })
  })

  test("warns and does not clobber a custom-signer string sign", () => {
    const result = migrateConfig({ mac: { sign: "./customSign.js", identity: "X" } })
    expect(result.migrated.mac.sign).toBe("./customSign.js")
    expect("identity" in result.migrated.mac).toBe(true) // left for manual resolution
    expect(result.warnings.some(w => w.includes("custom signing"))).toBe(true)
  })

  test("drops a bare sign: null so it does not flip to skip-signing", () => {
    const result = migrateConfig({ mac: { sign: null, target: "dmg" } })
    expect("sign" in result.migrated.mac).toBe(false)
    expect(result.changes.some(c => c.key === "mac.sign")).toBe(true)
  })

  test("does not touch a config that already uses sign object", () => {
    const result = migrateConfig({ mac: { sign: { identity: "X", hardenedRuntime: true } } })
    expect(result.migrated.mac.sign).toEqual({ identity: "X", hardenedRuntime: true })
    expect(result.changes.filter(c => c.key.startsWith("mac.")).length).toBe(0)
  })
})

describe("migrateConfig — mac universal consolidation", () => {
  test("moves mergeASARs / singleArchFiles / x64ArchFiles into mac.universal", () => {
    const result = migrateConfig({ mac: { mergeASARs: true, singleArchFiles: "*.node", x64ArchFiles: "bin/*" } })
    expect("mergeASARs" in result.migrated.mac).toBe(false)
    expect(result.migrated.mac.universal).toEqual({ mergeASARs: true, singleArchFiles: "*.node", x64ArchFiles: "bin/*" })
  })
})

describe("migrateConfig — electronDownload → electronGet", () => {
  test("renames and maps mirror → mirrorOptions.mirror", () => {
    const result = migrateConfig({ electronDownload: { mirror: "https://m.example/" } })
    expect("electronDownload" in result.migrated).toBe(false)
    expect(result.migrated.electronGet).toEqual({ mirrorOptions: { mirror: "https://m.example/" } })
  })

  test("maps isVerifyChecksum: false → unsafelyDisableChecksums: true", () => {
    const result = migrateConfig({ electronDownload: { isVerifyChecksum: false } })
    expect(result.migrated.electronGet).toEqual({ unsafelyDisableChecksums: true })
  })

  test("warns about dropped fields with no v5 equivalent", () => {
    const result = migrateConfig({ electronDownload: { cache: "/c", customDir: "v1", strictSSL: false } })
    expect(result.warnings.some(w => w.includes("cache") && w.includes("customDir"))).toBe(true)
  })
})

describe("migrateConfig — does not mutate input", () => {
  test("original config is not modified", () => {
    const input = { electronCompile: true, buildDependenciesFromSource: true }
    const frozen = JSON.parse(JSON.stringify(input))
    migrateConfig(input)
    expect(input).toEqual(frozen)
  })
})

describe("migrateConfig — nsis-web advisory", () => {
  test("win.target: 'nsis-web' (string) emits an advisory without changing the config", () => {
    const input = { win: { target: "nsis-web" } }
    const result = migrateConfig(input)
    expect(result.modified).toBe(false)
    expect(result.changes).toHaveLength(0)
    expect(result.advisories).toHaveLength(1)
    expect(result.advisories[0]).toMatch(/nsis-web/)
    expect(result.advisories[0]).toMatch(/disableWebInstaller = false/)
    expect(result.migrated).toEqual(input)
  })

  test("win.target: ['nsis', 'nsis-web'] (array) emits an advisory", () => {
    const result = migrateConfig({ win: { target: ["nsis", "nsis-web"] } })
    expect(result.advisories).toHaveLength(1)
    expect(result.modified).toBe(false)
  })

  test("win.target: [{ target: 'nsis-web' }] (object form) emits an advisory", () => {
    const result = migrateConfig({ win: { target: [{ target: "nsis-web", arch: "x64" }] } })
    expect(result.advisories).toHaveLength(1)
    expect(result.modified).toBe(false)
  })

  test("win.target: 'nsis-web:ia32' (arch suffix) and { target: 'NSIS-Web' } emit an advisory", () => {
    expect(migrateConfig({ win: { target: "nsis-web:ia32" } }).advisories).toEqual([NSIS_WEB_ADVISORY])
    expect(migrateConfig({ win: { target: [{ target: "NSIS-Web", arch: "x64" }] } }).advisories).toEqual([NSIS_WEB_ADVISORY])
  })

  test("global top-level target: 'nsis-web' emits an advisory", () => {
    const result = migrateConfig({ target: "nsis-web" })
    expect(result.advisories).toHaveLength(1)
  })

  test("a non-web target produces no advisory", () => {
    const result = migrateConfig({ win: { target: "nsis" } })
    expect(result.advisories).toHaveLength(0)
    expect(result.modified).toBe(false)
  })

  test("advisory coexists with real changes — modified stays true, advisory is excluded from the modified calc", () => {
    const result = migrateConfig({ electronCompile: true, win: { target: "nsis-web" } })
    expect(result.modified).toBe(true)
    expect(result.changes.some(c => c.key === "electronCompile")).toBe(true)
    expect(result.advisories).toHaveLength(1)
  })
})

describe("migrateConfig — updater advisories", () => {
  const advisoriesOf = (config: Record<string, any>) => migrateConfig(config).advisories

  test.each<[string, string, string, string]>([
    ["NSIS_WEB_ADVISORY", NSIS_WEB_ADVISORY, "v27-runtime-changes", "disablewebinstaller-defaults-to-true"],
    ["NSIS_PER_MACHINE_UPDATE_ADVISORY", NSIS_PER_MACHINE_UPDATE_ADVISORY, "v27-runtime-changes", "nsis-per-machine-builds-set-isadminrightsrequired"],
    ["WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY", WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY, "v27-build-changes", "windows-publishername-is-validated-against-the-signing-certificate"],
    ["FEED_QUERY_ADVISORY", FEED_QUERY_ADVISORY, "v27-runtime-changes", "update-credentials-stay-on-the-feeds-origin"],
    ["WIN_PUBLISHER_NAME_DN_ADVISORY", WIN_PUBLISHER_NAME_DN_ADVISORY, "v27-build-changes", "windows-publishername-must-be-a-distinguished-name"],
    ["WIN_MISSING_PUBLISHER_NAME_ADVISORY", WIN_MISSING_PUBLISHER_NAME_ADVISORY, "v27-build-changes", "missing-publishername-fails-update-verification"],
    ["FORCE_CODE_SIGNING_ADVISORY", FORCE_CODE_SIGNING_ADVISORY, "v27-build-changes", "forcecodesigning-covers-notarization-and-update-manifests"],
  ])("%s links its v27 breaking-changes section", (_name, advisory, page, anchor) => {
    expect(advisory.endsWith(` See https://www.electron.build/docs/migration/${page}#${anchor}`)).toBe(true)
    const doc = readFileSync(path.join(import.meta.dirname, `../../website/docs/migration/${page}.md`), "utf8")
    expect(doc.includes(`(#${anchor})`) || doc.includes(`{#${anchor}}`)).toBe(true)
  })

  test("configs that trigger none of them return no advisories", () => {
    expect(advisoriesOf({})).toEqual([])
    expect(
      advisoriesOf({
        appId: "com.example.app",
        win: { target: ["nsis", "portable"], sign: { type: "signtool", sign: "./sign.js", certificateFile: "c.pfx", publisherName: "CN=Acme" } },
        nsis: { oneClick: false, perMachine: false },
        publish: [
          { provider: "generic", url: "https://updates.example.com/app" },
          { provider: "github", owner: "o", repo: "r" },
        ],
      })
    ).toEqual([])
  })

  test("all advisories keep their order: nsis-web, mac entitlements, per-machine, sign hook, feed query", () => {
    const result = migrateConfig({
      win: { target: "nsis-web", sign: { type: "signtool", sign: "./sign.js" } },
      nsisWeb: { perMachine: true },
      mac: { target: "dmg" },
      publish: { provider: "generic", url: "https://updates.example.com/?token=t" },
    })
    expect(result.advisories).toEqual([NSIS_WEB_ADVISORY, MAC_ENTITLEMENTS_ADVISORY, NSIS_PER_MACHINE_UPDATE_ADVISORY, WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY, FEED_QUERY_ADVISORY])
    expect(result.modified).toBe(false)
  })

  describe("forceCodeSigning", () => {
    test.each<[string, Record<string, any>]>([
      ["root forceCodeSigning", { forceCodeSigning: true }],
      ["win.forceCodeSigning", { win: { forceCodeSigning: true } }],
      ["mac.forceCodeSigning", { mac: { forceCodeSigning: true } }],
    ])("%s: true emits the advisory without changing the config", (_name, input) => {
      const result = migrateConfig(input)
      // a mac section also gets the default-entitlements advisory
      expect(result.advisories).toContain(FORCE_CODE_SIGNING_ADVISORY)
      expect(result.modified).toBe(false)
      expect(result.migrated).toEqual(input)
    })

    test("forceCodeSigning: false emits nothing", () => {
      expect(advisoriesOf({ forceCodeSigning: false, linux: { forceCodeSigning: false } })).toEqual([])
    })
  })

  describe("per-machine NSIS", () => {
    test.each<[string, Record<string, any>]>([
      ["nsis.perMachine", { win: { target: "nsis" }, nsis: { perMachine: true } }],
      ["nsisWeb.perMachine", { nsisWeb: { perMachine: true } }],
    ])("%s: true emits the advisory without changing the config", (_name, input) => {
      const result = migrateConfig(input)
      expect(result.advisories).toEqual([NSIS_PER_MACHINE_UPDATE_ADVISORY])
      expect(result.modified).toBe(false)
      expect(result.migrated).toEqual(input)
    })

    test("perMachine false or absent emits nothing", () => {
      expect(advisoriesOf({ nsis: { perMachine: false }, nsisWeb: { perMachine: false } })).toEqual([])
      expect(advisoriesOf({ win: { target: "nsis" }, nsis: { oneClick: false } })).toEqual([])
    })
  })

  describe("custom Windows signing hook without publisherName", () => {
    test.each<[string, Record<string, any>]>([
      ["signtool hook", { type: "signtool", sign: "./sign.js" }],
      ["hsm hook", { type: "hsm", cryptoServiceProvider: "Google Cloud KMS Provider", keyContainer: "k", sign: "./sign.js" }],
      ["pkcs11 hook", { type: "pkcs11", pkcs11Module: "/usr/lib/opensc-pkcs11.so", pkcs11KeyUri: "pkcs11:object=k", sign: "./sign.js" }],
    ])("%s emits the advisory", (_name, sign) => {
      expect(advisoriesOf({ win: { sign } })).toEqual([WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY])
      expect(advisoriesOf({ win: { sign, verifyUpdateCodeSignature: true } })).toEqual([WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY])
    })

    test("a v26 win.signtoolOptions.sign hook migrates into win.sign and then emits the advisory", () => {
      const result = migrateConfig({ win: { signtoolOptions: { sign: "./sign.js", signingHashAlgorithms: ["sha256"] } } })
      expect(result.migrated.win.sign).toEqual({ type: "signtool", sign: "./sign.js", signingHashAlgorithms: ["sha256"] })
      expect(result.advisories).toEqual([WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY])
      expect(result.modified).toBe(true)
    })

    test("no advisory with publisherName (set or null), verifyUpdateCodeSignature: false, or no hook", () => {
      // publisherName: null and win.sign: false get the missing publisherName advisory instead (see below)
      expect(advisoriesOf({ win: { sign: { type: "signtool", sign: "./sign.js", publisherName: "CN=Acme" } } })).toEqual([])
      expect(advisoriesOf({ win: { sign: { type: "signtool", sign: "./sign.js", publisherName: ["CN=Old", "CN=New"] } } })).toEqual([])
      expect(advisoriesOf({ win: { sign: { type: "signtool", sign: "./sign.js", publisherName: null } } })).toEqual([WIN_MISSING_PUBLISHER_NAME_ADVISORY])
      expect(advisoriesOf({ win: { sign: { type: "signtool", sign: "./sign.js" }, verifyUpdateCodeSignature: false } })).toEqual([])
      expect(advisoriesOf({ win: { sign: { type: "signtool" } } })).toEqual([])
      expect(advisoriesOf({ win: { sign: { type: "signtool", sign: null } } })).toEqual([])
      expect(advisoriesOf({ win: { sign: false } })).toEqual([WIN_MISSING_PUBLISHER_NAME_ADVISORY])
      expect(advisoriesOf({ win: { sign: { type: "azure", endpoint: "https://e/", certificateProfileName: "p", codeSigningAccountName: "a", publisherName: "CN=A" } } })).toEqual(
        []
      )
    })

    test.each<[string, Record<string, any>]>([
      ["certificateFile", { sign: { type: "signtool", sign: "./sign.js", certificateFile: "c.pfx" } }],
      ["certificateSubjectName", { sign: { type: "signtool", sign: "./sign.js", certificateSubjectName: "Acme" } }],
      ["certificateSha1", { sign: { type: "signtool", sign: "./sign.js", certificateSha1: "ABCDEF" } }],
      ["hsm certificateSha1", { sign: { type: "hsm", cryptoServiceProvider: "p", keyContainer: "k", sign: "./sign.js", certificateSha1: "ABCDEF" } }],
      ["pkcs11 certificateFile", { sign: { type: "pkcs11", pkcs11Module: "/m.so", pkcs11KeyUri: "pkcs11:object=k", sign: "./sign.js", certificateFile: "c.pem" } }],
      ["signtool win.cscLink", { sign: { type: "signtool", sign: "./sign.js" }, cscLink: "c.pfx" }],
    ])("a certificate in the config (%s) doesn't suppress the advisory: a hook always needs publisherName", (_name, win) => {
      expect(advisoriesOf({ win })).toEqual([WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY])
      expect(advisoriesOf({ win: { ...win, sign: { ...win.sign, publisherName: "CN=Acme" } } })).toEqual([])
    })

    test("a root cscLink doesn't suppress the advisory either", () => {
      expect(advisoriesOf({ cscLink: "c.pfx", win: { sign: { type: "signtool", sign: "./sign.js" } } })).toEqual([WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY])
      expect(advisoriesOf({ cscLink: "c.pfx", win: { sign: { type: "hsm", cryptoServiceProvider: "p", keyContainer: "k", sign: "./sign.js" } } })).toEqual([
        WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY,
      ])
    })

    test("a v26 hook whose signing was disabled (signExecutable: false) is dropped, so no advisory", () => {
      const result = migrateConfig({ win: { signExecutable: false, signtoolOptions: { sign: "./sign.js" } } })
      expect(result.migrated.win).toEqual({ sign: false })
      // only the one about the missing publisherName of an unsigned build
      expect(result.advisories).toEqual([WIN_MISSING_PUBLISHER_NAME_ADVISORY])
    })
  })

  describe("Windows build without a publisherName (win.sign: false / null, publisherName: null)", () => {
    test.each<[string, Record<string, any>]>([
      ["win.sign: false", { win: { sign: false } }],
      ["win.sign: null", { win: { sign: null } }],
      ["win.sign.publisherName: null", { win: { sign: { type: "signtool", certificateFile: "c.pfx", publisherName: null } } }],
      ["azure publisherName: null", { win: { sign: { type: "azure", endpoint: "https://e/", codeSigningAccountName: "a", certificateProfileName: "p", publisherName: null } } }],
      ["v26 signAndEditExecutable: false", { win: { signAndEditExecutable: false } }],
      ["v26 signtoolOptions.publisherName: null", { win: { signtoolOptions: { certificateFile: "c.pfx", publisherName: null } } }],
      ["verifyUpdateCodeSignature: true", { win: { sign: false, verifyUpdateCodeSignature: true } }],
    ])("%s emits the advisory, naming the opt-out and the migration guide", (_name, config) => {
      expect(advisoriesOf(config)).toEqual([WIN_MISSING_PUBLISHER_NAME_ADVISORY])
      expect(WIN_MISSING_PUBLISHER_NAME_ADVISORY).toContain("win.verifyUpdateCodeSignature: false")
      expect(WIN_MISSING_PUBLISHER_NAME_ADVISORY).toContain("publisherName: null no longer opts out")
      expect(WIN_MISSING_PUBLISHER_NAME_ADVISORY.endsWith("v27-build-changes#missing-publishername-fails-update-verification")).toBe(true)
    })

    test.each<[string, Record<string, any>]>([
      ["win.sign: false with verifyUpdateCodeSignature: false", { win: { sign: false, verifyUpdateCodeSignature: false } }],
      ["publisherName: null with verifyUpdateCodeSignature: false", { win: { sign: { type: "signtool", publisherName: null }, verifyUpdateCodeSignature: false } }],
      ["no win section", {}],
      ["win.sign unset", { win: { target: "nsis" } }],
      ["a sign object with publisherName (signed outside electron-builder)", { win: { sign: { type: "signtool", publisherName: ["CN=Acme"] } } }],
      ["a sign object without publisherName", { win: { sign: { type: "signtool", certificateFile: "c.pfx" } } }],
    ])("%s emits nothing", (_name, config) => {
      expect(advisoriesOf(config)).toEqual([])
    })
  })

  describe("win.sign.publisherName that is not a distinguished name", () => {
    test.each<[string, unknown]>([
      ["a bare name", "Acme Corp"],
      ["a bare name with a comma", "Acme, Inc"],
      ["a DN with an empty value", "CN="],
      ["a list with one invalid entry", ["CN=Acme Corp, O=Acme Corp", "Old Corp"]],
      ["a value that is no string", 42],
    ])("%s emits the advisory without changing the config", (_name, publisherName) => {
      const input = { win: { sign: { type: "signtool", certificateFile: "c.pfx", publisherName } } }
      const result = migrateConfig(input)
      expect(result.advisories).toEqual([WIN_PUBLISHER_NAME_DN_ADVISORY])
      expect(result.modified).toBe(false)
      expect(result.migrated).toEqual(input)
    })

    test.each<[string, unknown]>([
      ["a full DN", "CN=Acme Corp, O=Acme Corp, C=US"],
      ["a CN-only DN", "CN=Acme Corp"],
      ["a DN without CN", "O=Acme Corp, C=US"],
      ["a list of DNs", ["CN=Old, O=Old Org", "CN=New"]],
      ["no publisherName", undefined],
    ])("%s emits nothing", (_name, publisherName) => {
      expect(advisoriesOf({ win: { sign: { type: "signtool", certificateFile: "c.pfx", publisherName } } })).toEqual([])
    })

    test("a v26 signtoolOptions / azureSignOptions publisherName migrates into win.sign and then emits the advisory", () => {
      expect(advisoriesOf({ win: { signtoolOptions: { certificateFile: "c.pfx", publisherName: "Acme" } } })).toEqual([WIN_PUBLISHER_NAME_DN_ADVISORY])
      expect(advisoriesOf({ win: { azureSignOptions: { endpoint: "https://e/", codeSigningAccountName: "a", certificateProfileName: "p", publisherName: "Acme" } } })).toEqual([
        WIN_PUBLISHER_NAME_DN_ADVISORY,
      ])
      // signing disabled: the options are dropped, nothing is validated (only the missing publisherName of the unsigned build is reported)
      expect(advisoriesOf({ win: { signExecutable: false, signtoolOptions: { publisherName: "Acme" } } })).toEqual([WIN_MISSING_PUBLISHER_NAME_ADVISORY])
    })

    test("is emitted next to the sign hook advisory's position, after it", () => {
      expect(advisoriesOf({ win: { sign: { type: "signtool", sign: "./sign.js", publisherName: "Acme" } }, publish: { provider: "generic", url: "https://u/?t=1" } })).toEqual([
        WIN_PUBLISHER_NAME_DN_ADVISORY,
        FEED_QUERY_ADVISORY,
      ])
    })

    test("names electron-builder v27, the requirement and the migration guide", () => {
      expect(WIN_PUBLISHER_NAME_DN_ADVISORY).toContain("In v27")
      expect(WIN_PUBLISHER_NAME_DN_ADVISORY).toContain('must be in distinguished name (DN) format, e.g. "CN=My Company, O=My Company, C=US"')
    })
  })

  describe("generic publish url with a query string", () => {
    test.each<[string, Record<string, any>]>([
      ["root publish object", { publish: { provider: "generic", url: "https://updates.example.com/?token=t" } }],
      [
        "root publish array",
        {
          publish: [
            { provider: "github", owner: "o", repo: "r" },
            { provider: "generic", url: "https://updates.example.com/feed?key=k" },
          ],
        },
      ],
      ["platform-level publish", { win: { publish: { provider: "generic", url: "https://updates.example.com/win?key=k" } } }],
      ["target-level publish array", { nsis: { publish: [{ provider: "generic", url: "https://updates.example.com/?key=k" }] } }],
      ["linux publish", { linux: { publish: [{ provider: "generic", url: "https://updates.example.com/?key=${env.KEY}" }] } }],
    ])("%s emits the advisory without changing the config", (_name, input) => {
      const result = migrateConfig(input)
      expect(result.advisories).toEqual([FEED_QUERY_ADVISORY])
      expect(result.modified).toBe(false)
      expect(result.migrated).toEqual(input)
    })

    test("a generic url without a query, string entries and other providers emit nothing", () => {
      expect(advisoriesOf({ publish: { provider: "generic", url: "https://updates.example.com/app" } })).toEqual([])
      expect(advisoriesOf({ publish: { provider: "generic" } })).toEqual([])
      expect(advisoriesOf({ publish: ["github", "generic"] })).toEqual([])
      expect(advisoriesOf({ publish: null, win: { publish: [null] } })).toEqual([])
      expect(
        advisoriesOf({
          publish: [
            { provider: "s3", bucket: "b", endpoint: "https://s3.example.com/?x=1" },
            { provider: "custom", url: "https://updates.example.com/?token=t" },
          ],
        })
      ).toEqual([])
    })
  })
})

describe("migrateConfig — mac.gatekeeperAssess is removed, not moved", () => {
  // @electron/osx-sign 2.x dropped the spctl --assess step; ElectronSignOptions omits the field and
  // the schema rejects it, so moving it under `sign` produced a config that failed the next build.
  test.each(["mac", "mas", "masDev"] as const)("%s.gatekeeperAssess is deleted", platform => {
    const result = migrateConfig({ [platform]: { gatekeeperAssess: false, identity: "Developer ID Application: Acme (TEAM)" } })
    const migrated = result.migrated[platform]
    expect(migrated.gatekeeperAssess).toBeUndefined()
    expect(migrated.sign.gatekeeperAssess).toBeUndefined()
    expect(migrated.sign.identity).toBe("Developer ID Application: Acme (TEAM)")
    expect(result.changes.some(c => c.key === `${platform}.gatekeeperAssess`)).toBe(true)
  })

  test("gatekeeperAssess alone still migrates (no other sign fields present)", () => {
    const result = migrateConfig({ mac: { gatekeeperAssess: true } })
    expect(result.migrated.mac.gatekeeperAssess).toBeUndefined()
    expect(result.modified).toBe(true)
  })
})

describe("migrateConfig — platform-level asarUnpack", () => {
  test("moves mac.asarUnpack → mac.asar.unpack", () => {
    const result = migrateConfig({ mac: { asarUnpack: ["**/*.node"] } })
    expect(result.migrated.mac).toEqual({ asar: { unpack: ["**/*.node"] } })
    expect(result.changes.some(c => c.key === "mac.asarUnpack")).toBe(true)
  })

  test.each(["mas", "masDev", "win", "linux"] as const)("applies to %s", platform => {
    const result = migrateConfig({ [platform]: { asarUnpack: "x" } })
    expect(result.migrated[platform]).toEqual({ asar: { unpack: "x" } })
  })

  // v26 concatenated root and platform asarUnpack; a v27 platform-level asar replaces the root one wholesale.
  test("merges the root asar options into the new platform asar", () => {
    const result = migrateConfig({ asarUnpack: "root/**", disableAsarIntegrity: true, asar: { smartUnpack: false }, win: { asarUnpack: "w/**" } })
    expect(result.migrated.asar).toEqual({ smartUnpack: false, unpack: "root/**", disableIntegrity: true })
    expect(result.migrated.win).toEqual({ asar: { smartUnpack: false, unpack: ["root/**", "w/**"], disableIntegrity: true } })
  })

  test("folds root-level options into a platform that already overrides asar", () => {
    const result = migrateConfig({ asarUnpack: "root/**", disableSanityCheckAsar: true, mac: { asar: true } })
    expect(result.migrated.mac).toEqual({ asar: { unpack: "root/**", disableSanityCheck: true } })
  })

  test("a platform that re-enables asar keeps the root options even when the root disables it", () => {
    const result = migrateConfig({ asar: false, asarUnpack: "root/**", mac: { asar: { ordering: "o.txt" } } })
    expect(result.migrated.asar).toBe(false)
    expect("asarUnpack" in result.migrated).toBe(false)
    expect(result.migrated.mac.asar).toEqual({ ordering: "o.txt", unpack: "root/**" })
  })

  test("drops a platform asarUnpack that has no effect", () => {
    expect(migrateConfig({ linux: { asar: false, asarUnpack: "x" } }).migrated.linux).toEqual({ asar: false })
    expect(migrateConfig({ asar: false, linux: { asarUnpack: "x" } }).migrated.linux).toEqual({})
  })

  test("leaves a platform asar override alone when there is nothing to fold in", () => {
    const result = migrateConfig({ mac: { asar: { smartUnpack: false } } })
    expect(result.modified).toBe(false)
  })
})

describe("migrateConfig — toolsets", () => {
  test("removes null toolset values (rejected by the v27 schema)", () => {
    const result = migrateConfig({ toolsets: { wine: null, nsis: "1.2.1" } })
    expect(result.migrated.toolsets).toEqual({ nsis: "1.2.1" })
    expect(result.changes.some(c => c.key === "toolsets.wine" && c.description.includes('"0.0.0"'))).toBe(true)
  })

  test('remaps the retired appimage "1.0.2" pin to "1.0.3"', () => {
    const result = migrateConfig({ toolsets: { appimage: "1.0.2" } })
    expect(result.migrated.toolsets).toEqual({ appimage: "1.0.3" })
  })

  test("leaves valid pins untouched", () => {
    const input = { toolsets: { appimage: "0.0.0", wine: "system", winCodeSign: "1.3.0" } }
    expect(migrateConfig(input).modified).toBe(false)
  })

  test("keeps toolsets.executables, for which null is valid", () => {
    const input = { toolsets: { executables: null, wine: "system" } }
    expect(migrateConfig(input).modified).toBe(false)
    const withEntries = { toolsets: { executables: { mono: "file:///opt/homebrew/bin/mono", pwsh: null } } }
    expect(migrateConfig(withEntries).modified).toBe(false)
  })
})

describe("migrateConfig — nativeRebuilder: legacy", () => {
  test("drops the removed legacy rebuilder instead of emitting an invalid rebuildMode", () => {
    const result = migrateConfig({ nativeRebuilder: "legacy", npmRebuild: false })
    expect(result.migrated).toEqual({ nativeModules: { npmRebuild: false } })
    expect(result.warnings.some(w => w.includes("legacy") && w.includes("@electron/rebuild"))).toBe(true)
  })

  test("does not emit an empty nativeModules object", () => {
    expect(migrateConfig({ nativeRebuilder: "legacy" }).migrated).toEqual({})
  })
})

describe("migrateConfig — v26 null values on mac options", () => {
  test("drops nulls the v27 sign/universal types reject, keeps identity: null (skip signing)", () => {
    const result = migrateConfig({ mac: { type: null, provisioningProfile: null, binaries: null, signIgnore: null, singleArchFiles: null, identity: null } })
    expect(result.migrated.mac).toEqual({ sign: { identity: null } })
    expect(result.changes.some(c => c.key === "mac.provisioningProfile" && c.description.includes("null"))).toBe(true)
  })

  test("does not leave a bare sign: null behind when every moved field was a dropped null", () => {
    const result = migrateConfig({ mac: { sign: null, type: null } })
    expect(result.migrated.mac).toEqual({})
  })
})

describe("migrateConfig — GitHub tag prefix semantics", () => {
  test("a non-empty tagNamePrefix won over vPrefixedTagName in v26 and is kept", () => {
    const result = migrateConfig({ publish: { provider: "github", tagNamePrefix: "release-", vPrefixedTagName: false } })
    expect(result.migrated.publish).toEqual({ provider: "github", tagNamePrefix: "release-" })
  })

  test('an empty tagNamePrefix was ignored by v26 (tags stayed "v…"), so it is rewritten to "v" with a warning', () => {
    const result = migrateConfig({ publish: [{ provider: "github", tagNamePrefix: "" }] })
    expect(result.migrated.publish).toEqual([{ provider: "github", tagNamePrefix: "v" }])
    expect(result.warnings.some(w => w.includes("tagNamePrefix"))).toBe(true)
  })

  test("an empty tagNamePrefix with vPrefixedTagName: false keeps no prefix", () => {
    const result = migrateConfig({ publish: { provider: "github", tagNamePrefix: "", vPrefixedTagName: false } })
    expect(result.migrated.publish).toEqual({ provider: "github", tagNamePrefix: "" })
    expect(result.warnings).toHaveLength(0)
  })

  test("migrates publish entries nested in target sections (nsis, dmg, snap, …)", () => {
    const result = migrateConfig({
      nsis: { publish: { provider: "github", vPrefixedTagName: false } },
      snap: { base: "core22", publish: [{ provider: "github", vPrefixedTagName: true }] },
    })
    expect(result.migrated.nsis.publish).toEqual({ provider: "github", tagNamePrefix: "" })
    expect(result.migrated.snapcraft.core22.publish).toEqual([{ provider: "github", tagNamePrefix: "v" }])
  })

  test("GitLab entries are untouched", () => {
    expect(migrateConfig({ publish: { provider: "gitlab", tagNamePrefix: "" } }).modified).toBe(false)
  })
})

describe("migrateConfig — squirrelWindows.customSquirrelVendorDir", () => {
  // Not a 1-to-1 rename (toolsets.squirrel needs an electron-winstaller/vendor/ subtree), so it is left for
  // the build-time guard to reject with a targeted message rather than silently swapping the vendored binaries.
  test("warns and leaves the key in place", () => {
    const result = migrateConfig({ squirrelWindows: { customSquirrelVendorDir: "./vendor", msi: true } })
    expect(result.migrated.squirrelWindows).toEqual({ customSquirrelVendorDir: "./vendor", msi: true })
    expect(result.warnings.some(w => w.includes("customSquirrelVendorDir") && w.includes("toolsets.squirrel"))).toBe(true)
  })
})

describe("migrateConfig — electronGet leftovers", () => {
  test("drops electronDownload.force (no @electron/get v5 equivalent)", () => {
    const result = migrateConfig({ electronDownload: { force: true, mirrorOptions: { mirror: "https://m/" } } })
    expect(result.migrated.electronGet).toEqual({ mirrorOptions: { mirror: "https://m/" } })
    expect(result.warnings.some(w => w.includes("force"))).toBe(true)
  })

  test("reshapes a hand-renamed electronGet that still has the v26 shape", () => {
    const result = migrateConfig({ electronGet: { mirror: "https://m/", isVerifyChecksum: false, cache: "/c" } })
    expect(result.migrated.electronGet).toEqual({ mirrorOptions: { mirror: "https://m/" }, unsafelyDisableChecksums: true })
    expect(result.changes.some(c => c.key === "electronGet")).toBe(true)
  })

  test("leaves a valid electronGet untouched", () => {
    expect(migrateConfig({ electronGet: { mirrorOptions: { mirror: "https://m/" }, unsafelyDisableChecksums: true } }).modified).toBe(false)
  })
})

describe("migrateConfig — electronDownload next to an existing electronGet", () => {
  test("the existing electronGet wins on conflicts, with a warning", () => {
    const result = migrateConfig({ electronDownload: { mirror: "https://old/" }, electronGet: { mirrorOptions: { mirror: "https://new/" } } })
    expect(result.migrated).toEqual({ electronGet: { mirrorOptions: { mirror: "https://new/" } } })
    expect(result.warnings.some(w => w.includes("mirrorOptions.mirror") && w.includes("kept the existing electronGet"))).toBe(true)
  })

  test("non-conflicting legacy values are folded in without a warning", () => {
    const result = migrateConfig({ electronDownload: { isVerifyChecksum: false }, electronGet: { mirrorOptions: { mirror: "https://new/" } } })
    expect(result.migrated.electronGet).toEqual({ mirrorOptions: { mirror: "https://new/" }, unsafelyDisableChecksums: true })
    expect(result.warnings).toHaveLength(0)
  })

  test("a non-object electronDownload never replaces an existing electronGet", () => {
    const result = migrateConfig({ electronDownload: null, electronGet: { unsafelyDisableChecksums: true } })
    expect(result.migrated).toEqual({ electronGet: { unsafelyDisableChecksums: true } })
  })
})

describe("migrateConfig — asar: true change log", () => {
  test("says the true was replaced when it becomes a populated object", () => {
    const result = migrateConfig({ asar: true, asarUnpack: "**/*.node", disableAsarIntegrity: true })
    const change = result.changes.find(c => c.key === "asar")
    expect(change?.description).toContain("replaced asar: true")
    expect(change?.description).toContain("unpack")
  })

  test("says it was removed only when nothing is folded in", () => {
    const result = migrateConfig({ asar: true })
    expect(result.migrated).toEqual({})
    expect(result.changes.find(c => c.key === "asar")?.description).toContain("removed redundant asar: true")
  })
})

describe("migrateConfig — snap core24", () => {
  test("drops options the core24 shape does not support", () => {
    const result = migrateConfig({ snap: { base: "core24", allowNativeWayland: true, useTemplateApp: false, grade: "stable" } })
    expect(result.migrated.snapcraft).toEqual({ base: "core24", core24: { grade: "stable" } })
    expect(result.warnings.some(w => w.includes("allowNativeWayland") && w.includes("useTemplateApp"))).toBe(true)
  })
})

describe("migrateConfig — Windows signing switched off", () => {
  // Either flag set to false skipped all signing in v26 (winPackager), so v27 must not start signing.
  test("signAndEditExecutable: false also becomes win.sign: false", () => {
    const result = migrateConfig({ win: { signAndEditExecutable: false } })
    expect(result.migrated.win).toEqual({ sign: false })
  })

  test("legacy signing options under disabled signing are dropped, naming only the keys", () => {
    const result = migrateConfig({ win: { signExecutable: false, signtoolOptions: { certificateFile: "c.pfx", certificatePassword: "hunter2" } } })
    expect(result.migrated.win).toEqual({ sign: false })
    const warning = result.warnings.find(w => w.includes("win.signtoolOptions"))
    expect(warning).toBeDefined()
    expect(warning).not.toContain("hunter2")
  })
})

describe("migrateConfig — mac default entitlements advisory", () => {
  test("a mac config without its own entitlements file gets the advisory, without being rewritten", () => {
    const result = migrateConfig({ mac: { target: "dmg" } })
    expect(result.modified).toBe(false)
    expect(result.advisories.some(a => a.includes("allow-jit") && a.includes("entitlements.mac.plist"))).toBe(true)
  })

  test("no advisory when entitlements are named (v26 location, migrated) or there is no mac config", () => {
    expect(migrateConfig({ mac: { entitlements: "build/e.plist" } }).advisories).toHaveLength(0)
    expect(migrateConfig({ mas: { sign: { entitlements: "build/mas.plist" } } }).advisories).toHaveLength(0)
    expect(migrateConfig({ win: { target: "nsis" } }).advisories).toHaveLength(0)
  })

  test("no advisory when electron-builder's default signing is bypassed (custom signer, identity: null)", () => {
    expect(migrateConfig({ mac: { sign: "./customSign.js" } }).advisories).toHaveLength(0)
    expect(migrateConfig({ mac: { identity: null } }).advisories).toHaveLength(0)
  })
})

describe("migrateConfig — round-trip: migrator output passes v27 schema validation", () => {
  // The migrator is the documented upgrade path, so anything it emits must validate. This is the
  // test that would have caught gatekeeperAssess being relocated into a bag that rejects it.
  const v26Configs: Array<[string, Record<string, any>]> = [
    ["mac signing", { mac: { identity: "Developer ID Application: Acme (TEAM)", hardenedRuntime: true, gatekeeperAssess: false, signIgnore: ["**/*.txt"] } }],
    ["mac universal", { mac: { mergeASARs: true, singleArchFiles: "*.node", x64ArchFiles: "*.node" } }],
    ["mas signing", { mas: { entitlements: "build/e.plist", provisioningProfile: "build/embedded.provisionprofile", gatekeeperAssess: true } }],
    ["asar options", { asarUnpack: ["**/*.node"], disableSanityCheckAsar: true, disableAsarIntegrity: true }],
    ["native modules", { buildDependenciesFromSource: true, nodeGypRebuild: false, npmRebuild: true, nativeRebuilder: "parallel" }],
    ["npmSkipBuildFromSource", { npmSkipBuildFromSource: true }],
    ["win signtool", { win: { signtoolOptions: { certificateFile: "cert.pfx", publisherName: "CN=ACME Inc" } } }],
    [
      "win azure",
      {
        win: {
          azureSignOptions: {
            endpoint: "https://weu.codesigning.azure.net/",
            certificateProfileName: "p",
            codeSigningAccountName: "acct",
            publisherName: "CN=ACME Inc",
            ExcludeCredentials: "ManagedIdentityCredential",
          },
        },
      },
    ],
    ["win signExecutable", { win: { signExecutable: false } }],
    ["electronDownload", { electronDownload: { mirror: "https://my-mirror/", isVerifyChecksum: false } }],
    ["snap", { snap: { confinement: "strict", stagePackages: ["libfoo"], base: "core22" } }],
    ["squirrelWindows", { squirrelWindows: { noMsi: true } }],
    ["helper-bundle-id", { "helper-bundle-id": "com.example.helper" }],
    ["removed root keys", { electronCompile: true, framework: "electron", nodeVersion: "current", launchUiVersion: "0.1.0" }],
    ["linux.syncDesktopName", { linux: { syncDesktopName: false } }],
    ["appImage.systemIntegration", { appImage: { systemIntegration: "doNotAsk" } }],
    ["github publish", { publish: { provider: "github", owner: "o", repo: "r", vPrefixedTagName: false } }],
    [
      "platform asarUnpack",
      { asarUnpack: "root/**", mac: { asarUnpack: ["m/**"] }, win: { asar: { smartUnpack: false }, asarUnpack: "w/**" }, linux: { asar: false, asarUnpack: "x" } },
    ],
    ["asar false with root keys", { asar: false, asarUnpack: ["**/*.node"], disableAsarIntegrity: true, mac: { asar: true } }],
    ["toolsets null / retired pin", { toolsets: { wine: null, nsis: null, winCodeSign: null, appimage: "1.0.2" } }],
    ["nativeRebuilder legacy", { nativeRebuilder: "legacy", npmRebuild: false }],
    ["mac null fields", { mac: { type: null, provisioningProfile: null, binaries: null, signIgnore: null, singleArchFiles: null, x64ArchFiles: null, identity: null } }],
    ["electronDownload force", { electronDownload: { force: true, mirrorOptions: { mirror: "https://m/" } } }],
    ["publish in a target section", { nsis: { publish: { provider: "github", vPrefixedTagName: false } }, dmg: { publish: [{ provider: "github", tagNamePrefix: "" }] } }],
    ["snap core24", { snap: { base: "core24", allowNativeWayland: true, useTemplateApp: false, grade: "stable" } }],
    ["file options", { files: ["dist/**"], extraResources: [{ from: "a", to: "b" }], mac: { extraFiles: "x", files: ["!m/**"] }, masDev: { extraResources: null } }],
    ["file options next to fileOptions", { files: ["flat/**"], fileOptions: { files: ["nested/**"], extraFiles: ["e"] }, win: { extraResources: ["r"], fileOptions: null } }],
    ["includePdb: true", { includePdb: true, files: ["dist/**"], win: { fileOptions: { excludedExts: ["default", "map"] } } }],
    ["includePdb: false", { includePdb: false, fileOptions: { files: ["dist/**"] } }],
    ["includePdb: false in a config that extends another", { extends: "./base.json", includePdb: false, files: ["dist/**"] }],
    ['includePdb: "true"', { includePdb: "true" }],
    [
      "win signing disabled with legacy options",
      { win: { signExecutable: false, azureSignOptions: { endpoint: "https://e/", certificateProfileName: "p", codeSigningAccountName: "a" } } },
    ],
    [
      // One v26 config (validated against the v26.15.3 scheme.json) touching every migrated key at once.
      "kitchen sink",
      {
        electronCompile: false,
        framework: "electron",
        nodeVersion: "current",
        launchUiVersion: "0.1.0",
        disableDefaultIgnoredFiles: true,
        includePdb: true,
        nodeGypRebuild: false,
        npmRebuild: true,
        nativeRebuilder: "parallel",
        asar: true,
        asarUnpack: ["**/*.node"],
        disableSanityCheckAsar: true,
        disableAsarIntegrity: true,
        publish: [
          { provider: "github", owner: "o", repo: "r", vPrefixedTagName: false },
          { provider: "gitlab", projectId: 1, vPrefixedTagName: false },
        ],
        snap: { base: "core22", confinement: "strict", stagePackages: ["libfoo"], publish: { provider: "github", vPrefixedTagName: true } },
        win: {
          signtoolOptions: { certificateFile: "c.pfx", publisherName: "CN=A", sign: "./sign.js" },
          signAndEditExecutable: true,
          signExecutable: true,
          asarUnpack: "a.dll",
          disableDefaultIgnoredFiles: false,
          publish: [{ provider: "github", vPrefixedTagName: true }],
        },
        mac: {
          sign: null,
          identity: "Developer ID Application: Acme (TEAM)",
          type: "distribution",
          entitlements: "build/e.plist",
          entitlementsInherit: "build/ei.plist",
          entitlementsLoginHelper: "build/el.plist",
          provisioningProfile: "build/p.provisionprofile",
          binaries: ["a"],
          requirements: "r",
          hardenedRuntime: true,
          gatekeeperAssess: false,
          strictVerify: true,
          preAutoEntitlements: true,
          timestamp: "none",
          additionalArguments: ["--x"],
          signIgnore: "foo",
          mergeASARs: true,
          singleArchFiles: "*.node",
          x64ArchFiles: "bin/*",
          asarUnpack: ["m/**"],
        },
        mas: { type: "distribution", entitlements: "mas.plist" },
        masDev: { type: "development", provisioningProfile: "dev.provisionprofile" },
        linux: { syncDesktopName: false, asar: false, asarUnpack: "x" },
        electronDownload: {
          mirror: "https://mirror/",
          isVerifyChecksum: false,
          cache: "/c",
          customDir: "d",
          customFilename: "f",
          strictSSL: true,
          platform: "linux",
          arch: "x64",
          version: "30.0.0",
        },
        toolsets: { wine: null, appimage: "1.0.2", nsis: "1.2.1", winCodeSign: "0.0.0" },
        nsis: { publish: { provider: "github", vPrefixedTagName: false } },
        dmg: { publish: [{ provider: "github", tagNamePrefix: "" }] },
        files: ["**/*", "!src/**"],
        extraFiles: [{ from: "bin", to: "bin" }],
      },
    ],
  ]

  test.each(v26Configs)("%s", async (_name, input) => {
    const { migrated } = migrateConfig({ appId: "com.example.app", productName: "MyApp", ...input })
    const { validateConfiguration } = await import("app-builder-lib/internal")
    const { DebugLogger } = await import("builder-util")
    await expect(validateConfiguration(migrated as any, new DebugLogger(false))).resolves.toBeUndefined()
  })
})

describe("migrateConfig — removed customNsisBinary / customNsisResources", () => {
  const url = "https://downloads.example.com/nsisbi.7z?token=s3cr3t-token"
  const checksum = "VKMiizYdmNdJOWpRGz4trl4lD++BvYP2irAXpMilheUP0pc93iKlWAoP843Vlraj8YG19CVn0j+dCo/hURz9+Q=="

  test("debugLogging moves to installerDebugLogging and an emptied customNsisBinary is removed (nsis and nsisWeb)", () => {
    const result = migrateConfig({ nsis: { oneClick: false, customNsisBinary: { url: null, debugLogging: true } }, nsisWeb: { customNsisBinary: { debugLogging: false } } })
    expect(result.migrated).toEqual({ nsis: { oneClick: false, installerDebugLogging: true }, nsisWeb: { installerDebugLogging: false } })
    expect(result.changes.map(c => c.description)).toContain("moved nsis.customNsisBinary.debugLogging → nsis.installerDebugLogging")
    expect(result.warnings).toHaveLength(0)
    expect(result.modified).toBe(true)
  })

  test("a custom bundle is kept and reported without its values; debugLogging still moves", () => {
    const result = migrateConfig({ nsis: { customNsisBinary: { url, checksum, debugLogging: true } } })
    expect(result.migrated).toEqual({ nsis: { customNsisBinary: { url, checksum }, installerDebugLogging: true } })
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain("`nsis.customNsisBinary` was replaced by `toolsets.nsis`")
    expect(result.warnings[0]).toContain("v26-to-v27#step-4-custom-nsis-migration-guide")
    expect(result.warnings[0]).not.toContain(url)
    expect(result.warnings[0]).not.toContain(checksum)
  })

  test("a kept key alone does not mark the config modified, so the file is not re-serialized", () => {
    const input = { nsisWeb: { customNsisResources: { url, checksum, version: "3.4.1" } }, portable: { customNsisBinary: { version: "3.10" } } }
    const result = migrateConfig(structuredClone(input))
    expect(result.modified).toBe(false)
    expect(result.migrated).toEqual(input)
    expect(result.warnings.map(w => w.split("\n")[0])).toEqual([
      "`nsisWeb.customNsisResources` was replaced by `toolsets.nsis` in electron-builder v27.",
      "`portable.customNsisBinary` was replaced by `toolsets.nsis` in electron-builder v27.",
    ])
  })

  test("portable debugLogging is dropped with a warning; null keys are removed", () => {
    const result = migrateConfig({ portable: { customNsisBinary: { debugLogging: true }, customNsisResources: null }, nsis: { customNsisBinary: null } })
    expect(result.migrated).toEqual({ portable: {}, nsis: {} })
    expect(result.warnings).toEqual([PORTABLE_DEBUG_LOGGING_DROPPED])
  })

  test("an existing installerDebugLogging wins over the v26 debugLogging", () => {
    const result = migrateConfig({ nsis: { installerDebugLogging: false, customNsisBinary: { debugLogging: true } } })
    expect(result.migrated).toEqual({ nsis: { installerDebugLogging: false } })
  })
})

describe("migrateConfig — files / extraResources / extraFiles → fileOptions", () => {
  test("moves the root-level keys under fileOptions", () => {
    const result = migrateConfig({ appId: "a", files: ["dist/**"], extraResources: "r", extraFiles: [{ from: "bin", to: "bin" }] })
    expect(result.migrated).toEqual({ appId: "a", fileOptions: { files: ["dist/**"], extraResources: "r", extraFiles: [{ from: "bin", to: "bin" }] } })
    expect(result.changes.map(c => c.description)).toEqual([
      "moved files → fileOptions.files",
      "moved extraResources → fileOptions.extraResources",
      "moved extraFiles → fileOptions.extraFiles",
    ])
    expect(result.warnings).toHaveLength(0)
    expect(result.modified).toBe(true)
  })

  test.each(["mac", "mas", "masDev", "win", "linux"])("moves the %s platform-level keys under its fileOptions", platform => {
    const result = migrateConfig({ [platform]: { target: "dir", files: ["!x/**"], extraFiles: "f" } })
    expect(result.migrated).toEqual({ [platform]: { target: "dir", fileOptions: { files: ["!x/**"], extraFiles: "f" } } })
    expect(result.changes.map(c => c.key)).toEqual([`${platform}.files`, `${platform}.extraFiles`])
  })

  test("merges into an existing fileOptions object; a null fileOptions is replaced", () => {
    const result = migrateConfig({ extraFiles: ["e"], fileOptions: { files: ["dist/**"] }, linux: { extraResources: ["r"], fileOptions: null } })
    expect(result.migrated).toEqual({ fileOptions: { files: ["dist/**"], extraFiles: ["e"] }, linux: { fileOptions: { extraResources: ["r"] } } })
  })

  test("a flat key also set under fileOptions is removed with a warning: the build already ignores it", () => {
    const result = migrateConfig({ files: ["flat/**"], fileOptions: { files: ["nested/**"] }, mac: { extraResources: ["flat"], fileOptions: { extraResources: ["nested"] } } })
    expect(result.migrated).toEqual({ fileOptions: { files: ["nested/**"] }, mac: { fileOptions: { extraResources: ["nested"] } } })
    expect(result.changes.map(c => c.description)).toEqual([
      "removed files (fileOptions.files is also set and takes precedence)",
      "removed mac.extraResources (mac.fileOptions.extraResources is also set and takes precedence)",
    ])
    expect(result.warnings).toHaveLength(2)
    expect(result.warnings[0]).toContain("the build uses fileOptions.files and ignores files")
  })

  test("a fileOptions that is not an object is left alone with a warning", () => {
    const input = { files: ["dist/**"], fileOptions: ["x"] }
    const result = migrateConfig(structuredClone(input))
    expect(result.migrated).toEqual(input)
    expect(result.modified).toBe(false)
    expect(result.warnings).toEqual(["fileOptions is not an object; move files into it manually (e.g. fileOptions: { files: [...] })."])
  })

  test("target sections are untouched (flatpak.files is a [src, dest] list of its own)", () => {
    const input = { flatpak: { files: [["build/a", "/share/a"]] }, fileOptions: { files: ["dist/**"] } }
    const result = migrateConfig(structuredClone(input))
    expect(result.modified).toBe(false)
    expect(result.migrated).toEqual(input)
  })
})
