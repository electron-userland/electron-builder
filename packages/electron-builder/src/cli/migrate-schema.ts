import { createRequire } from "node:module"
import { log, orNullIfFileNotExist } from "builder-util"
import { promises as fs } from "fs"
import * as path from "path"
import type { Argv } from "yargs"
import { loadTypeScript, migrateProgrammaticSource } from "./migrate-schema-programmatic.js"

const _require = createRequire(import.meta.url)

// ─── Public types ─────────────────────────────────────────────────────────────

export interface MigrationChange {
  readonly key: string
  readonly description: string
}

export interface MigrationResult {
  readonly migrated: Record<string, any>
  readonly changes: MigrationChange[]
  readonly warnings: string[]
  readonly modified: boolean
}

// ─── Pure migration logic ─────────────────────────────────────────────────────

// Azure Trusted Signing typed fields in v27 (everything else is an extra key → additionalMetadata).
// "type" is included so it is not mistakenly moved to additionalMetadata if already present.
export const AZURE_KNOWN_FIELDS = new Set([
  "type",
  "endpoint",
  "codeSigningAccountName",
  "certificateProfileName",
  "publisherName",
  "fileDigest",
  "timestampRfc3161",
  "timestampDigest",
  "additionalMetadata",
])

// macOS signing fields that moved from the platform root into the `sign` (ElectronSignOptions) bag.
// `signIgnore` is renamed to `sign.ignore` separately (the @electron/osx-sign canonical name).
export const MAC_SIGN_FIELDS = [
  "identity",
  "entitlements",
  "entitlementsInherit",
  "entitlementsLoginHelper",
  "provisioningProfile",
  "type",
  "binaries",
  "requirements",
  "hardenedRuntime",
  "gatekeeperAssess",
  "strictVerify",
  "preAutoEntitlements",
  "timestamp",
  "additionalArguments",
] as const

// Universal-build fields that moved from the platform root into the `universal` (ElectronUniversalOptions) bag.
export const MAC_UNIVERSAL_FIELDS = ["mergeASARs", "singleArchFiles", "x64ArchFiles"] as const

/**
 * Applies all v26→v27 config transformations to a parsed config object.
 * Pure function — no I/O, safe to call in tests.
 */
