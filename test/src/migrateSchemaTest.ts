import { describe, expect, test } from "vitest"
import { migrateConfig } from "../../packages/electron-builder/src/cli/migrate-schema"

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

  test("removes vPrefixedTagName from gitlab entries", () => {
    const result = migrateConfig({
      publish: { provider: "gitlab", vPrefixedTagName: false },
    })
    expect("vPrefixedTagName" in result.migrated.publish).toBe(false)
    expect("tagNamePrefix" in result.migrated.publish).toBe(false)
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

describe("migrateConfig — win.azureSignOptions additionalMetadata", () => {
  test("moves extra index-signature keys into additionalMetadata", () => {
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
    expect(result.migrated.win.azureSignOptions).toEqual({
      endpoint: "https://weu.codesigning.azure.net/",
      codeSigningAccountName: "my-account",
      certificateProfileName: "my-profile",
      publisherName: "CN=My Company",
      additionalMetadata: {
        ExcludeCredentials: "ManagedIdentityCredential",
        CorrelationId: "my-build-id",
      },
    })
    expect(result.changes.some(c => c.key === "win.azureSignOptions")).toBe(true)
  })

  test("no-op when azureSignOptions has only known fields", () => {
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
    expect(result.changes.some(c => c.key === "win.azureSignOptions")).toBe(false)
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

  test("skips consolidation when asar: false", () => {
    const result = migrateConfig({ asar: false, asarUnpack: "**/*.node", disableSanityCheckAsar: true })
    expect(result.migrated.asar).toBe(false)
    expect("asarUnpack" in result.migrated).toBe(true)
    expect("disableSanityCheckAsar" in result.migrated).toBe(true)
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

describe("migrateConfig — does not mutate input", () => {
  test("original config is not modified", () => {
    const input = { electronCompile: true, buildDependenciesFromSource: true }
    const frozen = JSON.parse(JSON.stringify(input))
    migrateConfig(input)
    expect(input).toEqual(frozen)
  })
})
