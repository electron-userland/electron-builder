import { createRequire } from "node:module"
import { log } from "builder-util"
import { promises as fs } from "fs"
import * as path from "path"
import type { Argv } from "yargs"

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

// Azure Trusted Signing fields that are typed in v27
const AZURE_KNOWN_FIELDS = new Set([
  "type",
  "endpoint",
  "codeSigningAccountName",
  "certificateProfileName",
  "publisherName",
  "fileDigest",
  "timestampRfc3161",
  "timestampDigest",
])

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
  // Nested asar.unpack / asar.unpackDir
  if (c.asar != null && typeof c.asar === "object") {
    for (const nested of ["unpack", "unpackDir"] as const) {
      if (nested in c.asar) {
        c.asarUnpack = mergeAsarUnpack(c.asarUnpack, c.asar[nested])
        delete c.asar[nested]
        changes.push({ key: `asar.${nested}`, description: `moved asar.${nested} → asarUnpack` })
      }
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

  // ── 8. snap key removed (warn only — structure changed too much) ──────────
  if ("snap" in c) {
    warnings.push(
      'The "snap" config key is removed in v27. Rename it to "snapcraft" and restructure: ' +
        'move all snap-specific options under a sub-key named after your base (e.g., "core22"). ' +
        'See https://www.electron.build/docs/migration/v26-to-v27#snap for details.'
    )
  }

  // ── 9. azureSignOptions: index-signature extra keys → additionalMetadata ──
  if (c.win?.azureSignOptions != null) {
    const azure: Record<string, any> = c.win.azureSignOptions
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
        description: `moved extra keys [${Object.keys(extra).join(", ")}] into win.azureSignOptions.additionalMetadata`,
      })
    }
  }

  return { migrated: c, changes, warnings, modified: changes.length > 0 || warnings.length > 0 }
}

function mergeAsarUnpack(existing: string | string[] | undefined, incoming: string | string[]): string | string[] {
  if (existing == null) return incoming
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
    if (entry != null && entry.provider === "gitlab" && "vPrefixedTagName" in entry) {
      delete entry.vPrefixedTagName
      changed = true
    }
  }
  if (changed) {
    changes.push({ key: `${key}[].vPrefixedTagName`, description: "replaced vPrefixedTagName with tagNamePrefix on GitHub publish entries; removed from GitLab entries" })
  }
}

// ─── File I/O ─────────────────────────────────────────────────────────────────

type ConfigFormat = "json" | "json5" | "yaml" | "toml" | "js"

function formatFromPath(p: string): ConfigFormat {
  const ext = path.extname(p).toLowerCase()
  if (ext === ".json") return "json"
  if (ext === ".json5") return "json5"
  if (ext === ".yml" || ext === ".yaml") return "yaml"
  if (ext === ".toml") return "toml"
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
      return { configFile: null, isPackageJson: true, format: "json", rawText: pkgText, parsed: pkg.build }
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
  return fs.readFile(p, "utf8").catch(e => (e.code === "ENOENT" || e.code === "ENOTDIR" ? null : Promise.reject(e)))
}

async function writeBackConfig(found: FoundConfig, migrated: Record<string, any>, projectDir: string): Promise<string> {
  if (found.isPackageJson) {
    const pkgPath = path.join(projectDir, "package.json")
    const pkg = JSON.parse(found.rawText)
    pkg.build = migrated
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

  // Programmatic formats can't be auto-rewritten
  if (found.format === "js") {
    log.warn({ file: location }, "programmatic config cannot be auto-migrated; apply these changes manually:")
    printManualSteps()
    return
  }

  // TOML: can parse but not serialize (toml lib is read-only)
  const isToml = found.format === "toml"

  const { migrated, changes, warnings, modified } = migrateConfig(found.parsed)

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

function printManualSteps() {
  const steps = [
    "• Remove electronCompile",
    "• Remove framework, nodeVersion, launchUiVersion",
    "• Rename npmSkipBuildFromSource → buildDependenciesFromSource",
    "• Move buildDependenciesFromSource, nodeGypRebuild, npmRebuild, nativeRebuilder into nativeModules (rename nativeRebuilder → rebuildMode)",
    "• Rename asar-unpack / asar-unpack-dir / asar.unpack / asar.unpackDir → asarUnpack",
    "• Remove appImage.systemIntegration",
    "• Rename snap → snapcraft; restructure options under a base-named sub-key",
    "• Replace vPrefixedTagName with tagNamePrefix on GitHub publish entries",
    "• Move extra keys in win.azureSignOptions into an additionalMetadata object",
  ]
  for (const step of steps) {
    process.stdout.write(`  ${step}\n`)
  }
}