export function migrateConfig(raw: Record<string, any>): MigrationResult {
  const c: Record<string, any> = JSON.parse(JSON.stringify(raw))
  const changes: MigrationChange[] = []
  const warnings: string[] = []

  // ── 1. electronCompile ────────────────────────────────────────────────────
  if ("electronCompile" in c) {
    delete c.electronCompile
    changes.push({ key: "electronCompile", description: "removed electronCompile (unsupported since v27; migrate to electron-vite, esbuild, or webpack)" })
  }

  // ── 2. Removed framework fields ──────────────────────────────────────────
  for (const key of ["framework", "nodeVersion", "launchUiVersion"] as const) {
    if (key in c) {
      delete c[key]
      changes.push({ key, description: `removed ${key} (Electron is the only supported framework in v27)` })
    }
  }

  // ── 3. npmSkipBuildFromSource → buildDependenciesFromSource ───────────────
  if ("npmSkipBuildFromSource" in c) {
    // will be picked up by the nativeModules step below
    if (!("buildDependenciesFromSource" in c)) {
      c.buildDependenciesFromSource = !c.npmSkipBuildFromSource
    }
    delete c.npmSkipBuildFromSource
    changes.push({ key: "npmSkipBuildFromSource", description: "renamed npmSkipBuildFromSource → buildDependenciesFromSource (then grouped under nativeModules)" })
  }

  // ── 4. nativeModules grouping ─────────────────────────────────────────────
  const rootNativeKeys = ["buildDependenciesFromSource", "nodeGypRebuild", "npmRebuild", "nativeRebuilder"] as const
  if (rootNativeKeys.some(k => k in c)) {
    const sub: Record<string, any> = { ...(c.nativeModules ?? {}) }
    for (const key of ["buildDependenciesFromSource", "nodeGypRebuild", "npmRebuild"] as const) {
      if (key in c) {
        sub[key] = c[key]
        delete c[key]
        changes.push({ key, description: `moved ${key} → nativeModules.${key}` })
      }
    }
    if ("nativeRebuilder" in c) {
      sub.rebuildMode = c.nativeRebuilder
      delete c.nativeRebuilder
      changes.push({ key: "nativeRebuilder", description: "renamed nativeRebuilder → nativeModules.rebuildMode" })
    }
    c.nativeModules = sub
  }

  // ── 5. Legacy asar keys → asarUnpack ─────────────────────────────────────
  // Hyphenated root-level variants
  for (const old of ["asar-unpack", "asar-unpack-dir"] as const) {
    if (old in c) {
      c.asarUnpack = mergeAsarUnpack(c.asarUnpack, c[old])
      delete c[old]
      changes.push({ key: old, description: `renamed ${old} → asarUnpack` })
    }
  }
  // Nested asar.unpackDir (legacy pre-v26; asar.unpack is now the canonical location, handled in step 11)
  if (c.asar != null && typeof c.asar === "object") {
    if ("unpackDir" in c.asar) {
      c.asarUnpack = mergeAsarUnpack(c.asarUnpack, c.asar.unpackDir)
      delete c.asar.unpackDir
      changes.push({ key: "asar.unpackDir", description: "moved asar.unpackDir → asarUnpack" })
    }
    if (Object.keys(c.asar).length === 0) {
      delete c.asar
    }
  }

  // ── 6. appImage.systemIntegration removed ────────────────────────────────
  if (c.appImage != null && "systemIntegration" in c.appImage) {
    delete c.appImage.systemIntegration
    changes.push({ key: "appImage.systemIntegration", description: "removed appImage.systemIntegration (handled automatically by AppImageLauncher in v27)" })
    if (Object.keys(c.appImage).length === 0) {
      delete c.appImage
    }
  }

  // ── 7. GithubOptions.vPrefixedTagName → tagNamePrefix ─────────────────────
  if (c.publish != null) {
    migratePublishEntries(c, "publish", changes)
  }
  // Also handle publish nested inside mac/win/linux
  for (const platform of ["mac", "win", "linux"] as const) {
    if (c[platform]?.publish != null) {
      migratePublishEntries(c[platform], "publish", changes)
    }
  }

  // ── 8. snap → snapcraft restructuring ─────────────────────────────────────
  if ("snap" in c) {
    migrateSnap(c, changes, warnings)
  }

  // ── 9. helper-bundle-id → mac.helperBundleId ──────────────────────────────
  if ("helper-bundle-id" in c) {
    const mac: Record<string, any> = { ...(c.mac ?? {}) }
    if (!("helperBundleId" in mac)) {
      mac.helperBundleId = c["helper-bundle-id"]
    }
    delete c["helper-bundle-id"]
    c.mac = mac
    changes.push({ key: "helper-bundle-id", description: "moved helper-bundle-id → mac.helperBundleId" })
  }

  // ── 10. squirrelWindows.noMsi → squirrelWindows.msi (inverted) ────────────
  if (c.squirrelWindows != null && typeof c.squirrelWindows === "object" && "noMsi" in c.squirrelWindows) {
    const sq: Record<string, any> = c.squirrelWindows
    if (!("msi" in sq)) {
      sq.msi = !sq.noMsi
    }
    delete sq.noMsi
    changes.push({ key: "squirrelWindows.noMsi", description: "replaced squirrelWindows.noMsi → squirrelWindows.msi (inverted boolean)" })
  }

  // ── 11. asar consolidation ───────────────────────────────────────────────
  // Move root-level asarUnpack / disableSanityCheckAsar / disableAsarIntegrity
  // into the asar object. Skip entirely when asar === false (all would be no-ops).
  if (c.asar !== false) {
    const asarSub: Record<string, any> = typeof c.asar === "object" && c.asar != null ? { ...c.asar } : {}
    if ("asarUnpack" in c) {
      asarSub.unpack = mergeAsarUnpack(asarSub.unpack, c.asarUnpack)
      delete c.asarUnpack
      changes.push({ key: "asarUnpack", description: "moved asarUnpack → asar.unpack" })
    }
    if ("disableSanityCheckAsar" in c) {
      asarSub.disableSanityCheck = c.disableSanityCheckAsar
      delete c.disableSanityCheckAsar
      changes.push({ key: "disableSanityCheckAsar", description: "moved disableSanityCheckAsar → asar.disableSanityCheck" })
    }
    if ("disableAsarIntegrity" in c) {
      asarSub.disableIntegrity = c.disableAsarIntegrity
      delete c.disableAsarIntegrity
      changes.push({ key: "disableAsarIntegrity", description: "moved disableAsarIntegrity → asar.disableIntegrity" })
    }
    if (c.asar === true) {
      if (Object.keys(asarSub).length > 0) {
        c.asar = asarSub
      } else {
        delete c.asar
      }
      changes.push({ key: "asar", description: "replaced asar: true with asar object (true is no longer a valid value)" })
    } else if (Object.keys(asarSub).length > 0) {
      c.asar = asarSub
    }
  }

  // ── 12. win.sign unification ───────────────────────────────────────────────
  // win.signtoolOptions → win.sign: { type: "signtool", … }
  // win.azureSignOptions → win.sign: { type: "azure", … }  (extra keys → additionalMetadata)
  // win.signAndEditExecutable / win.signExecutable removed
  if (c.win != null && typeof c.win === "object") {
    const win: Record<string, any> = c.win

    // Remove defunct flags — signAndEditExecutable/signExecutable no longer exist in v27.
    if ("signAndEditExecutable" in win) {
      const val = win.signAndEditExecutable
      delete win.signAndEditExecutable
      if (val === false) {
        warnings.push(
          "win.signAndEditExecutable: false was used to skip both resource editing and signing. " +
            "In v27, resource editing always runs. To skip signing only, set win.sign: false. " +
            "There is no v27 equivalent that also skips resource editing — apply resources manually if needed."
        )
      } else {
        changes.push({ key: "win.signAndEditExecutable", description: "removed win.signAndEditExecutable (resource editing always runs in v27; was the default)" })
      }
    }
    if ("signExecutable" in win) {
      const val = win.signExecutable
      delete win.signExecutable
      if (val === false && !("sign" in win)) {
        win.sign = false
        changes.push({ key: "win.signExecutable", description: "replaced win.signExecutable: false with win.sign: false (disables signing; resource editing still runs)" })
      } else {
        changes.push({ key: "win.signExecutable", description: "removed win.signExecutable (signing is enabled by default when credentials are available)" })
      }
    }

    const hasAzure = win.azureSignOptions != null
    const hasSigntool = win.signtoolOptions != null

    if (hasAzure || hasSigntool) {
      const signAlreadySet = "sign" in win && win.sign !== null && win.sign !== undefined

      if (signAlreadySet) {
        warnings.push(
          "win.sign is already set alongside " +
            (hasAzure ? "win.azureSignOptions" : "win.signtoolOptions") +
            ". Remove the legacy key manually after verifying win.sign is correct."
        )
      } else {
        if (hasAzure && hasSigntool) {
          warnings.push(
            "Both win.azureSignOptions and win.signtoolOptions are set. " +
              "win.signtoolOptions will be dropped and win.azureSignOptions will be migrated to win.sign: { type: 'azure', … } (Azure took priority in v26). " +
              "Verify the migrated win.sign block is correct for your project."
          )
          delete win.signtoolOptions
        }

        if (hasAzure) {
          const azure: Record<string, any> = { ...win.azureSignOptions }
          delete win.azureSignOptions

          // Move extra (untyped) keys into additionalMetadata
          const extra: Record<string, string> = {}
          for (const [k, v] of Object.entries(azure)) {
            if (!AZURE_KNOWN_FIELDS.has(k) && typeof v === "string") {
              extra[k] = v
              delete azure[k]
            }
          }
          if (Object.keys(extra).length > 0) {
            azure.additionalMetadata = { ...(azure.additionalMetadata ?? {}), ...extra }
            changes.push({
              key: "win.azureSignOptions",
              description: `moved extra keys [${Object.keys(extra).join(", ")}] into win.sign.additionalMetadata`,
            })
          }

          win.sign = { ...azure, type: "azure" }
          changes.push({ key: "win.azureSignOptions", description: 'moved win.azureSignOptions → win.sign: { type: "azure", … }' })
        } else {
          const signtool: Record<string, any> = { ...win.signtoolOptions }
          delete win.signtoolOptions
          win.sign = { ...signtool, type: "signtool" }
          changes.push({ key: "win.signtoolOptions", description: 'moved win.signtoolOptions → win.sign: { type: "signtool", … }' })
        }
      }
    }
  }

  // ── 13. mac/mas/masDev signing + universal consolidation ──────────────────
  // Signing fields (incl. identity) move into `sign`; mergeASARs/singleArchFiles/x64ArchFiles into `universal`.
  for (const platform of ["mac", "mas", "masDev"] as const) {
    if (c[platform] != null && typeof c[platform] === "object") {
      migrateMacSigning(c[platform], platform, changes, warnings)
      migrateMacUniversal(c[platform], platform, changes)
    }
  }

  // ── 14. electronDownload → electronGet ────────────────────────────────────
  if ("electronDownload" in c) {
    migrateElectronDownload(c, changes, warnings)
  }

  return { migrated: c, changes, warnings, modified: changes.length > 0 || warnings.length > 0 }
}

/**
 * Moves macOS signing fields from a platform config (mac/mas/masDev) into the `sign` bag and
 * renames `signIgnore` → `sign.ignore`. In v26 `sign` was only a custom-signer (string path / module id),
 * so a non-object `sign` cannot absorb these options — that case is warned about, not clobbered.
 * A bare `sign: null` (v26 "no custom signer") is dropped so it does not flip to v27's "skip signing".
 */
function migrateMacSigning(platform: Record<string, any>, name: string, changes: MigrationChange[], warnings: string[]) {
  const present = MAC_SIGN_FIELDS.filter(f => f in platform)
  const hasSignIgnore = "signIgnore" in platform
  const existingSign = platform.sign
  const signIsCustom = typeof existingSign === "string" || typeof existingSign === "function"

  if (present.length === 0 && !hasSignIgnore) {
    // Only thing to fix is a semantically-flipped bare null
    if (existingSign === null) {
      delete platform.sign
      changes.push({ key: `${name}.sign`, description: `removed ${name}.sign: null (v26 "no custom signer" = v27 default; sign: null now means skip signing)` })
    }
    return
  }

  if (signIsCustom) {
    const fields = [...present, ...(hasSignIgnore ? ["signIgnore"] : [])].join(", ")
    warnings.push(
      `${name}.sign is a custom signing function/path, which cannot hold options. Move [${fields}] into an ElectronSignOptions object manually, or keep the custom signer and drop them.`
    )
    return
  }

  // existingSign is null/undefined or already an object → build the merged options bag
  const signObj: Record<string, any> = existingSign != null && typeof existingSign === "object" ? { ...existingSign } : {}
  for (const f of present) {
    signObj[f] = platform[f]
    delete platform[f]
    changes.push({ key: `${name}.${f}`, description: `moved ${name}.${f} → ${name}.sign.${f}` })
  }
  if (hasSignIgnore) {
    signObj.ignore = platform.signIgnore
    delete platform.signIgnore
    changes.push({ key: `${name}.signIgnore`, description: `renamed ${name}.signIgnore → ${name}.sign.ignore` })
  }
  platform.sign = signObj
}

/** Moves universal-build fields from a platform config into the `universal` bag. */
function migrateMacUniversal(platform: Record<string, any>, name: string, changes: MigrationChange[]) {
  const present = MAC_UNIVERSAL_FIELDS.filter(f => f in platform)
  if (present.length === 0) {
    return
  }
  const universalObj: Record<string, any> = platform.universal != null && typeof platform.universal === "object" ? { ...platform.universal } : {}
  for (const f of present) {
    universalObj[f] = platform[f]
    delete platform[f]
    changes.push({ key: `${name}.${f}`, description: `moved ${name}.${f} → ${name}.universal.${f}` })
  }
  platform.universal = universalObj
}

// electronDownload fields with no equivalent in the v27 ElectronGetOptions (@electron/get v5) shape.
export const ELECTRON_DOWNLOAD_DROPPED = ["cache", "customDir", "customFilename", "strictSSL", "platform", "arch", "version"] as const

/**
 * Renames `electronDownload` → `electronGet` and reshapes it to ElectronGetOptions.
 * `mirror` → `mirrorOptions.mirror`, `isVerifyChecksum: false` → `unsafelyDisableChecksums: true`.
 * Fields with no v5 equivalent are dropped with a warning.
 */
function migrateElectronDownload(c: Record<string, any>, changes: MigrationChange[], warnings: string[]) {
  const old = c.electronDownload
  delete c.electronDownload

  if (old == null || typeof old !== "object") {
    changes.push({ key: "electronDownload", description: "renamed electronDownload → electronGet" })
    if (old != null) {
      c.electronGet = old
    }
    return
  }

  const next: Record<string, any> = { ...(c.electronGet ?? {}) }
  if ("mirror" in old && old.mirror != null) {
    next.mirrorOptions = { ...(next.mirrorOptions ?? {}), mirror: old.mirror }
  }
  if (old.isVerifyChecksum === false) {
    next.unsafelyDisableChecksums = true
  }
  // Carry over any already-valid ElectronGetOptions fields (mirrorOptions, unsafelyDisableChecksums, force, etc.)
  for (const [k, v] of Object.entries(old)) {
    if (k !== "mirror" && k !== "isVerifyChecksum" && !ELECTRON_DOWNLOAD_DROPPED.includes(k as any)) {
      next[k] = v
    }
  }

  const dropped = ELECTRON_DOWNLOAD_DROPPED.filter(k => k in old)
  if (dropped.length > 0) {
    warnings.push(
      `electronGet (formerly electronDownload) dropped [${dropped.join(", ")}] — these have no equivalent in @electron/get v5. Set a mirror via electronGet.mirrorOptions if needed.`
    )
  }

  c.electronGet = next
  changes.push({ key: "electronDownload", description: "renamed electronDownload → electronGet (mirror → mirrorOptions.mirror; isVerifyChecksum → unsafelyDisableChecksums)" })
}

function mergeAsarUnpack(existing: string | string[] | undefined, incoming: string | string[]): string | string[] {
  if (existing == null) {
    return incoming
  }
  const arr = (Array.isArray(existing) ? existing : [existing]).concat(Array.isArray(incoming) ? incoming : [incoming])
  return arr.length === 1 ? arr[0] : arr
}

function migratePublishEntries(parent: Record<string, any>, key: string, changes: MigrationChange[]) {
  const entries: any[] = Array.isArray(parent[key]) ? parent[key] : [parent[key]]
  let changed = false
  for (const entry of entries) {
    if (entry != null && entry.provider === "github" && "vPrefixedTagName" in entry) {
      entry.tagNamePrefix = entry.vPrefixedTagName === false ? "" : "v"
      delete entry.vPrefixedTagName
      changed = true
    }
    // GitLab keeps vPrefixedTagName in v27 — it remains in the type, scheme, and runtime
    // (gitlabPublisher honors it) and has no tagNamePrefix equivalent, so leave it untouched.
  }
  if (changed) {
    changes.push({ key: `${key}[].vPrefixedTagName`, description: "replaced vPrefixedTagName with tagNamePrefix on GitHub publish entries" })
  }
}

// snap bases recognized by the v27 snapcraft config. "custom" uses an inline/path yaml
// and must be moved verbatim rather than nested under a per-base sub-key.
export const SNAP_BASES = new Set(["core18", "core20", "core22", "core24", "custom"])

/**
 * Migrates the removed flat `snap` config into the v27 `snapcraft` shape:
 *   { snapcraft: { base, [base]: { ...rest } } }
 * When no `base` is present, defaults to "core20" (the v27 1-to-1 migration target) and warns.
 */
function migrateSnap(c: Record<string, any>, changes: MigrationChange[], warnings: string[]) {
  const snap = c.snap
  delete c.snap

  if (snap == null || typeof snap !== "object") {
    changes.push({ key: "snap", description: "removed empty snap config (use snapcraft in v27)" })
    return
  }

  const snapcraft: Record<string, any> = { ...(c.snapcraft ?? {}) }
  const rest: Record<string, any> = { ...snap }
  let base: string | undefined = rest.base
  delete rest.base

  if (base === "custom") {
    // base: custom carries yamlPath / inline yaml — move verbatim, no per-base nesting
    snapcraft.base = "custom"
    Object.assign(snapcraft, rest)
    c.snapcraft = snapcraft
    changes.push({ key: "snap", description: "moved snap (base: custom) → snapcraft verbatim" })
    return
  }

  let assumed = false
  if (base == null || !SNAP_BASES.has(base)) {
    if (base != null) {
      warnings.push(`snap config had an unrecognized base "${base}"; assumed "core20". Verify the snapcraft.base value (core18/core20/core22/core24/custom).`)
    }
    base = "core20"
    assumed = true
  }

  snapcraft.base = base
  snapcraft[base] = { ...(snapcraft[base] ?? {}), ...rest }
  c.snapcraft = snapcraft
  changes.push({ key: "snap", description: `moved snap → snapcraft.${base}${assumed ? " (base defaulted to core20)" : ""}` })
  if (assumed && warnings.every(w => !w.includes("unrecognized base"))) {
    warnings.push('snap config had no "base"; assumed "core20" for snapcraft. Verify and adjust the base if needed (core18/core20/core22/core24).')
  }
}

// ─── File I/O ─────────────────────────────────────────────────────────────────

type ConfigFormat = "json" | "json5" | "yaml" | "toml" | "js"

function formatFromPath(p: string): ConfigFormat {
  const ext = path.extname(p).toLowerCase()
  if (ext === ".json") {
    return "json"
  }
  if (ext === ".json5") {
    return "json5"
  }
  if (ext === ".yml" || ext === ".yaml") {
    return "yaml"
  }
  if (ext === ".toml") {
    return "toml"
  }
  return "js"
}

function serializeConfig(content: Record<string, any>, format: ConfigFormat, originalText: string): string {
  if (format === "yaml") {
    const yaml = _require("js-yaml") as { dump(obj: unknown, opts?: { lineWidth?: number; quotingType?: string; forceQuotes?: boolean }): string }
    return yaml.dump(content, { lineWidth: 120, quotingType: '"', forceQuotes: false })
  }
  // JSON and JSON5: detect original indent level
  const indentMatch = originalText.match(/^{\s*\n( +)/m)
  const indent = indentMatch ? indentMatch[1].length : 2
  return JSON.stringify(content, null, indent) + "\n"
}

interface FoundConfig {
  /** Absolute path to the file, or null when config is in package.json */
  readonly configFile: string | null
  readonly isPackageJson: boolean
  readonly format: ConfigFormat
  readonly rawText: string
  readonly parsed: Record<string, any>
  /** package.json only: a root-level `directories` key was folded into `build.directories` */
  readonly rootDirectoriesMoved?: boolean
}

async function findAndLoadConfig(projectDir: string, explicitConfigPath?: string | null): Promise<FoundConfig | null> {
  if (explicitConfigPath != null) {
    const abs = path.resolve(projectDir, explicitConfigPath)
    const text = await readFileSafe(abs)
    if (text == null) {
      log.error({ configFile: abs }, "config file not found")
      return null
    }
    const format = formatFromPath(abs)
    return { configFile: abs, isPackageJson: false, format, rawText: text, parsed: parseConfig(text, format) }
  }

  // Check package.json build key first
  const pkgPath = path.join(projectDir, "package.json")
  const pkgText = await readFileSafe(pkgPath)
  if (pkgText != null) {
    const pkg = JSON.parse(pkgText)
    if (pkg.build != null && typeof pkg.build === "object") {
      const build: Record<string, any> = pkg.build
      let rootDirectoriesMoved = false
      if (pkg.directories != null && build.directories == null) {
        build.directories = pkg.directories
        rootDirectoriesMoved = true
      }
      return { configFile: null, isPackageJson: true, format: "json", rawText: pkgText, parsed: build, rootDirectoriesMoved }
    }
  }

  // Standalone config files
  const candidates = [".yml", ".yaml", ".json", ".json5", ".toml", ".js", ".cjs", ".mjs", ".ts"].map(ext => path.join(projectDir, `electron-builder${ext}`))
  for (const candidate of candidates) {
    const text = await readFileSafe(candidate)
    if (text != null) {
      const format = formatFromPath(candidate)
      return { configFile: candidate, isPackageJson: false, format, rawText: text, parsed: parseConfig(text, format) }
    }
  }

  return null
}

function parseConfig(text: string, format: ConfigFormat): Record<string, any> {
  if (format === "js") {
    // Programmatic configs (JS/TS/MJS/CJS) can't be parsed; migrateSchema will bail with manual steps
    return {}
  }
  if (format === "yaml") {
    const yaml = _require("js-yaml") as { load(text: string): unknown }
    return yaml.load(text) as Record<string, any>
  }
  if (format === "json5") {
    const json5 = _require("json5") as { parse(text: string): any }
    return json5.parse(text)
  }
  if (format === "toml") {
    const toml = _require("toml") as { parse(text: string): any }
    return toml.parse(text)
  }
  return JSON.parse(text)
}

async function readFileSafe(p: string): Promise<string | null> {
  return orNullIfFileNotExist(fs.readFile(p, "utf8"))
}

async function writeBackConfig(found: FoundConfig, migrated: Record<string, any>, projectDir: string): Promise<string> {
  if (found.isPackageJson) {
    const pkgPath = path.join(projectDir, "package.json")
    const pkg = JSON.parse(found.rawText)
    pkg.build = migrated
    if (found.rootDirectoriesMoved) {
      delete pkg.directories
    }
    const indentMatch = found.rawText.match(/^{\s*\n( +)/m)
    const indent = indentMatch ? indentMatch[1].length : 2
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, indent) + "\n", "utf8")
    return "package.json"
  }
  const serialized = serializeConfig(migrated, found.format, found.rawText)
  await fs.writeFile(found.configFile!, serialized, "utf8")
  return path.relative(projectDir, found.configFile!)
}

// ─── CLI command ──────────────────────────────────────────────────────────────

export function configureMigrateSchemaCommand(yargs: Argv): Argv {
  return yargs
    .option("config", {
      alias: "c",
      type: "string",
      description: "Path to config file (auto-detected if omitted)",
    })
    .option("project-dir", {
      type: "string",
      description: "Project root directory",
      default: process.cwd(),
    })
    .option("dry-run", {
      alias: "n",
      type: "boolean",
      default: false,
      description: "Print what would change without writing",
    })
}

export async function migrateSchema(args: any): Promise<void> {
  const projectDir: string = path.resolve((args["project-dir"] as string | undefined) ?? process.cwd())
  const configPath: string | null = (args.config as string | undefined) ?? null
  const dryRun: boolean = (args["dry-run"] as boolean | undefined) ?? false

  const found = await findAndLoadConfig(projectDir, configPath)
  if (found == null) {
    log.error(null, "no config found — checked package.json build key and electron-builder.{yml,yaml,json,json5,toml,js,cjs,ts}")
    process.exit(1)
  }

  const location = found.isPackageJson ? 'package.json ("build" key)' : path.relative(projectDir, found.configFile!)
  log.info({ file: location }, "loaded config")

  // Programmatic formats (JS/TS) are rewritten surgically via an AST-located text codemod.
  if (found.format === "js") {
    await migrateProgrammaticConfigFile(found, location, dryRun)
    return
  }

  // TOML: can parse but not serialize (toml lib is read-only)
  const isToml = found.format === "toml"

  const result = migrateConfig(found.parsed)
  const { migrated, warnings } = result
  const changes = [...result.changes]
  if (found.rootDirectoriesMoved) {
    changes.push({ key: "directories", description: "moved package.json root-level directories → build.directories" })
  }
  const modified = result.modified || found.rootDirectoriesMoved === true

  if (!modified) {
    log.info(null, "config is already up to date — no changes needed")
    return
  }

  for (const change of changes) {
    log.info({ key: change.key }, change.description)
  }
  for (const warning of warnings) {
    log.warn(null, warning)
  }

  if (isToml) {
    log.warn({ file: location }, "TOML configs cannot be automatically rewritten; apply the changes above manually")
    return
  }

  if (dryRun) {
    log.info(null, "dry run — no files written")
    return
  }

  const written = await writeBackConfig(found, migrated, projectDir)
  log.info({ file: written }, "wrote migrated config")

  if (found.format === "json5") {
    log.warn(null, "JSON5 was re-serialized as JSON — comments were not preserved")
  }
}

async function migrateProgrammaticConfigFile(found: FoundConfig, location: string, dryRun: boolean): Promise<void> {
  if (loadTypeScript() == null) {
    log.warn(
      { file: location },
      "auto-migration of programmatic configs requires the 'typescript' package, which was not found. Install it (e.g. `npm i -D typescript`) or apply these changes manually:"
    )
    printManualSteps()
    return
  }

  const result = migrateProgrammaticSource(found.rawText, found.configFile!)

  if (result.status === "unsupported") {
    log.warn({ file: location, reason: result.unsupportedReason }, "this programmatic config could not be auto-migrated; apply these changes manually:")
    printManualSteps()
    return
  }

  if (result.status === "no-op") {
    log.info(null, "config is already up to date — no changes needed")
    return
  }

  for (const change of result.changes) {
    log.info({ key: change.key }, change.description)
  }
  for (const warning of result.warnings) {
    log.warn(null, warning)
  }

  if (dryRun) {
    log.info(null, "dry run — no files written")
    return
  }

  await fs.writeFile(found.configFile!, result.code, "utf8")
  log.info({ file: location }, "wrote migrated config")
}

function printManualSteps() {
  const steps = [
    "",
    "• Remove electronCompile",
    "• Remove framework, nodeVersion, launchUiVersion",
    "• Rename npmSkipBuildFromSource → buildDependenciesFromSource",
    "• Move buildDependenciesFromSource, nodeGypRebuild, npmRebuild, nativeRebuilder into nativeModules (rename nativeRebuilder → rebuildMode)",
    "• Rename asar-unpack / asar-unpack-dir / asar.unpack / asar.unpackDir → asarUnpack; then move asarUnpack → asar.unpack",
    "• Move disableSanityCheckAsar → asar.disableSanityCheck",
    "• Move disableAsarIntegrity → asar.disableIntegrity",
    "• Replace asar: true with an asar object (e.g. asar: {} or omit entirely - asar is enabled by default)",
    "• Remove appImage.systemIntegration",
    "• Rename snap → snapcraft; nest options under a base-named sub-key (default base: core20)",
    "• Replace vPrefixedTagName with tagNamePrefix on GitHub publish entries ('v' is the default prefix - just like before - but can now be customized with tagNamePrefix)",
    "• Move win.signtoolOptions → win.sign: { type: 'signtool', ...fields }",
    "• Move win.azureSignOptions → win.sign: { type: 'azure', ...fields }; move untyped extra keys into win.sign.additionalMetadata",
    "• Remove win.signAndEditExecutable (resource editing always runs in v27); replace win.signExecutable: false with win.sign: false",
    "• Move helper-bundle-id → mac.helperBundleId",
    "• Replace squirrelWindows.noMsi with squirrelWindows.msi (inverted)",
    "• Move mac/mas/masDev signing fields (identity, entitlements, hardenedRuntime, type, requirements, timestamp, binaries, gatekeeperAssess, strictVerify, preAutoEntitlements, provisioningProfile, additionalArguments) into the `sign` object; rename signIgnore → sign.ignore",
    "• Move mac/mas/masDev mergeASARs / singleArchFiles / x64ArchFiles into the `universal` object",
    "• Rename electronDownload → electronGet (mirror → mirrorOptions.mirror; isVerifyChecksum:false → unsafelyDisableChecksums:true)",
    "• Move root-level package.json directories → build.directories",
    "",
    "• For programmatic configs (JS/TS/MJS/CJS), apply the above changes manually to your config object",
    "• For additional guidance, check the migration guide: https://www.electron.build/docs/migration/v26-to-v27",
  ]
  for (const step of steps) {
    process.stdout.write(`  ${step}\n`)
  }
}
