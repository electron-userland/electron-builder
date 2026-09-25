import { createRequire } from "node:module"
import * as path from "path"
import {
  ASAR_PLATFORM_KEYS,
  AZURE_KNOWN_FIELDS,
  ELECTRON_DOWNLOAD_DROPPED,
  isLegacyElectronDownloadKey,
  MAC_ENTITLEMENTS_ADVISORY,
  MAC_NULL_MEANS_UNSET_FIELDS,
  MAC_SIGN_FIELDS,
  MAC_SIGN_REMOVED_FIELDS,
  MAC_UNIVERSAL_FIELDS,
  NSIS_WEB_ADVISORY,
  SNAP_BASES,
  SNAP_CORE24_UNSUPPORTED,
} from "./migrate-schema.js"
import type { MigrationChange } from "./migrate-schema.js"

const _require = createRequire(import.meta.url)

// `typescript` is intentionally NOT a dependency of electron-builder — it is loaded lazily (same
// pattern as js-yaml/json5/toml) and the feature degrades to manual steps when it is unavailable.
// Types are kept loose (`any`) on purpose so no `typescript` types are required at compile time.
let tsModuleCache: any | null | undefined
export function loadTypeScript(): any | null {
  if (tsModuleCache !== undefined) {
    return tsModuleCache
  }
  try {
    tsModuleCache = _require("typescript")
  } catch {
    tsModuleCache = null
  }
  return tsModuleCache
}

export type ProgrammaticMigrationStatus = "migrated" | "no-op" | "unsupported"

export interface ProgrammaticMigrationResult {
  /** Rewritten source. Equal to the input when nothing changed or the config is unsupported. */
  readonly code: string
  readonly changes: MigrationChange[]
  readonly warnings: string[]
  /** Informational notices that are not config changes — they never affect `status` or trigger a file write. */
  readonly advisories: string[]
  readonly status: ProgrammaticMigrationStatus
  /** Set when status === "unsupported": why the config could not be auto-migrated. */
  readonly unsupportedReason?: string
}

interface Edit {
  start: number
  end: number
  text: string
}

/**
 * Migrates a programmatic JS/TS electron-builder config (the same v26→v27 transforms as
 * {@link migrateConfig}) by surgically rewriting the source text. The TypeScript parser is used only
 * to locate node ranges; everything outside an edited range is preserved byte-for-byte, so comments,
 * imports, functions, and formatting are untouched.
 *
 * Pure: source string in, result out. No file I/O. Returns status "unsupported" (with the source
 * unchanged) when typescript is not installed or the config cannot be statically reduced to a single
 * object literal (function that builds the object dynamically, spreads, computed keys, …).
 */
export function migrateProgrammaticSource(sourceText: string, fileName: string): ProgrammaticMigrationResult {
  const ts = loadTypeScript()
  if (ts == null) {
    return { code: sourceText, changes: [], warnings: [], advisories: [], status: "unsupported", unsupportedReason: "typescript-not-installed" }
  }

  const scriptKind = scriptKindFor(ts, fileName)
  const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, /* setParentNodes */ true, scriptKind)

  const codemod = new ConfigCodemod(ts, sf, sourceText)
  const located = codemod.locateConfigObject()
  if (located.objLit == null) {
    return { code: sourceText, changes: [], warnings: [], advisories: [], status: "unsupported", unsupportedReason: located.reason }
  }

  codemod.run(located.objLit)
  if (codemod.edits.length === 0) {
    return { code: sourceText, changes: codemod.changes, warnings: codemod.warnings, advisories: codemod.advisories, status: "no-op" }
  }
  return { code: codemod.apply(), changes: codemod.changes, warnings: codemod.warnings, advisories: codemod.advisories, status: "migrated" }
}

function scriptKindFor(ts: any, fileName: string): any {
  const ext = path.extname(fileName).toLowerCase()
  switch (ext) {
    case ".ts":
    case ".cts":
    case ".mts":
      return ts.ScriptKind.TS
    case ".tsx":
      return ts.ScriptKind.TSX
    case ".jsx":
      return ts.ScriptKind.JSX
    default:
      return ts.ScriptKind.JS
  }
}

class ConfigCodemod {
  readonly edits: Edit[] = []
  readonly changes: MigrationChange[] = []
  readonly warnings: string[] = []
  readonly advisories: string[] = []
  private indentUnit = "  "

  constructor(
    private readonly ts: any,
    private readonly sf: any,
    private readonly text: string
  ) {}

  // ── Locate the config object literal ──────────────────────────────────────

  locateConfigObject(): { objLit?: any; reason?: string } {
    const ts = this.ts
    const candidates: any[] = []

    for (const stmt of this.sf.statements) {
      if (ts.isExportAssignment(stmt)) {
        // `export default <expr>` and `export = <expr>`
        candidates.push(stmt.expression)
      } else if (ts.isExpressionStatement(stmt) && ts.isBinaryExpression(stmt.expression) && stmt.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const lhs = stmt.expression.left
        if (this.isModuleExportsTarget(lhs)) {
          candidates.push(stmt.expression.right)
        }
      } else if (ts.isFunctionDeclaration(stmt) && this.hasDefaultExport(stmt)) {
        // `export default function () { return {...} }`
        const lit = this.literalFromFunctionLike(stmt)
        if (lit != null) {
          candidates.push(lit)
        }
      }
    }

    // Inline `build({ config: {...} })` form (programmatic-usage.md). Search the whole tree.
    this.forEachDescendant(this.sf, node => {
      const cfg = this.configArgOfBuildCall(node)
      if (cfg != null) {
        candidates.push(cfg)
      }
    })

    let reason = "no electron-builder config object literal found (expected a default/module.exports object export or a build({ config }) call)"
    for (const candidate of candidates) {
      const resolved = this.resolveToObjectLiteral(candidate, 0)
      if (resolved.objLit != null) {
        return { objLit: resolved.objLit }
      }
      if (resolved.reason != null) {
        reason = resolved.reason
      }
    }
    return { reason }
  }

  private isModuleExportsTarget(lhs: any): boolean {
    const ts = this.ts
    if (!ts.isPropertyAccessExpression(lhs)) {
      return false
    }
    // module.exports = ...  OR  exports.default = ...
    if (ts.isIdentifier(lhs.expression) && lhs.expression.text === "module" && lhs.name.text === "exports") {
      return true
    }
    if (ts.isIdentifier(lhs.expression) && lhs.expression.text === "exports" && lhs.name.text === "default") {
      return true
    }
    return false
  }

  private hasDefaultExport(node: any): boolean {
    const ts = this.ts
    const mods = node.modifiers
    if (mods == null) {
      return false
    }
    let hasExport = false
    let hasDefault = false
    for (const m of mods) {
      if (m.kind === ts.SyntaxKind.ExportKeyword) {
        hasExport = true
      }
      if (m.kind === ts.SyntaxKind.DefaultKeyword) {
        hasDefault = true
      }
    }
    return hasExport && hasDefault
  }

  private configArgOfBuildCall(node: any): any | null {
    const ts = this.ts
    if (!ts.isCallExpression(node)) {
      return null
    }
    const callee = node.expression
    const isBuild = (ts.isIdentifier(callee) && callee.text === "build") || (ts.isPropertyAccessExpression(callee) && callee.name.text === "build")
    if (!isBuild || node.arguments.length === 0) {
      return null
    }
    const arg0 = node.arguments[0]
    if (!ts.isObjectLiteralExpression(arg0)) {
      return null
    }
    const configProp = this.getProp(arg0, "config")
    return configProp != null && ts.isPropertyAssignment(configProp) ? configProp.initializer : null
  }

  private resolveToObjectLiteral(expr: any, depth: number): { objLit?: any; reason?: string } {
    const ts = this.ts
    if (depth > 6) {
      return { reason: "config export could not be resolved (too many indirections)" }
    }
    const node = this.unwrap(expr)
    if (ts.isObjectLiteralExpression(node)) {
      if (this.hasSpreadOrComputed(node)) {
        return { reason: "config object uses a spread (`...`) or computed key, which cannot be migrated automatically" }
      }
      return { objLit: node }
    }
    if (ts.isIdentifier(node)) {
      const init = this.findVariableInitializer(node.text)
      if (init == null) {
        return { reason: `config export references "${node.text}", which is not a local object literal` }
      }
      return this.resolveToObjectLiteral(init, depth + 1)
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const lit = this.literalFromFunctionLike(node)
      if (lit == null) {
        return { reason: "config is a function that does not return a single object literal — migrate it manually" }
      }
      return this.resolveToObjectLiteral(lit, depth + 1)
    }
    return { reason: "config export is not an object literal — migrate it manually" }
  }

  /** Unwraps parentheses and type-only wrappers (`as`, `satisfies`, `!`, `<T>x`) to the inner expression. */
  private unwrap(node: any): any {
    const ts = this.ts
    let n = node
    for (;;) {
      if (
        ts.isParenthesizedExpression(n) ||
        ts.isAsExpression(n) ||
        (ts.isSatisfiesExpression && ts.isSatisfiesExpression(n)) ||
        ts.isNonNullExpression(n) ||
        ts.isTypeAssertionExpression?.(n)
      ) {
        n = n.expression
      } else {
        return n
      }
    }
  }

  private hasSpreadOrComputed(objLit: any): boolean {
    const ts = this.ts
    for (const p of objLit.properties) {
      if (ts.isSpreadAssignment(p)) {
        return true
      }
      if (p.name != null && ts.isComputedPropertyName(p.name)) {
        return true
      }
    }
    return false
  }

  private findVariableInitializer(name: string): any | null {
    const ts = this.ts
    for (const stmt of this.sf.statements) {
      if (!ts.isVariableStatement(stmt)) {
        continue
      }
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer != null) {
          return decl.initializer
        }
      }
    }
    return null
  }

  /** Returns the single object-literal expression a function-like trivially yields, or null. */
  private literalFromFunctionLike(fn: any): any | null {
    const ts = this.ts
    const body = fn.body
    if (body == null) {
      return null
    }
    if (!ts.isBlock(body)) {
      // arrow expression body: `() => ({...})` / `() => obj`
      return body
    }
    const returns: any[] = []
    this.collectReturns(body, returns)
    if (returns.length !== 1 || returns[0].expression == null) {
      return null
    }
    return returns[0].expression
  }

  private collectReturns(node: any, out: any[]): void {
    const ts = this.ts
    const visit = (n: any): void => {
      // Don't descend into nested functions — their returns are not the config's.
      if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) {
        return
      }
      if (ts.isReturnStatement(n)) {
        out.push(n)
      }
      n.forEachChild(visit)
    }
    node.forEachChild(visit)
  }

  private forEachDescendant(node: any, cb: (n: any) => void): void {
    const visit = (n: any): void => {
      cb(n)
      n.forEachChild(visit)
    }
    node.forEachChild(visit)
  }

  // ── Run all rules ─────────────────────────────────────────────────────────

  run(root: any): void {
    this.indentUnit = this.detectIndentUnit(root)
    this.ruleRemoveKeys(root, ["electronCompile"], "removed electronCompile (unsupported since v27; migrate to electron-vite, esbuild, or webpack)")
    this.ruleRemoveKeys(root, ["framework", "nodeVersion", "launchUiVersion"], key => `removed ${key} (Electron is the only supported framework in v27)`)
    const disableDefaultIgnoredFilesDesc = "removed disableDefaultIgnoredFiles (in v27, include a default-excluded file via an explicit `files` glob, e.g. `**/*.obj`)"
    this.ruleRemoveKeys(root, ["disableDefaultIgnoredFiles"], disableDefaultIgnoredFilesDesc)
    // mas/masDev are MacConfiguration-derived, so they accept the (now-removed) key too.
    for (const platform of ["mac", "mas", "masDev", "win", "linux"]) {
      const p = this.getObjectProp(root, platform)
      if (p != null) {
        this.ruleRemoveKeys(p, ["disableDefaultIgnoredFiles"], disableDefaultIgnoredFilesDesc)
      }
    }
    this.ruleSyncDesktopName(root)
    this.ruleNativeModules(root)
    // Platform asar reads the root keys before ruleAsar edits them (edits only apply at the end, so order is for clarity).
    for (const platform of ASAR_PLATFORM_KEYS) {
      const p = this.getObjectProp(root, platform)
      if (p != null) {
        this.rulePlatformAsar(root, p, platform)
      }
    }
    this.ruleAsar(root)
    this.ruleAppImageSystemIntegration(root)
    this.rulePublish(root, "publish")
    // publish nested in any platform/target section (mac, win, nsis, dmg, …). `snap` is skipped: ruleSnap
    // re-emits its properties verbatim, which would overlap an edit made inside it.
    for (const prop of root.properties) {
      const name = this.propName(prop)
      const obj = name != null && name !== "snap" ? this.getObjectProp(root, name) : null
      if (obj != null) {
        this.rulePublish(obj, "publish", name + ".")
      }
    }
    this.ruleSnap(root)
    this.ruleHelperBundleId(root)
    this.ruleSquirrelNoMsi(root)
    this.ruleWinSign(root)
    for (const platform of ["mac", "mas", "masDev"]) {
      const p = this.getObjectProp(root, platform)
      if (p != null) {
        this.ruleMacSigning(p, platform)
        this.ruleMacUniversal(p, platform)
      }
    }
    this.ruleElectronDownload(root)
    this.ruleToolsets(root)
    this.ruleNsisWebAdvisory(root)
    this.ruleMacEntitlementsAdvisory(root)
  }

  // ── Rules ───────────────────────────────────────────────────────────────

  // Advisory only — adds no edit, so an nsis-web-only config stays a "no-op" and is never rewritten.
  private ruleNsisWebAdvisory(root: any): void {
    const ts = this.ts
    const win = this.getObjectProp(root, "win")
    const winTarget = win != null ? this.getProp(win, "target") : null
    const globalTarget = this.getProp(root, "target")
    for (const prop of [winTarget, globalTarget]) {
      if (prop != null && ts.isPropertyAssignment(prop) && this.hasNsisWebInTarget(this.unwrap(prop.initializer))) {
        this.advisories.push(NSIS_WEB_ADVISORY)
        return
      }
    }
  }

  // Advisory only. Mirrors migrateConfig: a mac/mas/masDev object that names no entitlements file (at the v26
  // location or under `sign`) relies on the bundled default, which v27 tightened.
  private ruleMacEntitlementsAdvisory(root: any): void {
    const ts = this.ts
    const isNullLiteral = (prop: any) => prop != null && ts.isPropertyAssignment(prop) && this.unwrap(prop.initializer).kind === ts.SyntaxKind.NullKeyword
    const namesEntitlements = (obj: any): boolean => {
      const prop = obj == null ? null : this.getProp(obj, "entitlements")
      return prop != null && !isNullLiteral(prop)
    }
    // Not signing with electron-builder's defaults at all: a custom signer, or identity: null (skip signing).
    const bypassesDefaults = (p: any, sign: any): boolean => {
      const signProp = this.getProp(p, "sign")
      const custom = signProp != null && ts.isPropertyAssignment(signProp) && sign == null && !isNullLiteral(signProp)
      return custom || isNullLiteral(this.getProp(p, "identity")) || (sign != null && isNullLiteral(this.getProp(sign, "identity")))
    }
    for (const platform of ["mac", "mas", "masDev"]) {
      const p = this.getObjectProp(root, platform)
      const sign = p == null ? null : this.getObjectProp(p, "sign")
      if (p != null && !namesEntitlements(p) && !namesEntitlements(sign) && !bypassesDefaults(p, sign)) {
        this.advisories.push(MAC_ENTITLEMENTS_ADVISORY)
        return
      }
    }
  }

  private ruleToolsets(root: any): void {
    const ts = this.ts
    const toolsets = this.getObjectProp(root, "toolsets")
    if (toolsets == null) {
      return
    }
    for (const prop of toolsets.properties) {
      const name = this.propName(prop)
      if (name == null || !ts.isPropertyAssignment(prop)) {
        continue
      }
      const value = this.unwrap(prop.initializer)
      if (value.kind === ts.SyntaxKind.NullKeyword) {
        this.removeProp(prop)
        this.changes.push({
          key: `toolsets.${name}`,
          description: `removed toolsets.${name}: null (v27 rejects null; unset resolves to "latest", the newest bundle — pin "0.0.0" to keep the legacy bundle v26 used)`,
        })
      } else if (name === "appimage" && ts.isStringLiteral(value) && value.text === "1.0.2") {
        this.replaceValue(prop.initializer, '"1.0.3"')
        this.changes.push({
          key: "toolsets.appimage",
          description: 'replaced toolsets.appimage: "1.0.2" with "1.0.3" (1.0.2 is no longer offered; 1.0.3 is the same runtime with the #9598 fix)',
        })
      }
    }
  }

  private hasNsisWebInTarget(value: any): boolean {
    const ts = this.ts
    if (value == null) {
      return false
    }
    if (ts.isStringLiteral(value)) {
      return value.text === "nsis-web"
    }
    if (ts.isArrayLiteralExpression(value)) {
      return value.elements.some((el: any) => this.hasNsisWebInTarget(this.unwrap(el)))
    }
    if (ts.isObjectLiteralExpression(value)) {
      const targetProp = this.getProp(value, "target")
      if (targetProp != null && ts.isPropertyAssignment(targetProp)) {
        const inner = this.unwrap(targetProp.initializer)
        return ts.isStringLiteral(inner) && inner.text === "nsis-web"
      }
    }
    return false
  }

  private ruleRemoveKeys(obj: any, keys: string[], description: string | ((key: string) => string)): void {
    for (const key of keys) {
      const prop = this.getProp(obj, key)
      if (prop != null) {
        this.removeProp(prop)
        this.changes.push({ key, description: typeof description === "function" ? description(key) : description })
      }
    }
  }

  // linux.syncDesktopName was removed in v27 (desktop-name syncing is now always on). Remove the key;
  // warn when it was explicitly false, since that changed behaviour (the installed .desktop filename now syncs).
  private ruleSyncDesktopName(root: any): void {
    const ts = this.ts
    const linux = this.getObjectProp(root, "linux")
    if (linux == null) {
      return
    }
    const prop = this.getProp(linux, "syncDesktopName")
    if (prop == null || !ts.isPropertyAssignment(prop)) {
      return
    }
    if (prop.initializer.kind === ts.SyntaxKind.FalseKeyword) {
      this.warnings.push(
        "linux.syncDesktopName: false disabled desktop-name syncing in v26. In v27 the installed .desktop filename is always derived from `desktopName` " +
          "(falling back to executableName). If you relied on the old filename, set `desktopName` explicitly to control it."
      )
    }
    this.removeProp(prop)
    this.changes.push({
      key: "linux.syncDesktopName",
      description: "removed linux.syncDesktopName (the installed .desktop filename is always synced from desktopName in v27)",
    })
  }

  private ruleNativeModules(root: any): void {
    const sources: { prop: any; renameTo?: string }[] = []
    const extraEntries: string[] = []

    for (const key of ["buildDependenciesFromSource", "nodeGypRebuild", "npmRebuild"]) {
      const prop = this.getProp(root, key)
      if (prop != null) {
        sources.push({ prop })
        this.changes.push({ key, description: `moved ${key} → nativeModules.${key}` })
      }
    }

    const nativeRebuilder = this.getProp(root, "nativeRebuilder")
    if (nativeRebuilder != null) {
      if (this.stringLiteralValue(nativeRebuilder) === "legacy") {
        // v27 dropped the app-builder binary rebuilder; rebuildMode only selects @electron/rebuild's mode.
        this.removeProp(nativeRebuilder)
        this.warnings.push(
          'nativeRebuilder: "legacy" (the app-builder binary rebuilder) was removed in v27 — native modules are always rebuilt with @electron/rebuild. ' +
            'The value was dropped, so the default nativeModules.rebuildMode ("sequential") applies.'
        )
      } else {
        sources.push({ prop: nativeRebuilder, renameTo: "rebuildMode" })
      }
      this.changes.push({ key: "nativeRebuilder", description: "renamed nativeRebuilder → nativeModules.rebuildMode" })
    }

    const npmSkip = this.getProp(root, "npmSkipBuildFromSource")
    if (npmSkip != null && this.ts.isPropertyAssignment(npmSkip)) {
      const hasBds = this.getProp(root, "buildDependenciesFromSource") != null
      if (!hasBds) {
        extraEntries.push(`buildDependenciesFromSource: ${this.negate(npmSkip.initializer)}`)
      }
      this.removeProp(npmSkip)
      this.changes.push({ key: "npmSkipBuildFromSource", description: "renamed npmSkipBuildFromSource → buildDependenciesFromSource (then grouped under nativeModules)" })
    }

    if (sources.length === 0 && extraEntries.length === 0) {
      return
    }
    const ok = this.moveInto(root, "nativeModules", sources, extraEntries)
    if (!ok) {
      this.warnings.push("nativeModules already exists but is not an object literal; move buildDependenciesFromSource/nodeGypRebuild/npmRebuild/rebuildMode into it manually.")
    }
  }

  private ruleAsar(root: any): void {
    const ts = this.ts
    const asarProp = this.getProp(root, "asar")
    const asarVal = asarProp != null && ts.isPropertyAssignment(asarProp) ? this.unwrap(asarProp.initializer) : null
    const asarIsFalse = asarVal != null && asarVal.kind === ts.SyntaxKind.FalseKeyword
    const asarIsTrue = asarVal != null && asarVal.kind === ts.SyntaxKind.TrueKeyword
    const asarIsObject = asarVal != null && ts.isObjectLiteralExpression(asarVal)

    if (asarIsFalse) {
      const flatKeys = ["asar-unpack", "asar-unpack-dir", "asarUnpack", "disableSanityCheckAsar", "disableAsarIntegrity"].filter(k => this.getProp(root, k) != null)
      if (flatKeys.length === 0) {
        return
      }
      if (this.platformReEnablesAsar(root)) {
        // Those root values still applied to the re-enabling platform in v26; rulePlatformAsar already warned.
        return
      }
      for (const key of flatKeys) {
        this.removeProp(this.getProp(root, key))
        this.changes.push({ key, description: `removed ${key} (no effect with asar: false)` })
      }
      return
    }

    // Collect unpack sources (root-level hyphenated/camel + nested asar.unpackDir).
    const unpackSources: any[] = []
    const collectUnpack = (key: string, descKey: string, desc: string): void => {
      const prop = this.getProp(root, key)
      if (prop != null && ts.isPropertyAssignment(prop)) {
        unpackSources.push(prop.initializer)
        this.removeProp(prop)
        this.changes.push({ key: descKey, description: desc })
      }
    }
    collectUnpack("asar-unpack", "asar-unpack", "renamed asar-unpack → asar.unpack")
    collectUnpack("asar-unpack-dir", "asar-unpack-dir", "renamed asar-unpack-dir → asar.unpack")
    collectUnpack("asarUnpack", "asarUnpack", "moved asarUnpack → asar.unpack")

    if (asarIsObject) {
      const nestedUnpackDir = this.getProp(asarVal, "unpackDir")
      if (nestedUnpackDir != null && ts.isPropertyAssignment(nestedUnpackDir)) {
        unpackSources.push(nestedUnpackDir.initializer)
        this.removeProp(nestedUnpackDir)
        this.changes.push({ key: "asar.unpackDir", description: "moved asar.unpackDir → asar.unpack" })
      }
    }

    const childRenames: { renameTo: string; value: any }[] = []
    const collectChild = (key: string, renameTo: string, desc: string): void => {
      const prop = this.getProp(root, key)
      if (prop != null && ts.isPropertyAssignment(prop)) {
        childRenames.push({ renameTo, value: prop.initializer })
        this.removeProp(prop)
        this.changes.push({ key, description: desc })
      }
    }
    collectChild("disableSanityCheckAsar", "disableSanityCheck", "moved disableSanityCheckAsar → asar.disableSanityCheck")
    collectChild("disableAsarIntegrity", "disableIntegrity", "moved disableAsarIntegrity → asar.disableIntegrity")

    if (unpackSources.length === 0 && childRenames.length === 0 && !asarIsTrue) {
      return
    }

    const buildEntries = (childIndent: string): string[] => {
      const out: string[] = []
      if (unpackSources.length === 1) {
        out.push(`unpack: ${this.valueText(unpackSources[0], childIndent)}`)
      } else if (unpackSources.length > 1) {
        out.push(`unpack: ${this.mergeArrays(unpackSources)}`)
      }
      for (const c of childRenames) {
        out.push(`${c.renameTo}: ${this.valueText(c.value, childIndent)}`)
      }
      return out
    }

    if (asarIsObject) {
      this.insertIntoObject(asarVal, buildEntries(this.propIndentFor(asarVal)))
      return
    }

    if (asarIsTrue) {
      const braceIndent = this.lineIndentAt(this.start(asarProp.initializer))
      const entries = buildEntries(braceIndent + this.indentUnit)
      if (entries.length === 0) {
        this.removeProp(asarProp)
      } else {
        this.replaceValue(asarProp.initializer, this.objectLiteralTextAt(entries, braceIndent))
      }
      this.changes.push({ key: "asar", description: "removed redundant asar: true (asar is enabled by default; the explicit `true` is not needed)" })
      return
    }

    // No asar prop yet — create one on root.
    this.createChild(root, "asar", buildEntries(this.propIndentFor(root) + this.indentUnit))
  }

  /** True when some platform section sets its own `asar` to anything but `false` / `null`. */
  private platformReEnablesAsar(root: any): boolean {
    const ts = this.ts
    return ASAR_PLATFORM_KEYS.some(platform => {
      const p = this.getObjectProp(root, platform)
      const prop = p == null ? null : this.getProp(p, "asar")
      if (prop == null || !ts.isPropertyAssignment(prop)) {
        return false
      }
      const kind = this.unwrap(prop.initializer).kind
      return kind !== ts.SyntaxKind.FalseKeyword && kind !== ts.SyntaxKind.NullKeyword
    })
  }

  /**
   * Platform-level `asarUnpack` → `<platform>.asar.unpack`. Only the cases where a plain move is exactly the v26
   * result are rewritten: a platform-level `asar` replaces the root one in v27, so whenever root-level asar
   * options exist they would have to be copied into the platform object — that is left to the user, with a warning.
   */
  private rulePlatformAsar(root: any, platform: any, name: string): void {
    const ts = this.ts
    const unpackProp = this.getProp(platform, "asarUnpack")
    const asarProp = this.getProp(platform, "asar")
    const asarVal = asarProp != null && ts.isPropertyAssignment(asarProp) ? this.unwrap(asarProp.initializer) : null
    const rootAsarProp = this.getProp(root, "asar")
    const rootAsarVal = rootAsarProp != null && ts.isPropertyAssignment(rootAsarProp) ? this.unwrap(rootAsarProp.initializer) : null
    const rootHasFlat =
      ["asar-unpack", "asar-unpack-dir", "asarUnpack", "disableSanityCheckAsar", "disableAsarIntegrity"].some(k => this.getProp(root, k) != null) ||
      (rootAsarVal != null && ts.isObjectLiteralExpression(rootAsarVal) && this.getProp(rootAsarVal, "unpackDir") != null)
    const ownIsNull = asarVal == null || asarVal.kind === ts.SyntaxKind.NullKeyword

    const manual = (why: string) =>
      this.warnings.push(
        `${name}.asar: ${why} In v27 a platform-level asar replaces the root one, so copy the root asar options into ${name}.asar` +
          (unpackProp != null ? ` and move ${name}.asarUnpack there manually.` : " manually.")
      )
    // Shorthand / non-literal values cannot be reasoned about statically.
    if ((asarProp != null && !ts.isPropertyAssignment(asarProp)) || (rootAsarProp != null && !ts.isPropertyAssignment(rootAsarProp))) {
      if (unpackProp != null) {
        manual("the platform or root asar value is not a literal.")
      }
      return
    }

    if (ownIsNull) {
      if (unpackProp == null) {
        return
      }
      if (rootAsarVal != null && rootAsarVal.kind === ts.SyntaxKind.FalseKeyword) {
        this.removeProp(unpackProp)
        this.changes.push({ key: `${name}.asarUnpack`, description: `removed ${name}.asarUnpack (no effect with asar: false)` })
        return
      }
      const rootAsarIsTrivial =
        rootAsarVal == null ||
        rootAsarVal.kind === ts.SyntaxKind.TrueKeyword ||
        rootAsarVal.kind === ts.SyntaxKind.NullKeyword ||
        (ts.isObjectLiteralExpression(rootAsarVal) && rootAsarVal.properties.length === 0)
      if (rootHasFlat || !rootAsarIsTrivial) {
        manual(`${name}.asarUnpack is set alongside root-level asar options.`)
        return
      }
      if (asarProp != null) {
        this.removeProp(asarProp)
      }
      this.moveInto(platform, "asar", [{ prop: unpackProp, renameTo: "unpack" }], [], /* treatNullAsAbsent */ true)
      this.changes.push({ key: `${name}.asarUnpack`, description: `moved ${name}.asarUnpack → ${name}.asar.unpack` })
      return
    }

    if (asarVal.kind === ts.SyntaxKind.FalseKeyword) {
      if (unpackProp != null) {
        this.removeProp(unpackProp)
        this.changes.push({ key: `${name}.asarUnpack`, description: `removed ${name}.asarUnpack (no effect with ${name}.asar: false)` })
      }
      return
    }

    // `asar: true` or an object literal
    if (rootHasFlat) {
      manual("root-level asarUnpack / disableSanityCheckAsar / disableAsarIntegrity applied to this platform in v26.")
      return
    }
    if (unpackProp == null) {
      return
    }
    if (asarVal.kind === ts.SyntaxKind.TrueKeyword) {
      const braceIndent = this.lineIndentAt(this.start(asarProp.initializer))
      this.replaceValue(asarProp.initializer, this.objectLiteralTextAt([this.entryText(unpackProp, braceIndent + this.indentUnit, "unpack")], braceIndent))
      this.removeProp(unpackProp)
    } else if (ts.isObjectLiteralExpression(asarVal) && this.getProp(asarVal, "unpack") == null) {
      this.moveInto(platform, "asar", [{ prop: unpackProp, renameTo: "unpack" }], [])
    } else {
      manual(`${name}.asar is not a plain object literal, or already sets unpack.`)
      return
    }
    this.changes.push({ key: `${name}.asarUnpack`, description: `moved ${name}.asarUnpack → ${name}.asar.unpack` })
  }

  private ruleAppImageSystemIntegration(root: any): void {
    const appImage = this.getObjectProp(root, "appImage")
    if (appImage == null) {
      return
    }
    const si = this.getProp(appImage, "systemIntegration")
    if (si == null) {
      return
    }
    const appImageProp = this.getProp(root, "appImage")
    if (appImage.properties.length === 1) {
      this.removeProp(appImageProp)
    } else {
      this.removeProp(si)
    }
    this.changes.push({ key: "appImage.systemIntegration", description: "removed appImage.systemIntegration (handled automatically by AppImageLauncher in v27)" })
  }

  private rulePublish(parent: any, key: string, prefix = ""): void {
    const ts = this.ts
    const prop = this.getProp(parent, key)
    if (prop == null || !ts.isPropertyAssignment(prop)) {
      return
    }
    const value = this.unwrap(prop.initializer)
    const entries: any[] = ts.isArrayLiteralExpression(value) ? value.elements : [value]
    let changed = false
    for (const entry of entries) {
      const obj = this.unwrap(entry)
      if (!ts.isObjectLiteralExpression(obj)) {
        continue
      }
      const provider = this.stringLiteralValue(this.getProp(obj, "provider"))
      // GitLab keeps vPrefixedTagName in v27 (no tagNamePrefix equivalent) — leave it untouched.
      if (provider !== "github") {
        continue
      }
      const vPrefixed = this.getProp(obj, "vPrefixedTagName")
      const tagNamePrefix = this.getProp(obj, "tagNamePrefix")
      const prefixText = this.stringLiteralValue(tagNamePrefix)
      if (vPrefixed != null && ts.isPropertyAssignment(vPrefixed)) {
        // v26 githubTagPrefix(): a non-empty tagNamePrefix won; otherwise vPrefixedTagName (default true) chose "v" or "".
        const isFalse = vPrefixed.initializer.kind === ts.SyntaxKind.FalseKeyword
        if (tagNamePrefix == null) {
          this.replaceRange(this.start(vPrefixed), vPrefixed.end, `tagNamePrefix: ${isFalse ? '""' : '"v"'}`)
        } else {
          if (prefixText === "") {
            this.replaceValue(tagNamePrefix.initializer, isFalse ? '""' : '"v"')
          }
          this.removeProp(vPrefixed)
        }
        changed = true
      } else if (prefixText === "") {
        // v26 ignored an empty tagNamePrefix and still tagged "v1.2.3"; v27 honors it and would tag "1.2.3".
        this.replaceValue(tagNamePrefix.initializer, '"v"')
        changed = true
        this.warnings.push(
          'A GitHub publish entry set tagNamePrefix: "". v26 ignored an empty prefix and tagged releases "v<version>"; v27 honors it. ' +
            'It was rewritten to tagNamePrefix: "v" to keep your existing tag names — set it back to "" if you want unprefixed tags from now on.'
        )
      }
    }
    if (changed) {
      this.changes.push({
        key: `${prefix}${key}[].vPrefixedTagName`,
        description: "replaced vPrefixedTagName with tagNamePrefix on GitHub publish entries",
      })
    }
  }

  private ruleSnap(root: any): void {
    const ts = this.ts
    const snapProp = this.getProp(root, "snap")
    if (snapProp == null || !ts.isPropertyAssignment(snapProp)) {
      return
    }
    const snap = this.unwrap(snapProp.initializer)
    if (!ts.isObjectLiteralExpression(snap)) {
      this.removeProp(snapProp)
      this.changes.push({ key: "snap", description: "removed empty snap config (use snapcraft in v27)" })
      return
    }

    // snap's properties are re-emitted verbatim below, so rulePublish skipped it — flag what it would have rewritten.
    const snapPublish = this.getProp(snap, "publish")
    if (snapPublish != null && /\bvPrefixedTagName\b|\btagNamePrefix\s*:\s*(""|'')/.test(this.text.slice(this.start(snapPublish), snapPublish.end))) {
      this.warnings.push(
        "snap.publish sets vPrefixedTagName or an empty tagNamePrefix; after the move, apply the GitHub tagNamePrefix change under snapcraft.<base>.publish manually."
      )
    }

    const baseProp = this.getProp(snap, "base")
    let base = this.stringLiteralValue(baseProp)
    const restProps = snap.properties.filter((p: any) => p !== baseProp)

    if (base === "custom") {
      const childIndent = this.propIndentFor(root) + this.indentUnit
      const entries = ['base: "custom"', ...restProps.map((p: any) => this.entryText(p, childIndent))]
      this.removeProp(snapProp)
      this.createChild(root, "snapcraft", entries)
      this.changes.push({ key: "snap", description: "moved snap (base: custom) → snapcraft verbatim" })
      return
    }

    let assumed = false
    if (base == null || !SNAP_BASES.has(base)) {
      if (base != null) {
        this.warnings.push(`snap config had an unrecognized base "${base}"; assumed "core20". Verify the snapcraft.base value (core18/core20/core22/core24/custom).`)
      } else {
        this.warnings.push('snap config had no "base"; assumed "core20" for snapcraft. Verify and adjust the base if needed (core18/core20/core22/core24).')
      }
      base = "core20"
      assumed = true
    }

    let nestedProps = restProps
    if (base === "core24") {
      const unsupported = (SNAP_CORE24_UNSUPPORTED as readonly string[]).filter(k => this.getProp(snap, k) != null)
      nestedProps = restProps.filter((p: any) => !unsupported.includes(this.propName(p)!))
      if (unsupported.length > 0) {
        this.warnings.push(
          `snap config set [${unsupported.join(", ")}], which the v27 snapcraft.core24 options do not support (core24 builds with the snapcraft CLI directly); they were dropped.`
        )
      }
    }

    const baseChildIndent = this.propIndentFor(root) + this.indentUnit + this.indentUnit
    const nestedEntries = nestedProps.map((p: any) => this.entryText(p, baseChildIndent))
    const snapcraftChildIndent = this.propIndentFor(root) + this.indentUnit
    const nestedObject = nestedEntries.length > 0 ? this.objectLiteralTextAt(nestedEntries, snapcraftChildIndent) : "{}"
    const entries = [`base: "${base}"`, `${base}: ${nestedObject}`]
    this.removeProp(snapProp)
    this.createChild(root, "snapcraft", entries)
    this.changes.push({ key: "snap", description: `moved snap → snapcraft.${base}${assumed ? " (base defaulted to core20)" : ""}` })
  }

  private ruleHelperBundleId(root: any): void {
    const prop = this.getProp(root, "helper-bundle-id")
    if (prop == null || !this.ts.isPropertyAssignment(prop)) {
      return
    }
    const mac = this.getObjectProp(root, "mac")
    if (mac != null && this.getProp(mac, "helperBundleId") != null) {
      this.removeProp(prop)
      this.changes.push({ key: "helper-bundle-id", description: "moved helper-bundle-id → mac.helperBundleId" })
      return
    }
    const ok = this.moveInto(root, "mac", [{ prop, renameTo: "helperBundleId" }], [])
    if (ok) {
      this.changes.push({ key: "helper-bundle-id", description: "moved helper-bundle-id → mac.helperBundleId" })
    } else {
      this.warnings.push("mac already exists but is not an object literal; move helper-bundle-id → mac.helperBundleId manually.")
    }
  }

  private ruleSquirrelNoMsi(root: any): void {
    const ts = this.ts
    const sq = this.getObjectProp(root, "squirrelWindows")
    if (sq == null) {
      return
    }
    // Not auto-migrated (different bundle layout) — left in place so the build fails with a targeted message.
    if (this.getProp(sq, "customSquirrelVendorDir") != null) {
      this.warnings.push(
        "squirrelWindows.customSquirrelVendorDir was removed in v27 and cannot be migrated automatically. " +
          'Supply the custom bundle via toolsets.squirrel: { url: "file:///abs/path" } — the bundle must contain an electron-winstaller/vendor/ subtree ' +
          "(customSquirrelVendorDir pointed at the vendor files directly) — or remove the key to use the default Squirrel bundle."
      )
    }
    const noMsi = this.getProp(sq, "noMsi")
    if (noMsi == null || !ts.isPropertyAssignment(noMsi)) {
      return
    }
    if (this.getProp(sq, "msi") != null) {
      this.removeProp(noMsi)
    } else {
      this.replaceRange(this.start(noMsi), noMsi.end, `msi: ${this.negate(noMsi.initializer)}`)
    }
    this.changes.push({ key: "squirrelWindows.noMsi", description: "replaced squirrelWindows.noMsi → squirrelWindows.msi (inverted boolean)" })
  }

  private ruleWinSign(root: any): void {
    const ts = this.ts
    const win = this.getObjectProp(root, "win")
    if (win == null) {
      return
    }

    const signNode = this.getProp(win, "sign")
    const existingSignIsNull = signNode != null && ts.isPropertyAssignment(signNode) && this.unwrap(signNode.initializer).kind === ts.SyntaxKind.NullKeyword
    // `sign: null` is "not configured" in both versions — it neither blocks nor survives a migration below.
    let signSet = signNode != null && !existingSignIsNull

    // Either flag set to false skipped ALL signing in v26, so both map to win.sign: false (signAndEditExecutable
    // also skipped resource editing, which always runs in v27 — that part has no equivalent).
    const isFalseProp = (prop: any) => prop != null && ts.isPropertyAssignment(prop) && prop.initializer.kind === ts.SyntaxKind.FalseKeyword
    const signAndEdit = this.getProp(win, "signAndEditExecutable")
    const signExe = this.getProp(win, "signExecutable")
    const signingDisabled = isFalseProp(signAndEdit) || isFalseProp(signExe)
    if (signAndEdit != null && ts.isPropertyAssignment(signAndEdit)) {
      this.removeProp(signAndEdit)
      if (isFalseProp(signAndEdit)) {
        this.warnings.push(
          "win.signAndEditExecutable: false was used to skip both resource editing and signing. In v27, resource editing always runs; signing is still skipped via win.sign: false. There is no v27 equivalent that also skips resource editing — apply resources manually if needed."
        )
      }
      this.changes.push({ key: "win.signAndEditExecutable", description: "removed win.signAndEditExecutable (resource editing always runs in v27)" })
    }
    if (signExe != null && ts.isPropertyAssignment(signExe)) {
      this.removeProp(signExe)
      this.changes.push({ key: "win.signExecutable", description: "removed win.signExecutable (signing is enabled by default when credentials are available)" })
    }
    let signIsFalse = isFalseProp(signNode)
    if (signingDisabled && !signSet) {
      if (existingSignIsNull) {
        this.removeProp(signNode)
      }
      this.createChild(win, "sign", [], "false")
      signSet = true
      signIsFalse = true
      this.changes.push({ key: "win.sign", description: "set win.sign: false (v26 signExecutable/signAndEditExecutable: false disabled signing; resource editing still runs)" })
    }

    if (signIsFalse) {
      // Signing is switched off, so the legacy options never applied. Only key names are reported — values can hold passwords.
      const dropped = ["signtoolOptions", "azureSignOptions"].filter(k => this.getProp(win, k) != null)
      if (dropped.length > 0) {
        for (const k of dropped) {
          this.removeProp(this.getProp(win, k))
          this.changes.push({ key: `win.${k}`, description: `removed win.${k} (signing is disabled with win.sign: false)` })
        }
        this.warnings.push(
          `win.sign is false (signing disabled), so [${dropped.map(k => `win.${k}`).join(", ")}] had no effect and ${dropped.length === 1 ? "was" : "were"} removed. ` +
            'To sign in v27, replace win.sign: false with win.sign: { type: "signtool" | "azure", … } carrying those options.'
        )
        return
      }
    }

    const azure = this.getObjectProp(win, "azureSignOptions")
    const signtool = this.getObjectProp(win, "signtoolOptions")
    const hasAzure = azure != null
    const hasSigntool = signtool != null
    if (!hasAzure && !hasSigntool) {
      return
    }

    if (signSet) {
      this.warnings.push(
        `win.sign is already set alongside ${hasAzure ? "win.azureSignOptions" : "win.signtoolOptions"}. Remove the legacy key manually after verifying win.sign is correct.`
      )
      return
    }

    if (existingSignIsNull) {
      this.removeProp(signNode)
    }

    if (hasAzure && hasSigntool) {
      this.warnings.push(
        "Both win.azureSignOptions and win.signtoolOptions are set. win.signtoolOptions will be dropped and win.azureSignOptions will be migrated to win.sign: { type: 'azure', … } (Azure took priority in v26). Verify the migrated win.sign block is correct for your project."
      )
      this.removeProp(this.getProp(win, "signtoolOptions"))
    }

    if (hasAzure) {
      this.buildWinAzureSign(win, azure)
      this.removeProp(this.getProp(win, "azureSignOptions"))
      this.changes.push({ key: "win.azureSignOptions", description: 'moved win.azureSignOptions → win.sign: { type: "azure", … }' })
    } else {
      this.buildWinSigntoolSign(win, signtool)
      this.removeProp(this.getProp(win, "signtoolOptions"))
      this.changes.push({ key: "win.signtoolOptions", description: 'moved win.signtoolOptions → win.sign: { type: "signtool", … }' })
    }
  }

  private buildWinSigntoolSign(win: any, signtool: any): void {
    const ts = this.ts
    const childIndent = this.propIndentFor(win) + this.indentUnit
    const entries: string[] = []
    for (const p of signtool.properties) {
      if (ts.isPropertyAssignment(p) && this.propName(p) === "type") {
        continue
      }
      entries.push(this.entryText(p, childIndent))
    }
    entries.push('type: "signtool"')
    this.createChild(win, "sign", entries)
  }

  private buildWinAzureSign(win: any, azure: any): void {
    const ts = this.ts
    const childIndent = this.propIndentFor(win) + this.indentUnit
    const metaIndent = childIndent + this.indentUnit

    const knownEntries: string[] = []
    const metaEntries: string[] = []
    const extraKeys: string[] = []
    let existingMeta: any = null

    for (const p of azure.properties) {
      if (!ts.isPropertyAssignment(p)) {
        continue
      }
      const name = this.propName(p)
      if (name === "type") {
        continue
      }
      if (name === "additionalMetadata") {
        existingMeta = this.unwrap(p.initializer)
        continue
      }
      const isString = ts.isStringLiteral(p.initializer)
      if (AZURE_KNOWN_FIELDS.has(name!)) {
        knownEntries.push(this.entryText(p, childIndent))
      } else if (isString) {
        metaEntries.push(this.entryText(p, metaIndent))
        extraKeys.push(name!)
      } else {
        // Unknown non-string field — keep verbatim so nothing is silently dropped.
        knownEntries.push(this.entryText(p, childIndent))
      }
    }

    if (existingMeta != null && ts.isObjectLiteralExpression(existingMeta)) {
      for (const p of existingMeta.properties) {
        metaEntries.push(this.entryText(p, metaIndent))
      }
    }

    const signEntries = [...knownEntries]
    if (metaEntries.length > 0) {
      signEntries.push(`additionalMetadata: ${this.objectLiteralTextAt(metaEntries, childIndent)}`)
      this.changes.push({ key: "win.azureSignOptions", description: `moved extra keys [${extraKeys.join(", ")}] into win.sign.additionalMetadata` })
    }
    signEntries.push('type: "azure"')
    this.createChild(win, "sign", signEntries)
  }

  private ruleMacSigning(platform: any, name: string): void {
    const ts = this.ts

    // Removed outright, not moved: ElectronSignOptions omits these and the schema rejects them.
    for (const field of MAC_SIGN_REMOVED_FIELDS) {
      const prop = this.getProp(platform, field)
      if (prop != null) {
        this.removeProp(prop)
        this.changes.push({
          key: `${name}.${field}`,
          description: `removed ${name}.${field} (@electron/osx-sign 2.x dropped the spctl --assess step; there is no ${name}.sign.${field})`,
        })
      }
    }

    const present = MAC_SIGN_FIELDS.filter(f => this.getProp(platform, f) != null)
    const signIgnore = this.getProp(platform, "signIgnore")
    const hasSignIgnore = signIgnore != null
    const existingSignProp = this.getProp(platform, "sign")
    const existingSign = existingSignProp != null && ts.isPropertyAssignment(existingSignProp) ? this.unwrap(existingSignProp.initializer) : null
    const signIsCustom =
      existingSign != null && (ts.isStringLiteral(existingSign) || ts.isArrowFunction(existingSign) || ts.isFunctionExpression(existingSign) || ts.isIdentifier(existingSign))
    const signIsNull = existingSign != null && existingSign.kind === ts.SyntaxKind.NullKeyword

    if (present.length === 0 && !hasSignIgnore) {
      if (signIsNull) {
        this.removeProp(existingSignProp)
        this.changes.push({ key: `${name}.sign`, description: `removed ${name}.sign: null (v26 "no custom signer" = v27 default; sign: null now means skip signing)` })
      }
      return
    }

    if (signIsCustom) {
      const fields = [...present, ...(hasSignIgnore ? ["signIgnore"] : [])].join(", ")
      this.warnings.push(
        `${name}.sign is a custom signing function/path, which cannot hold options. Move [${fields}] into an ElectronSignOptions object manually, or keep the custom signer and drop them.`
      )
      return
    }

    const sources: { prop: any; renameTo?: string }[] = []
    for (const f of present) {
      const prop = this.getProp(platform, f)
      if (this.dropNullField(prop, f, name)) {
        continue
      }
      sources.push({ prop })
      this.changes.push({ key: `${name}.${f}`, description: `moved ${name}.${f} → ${name}.sign.${f}` })
    }
    if (hasSignIgnore && !this.dropNullField(signIgnore, "signIgnore", name)) {
      sources.push({ prop: signIgnore, renameTo: "ignore" })
      this.changes.push({ key: `${name}.signIgnore`, description: `renamed ${name}.signIgnore → ${name}.sign.ignore` })
    }

    // A bare `sign: null` should be dropped before we build the options object.
    if (signIsNull) {
      this.removeProp(existingSignProp)
      if (sources.length === 0) {
        this.changes.push({ key: `${name}.sign`, description: `removed ${name}.sign: null (v26 "no custom signer" = v27 default; sign: null now means skip signing)` })
      }
    }
    if (sources.length > 0) {
      this.moveInto(platform, "sign", sources, [], /* treatNullAsAbsent */ true)
    }
  }

  /** Drops a v26 `null` ("unset") for a field whose v27 type has no null branch. Returns true when dropped. */
  private dropNullField(prop: any, field: string, name: string): boolean {
    const ts = this.ts
    if (!MAC_NULL_MEANS_UNSET_FIELDS.has(field) || !ts.isPropertyAssignment(prop) || this.unwrap(prop.initializer).kind !== ts.SyntaxKind.NullKeyword) {
      return false
    }
    this.removeProp(prop)
    this.changes.push({ key: `${name}.${field}`, description: `removed ${name}.${field}: null (null meant "unset" in v26; the v27 option does not accept null)` })
    return true
  }

  private ruleMacUniversal(platform: any, name: string): void {
    const present = MAC_UNIVERSAL_FIELDS.filter(f => this.getProp(platform, f) != null)
    if (present.length === 0) {
      return
    }
    const sources: { prop: any }[] = []
    for (const f of present) {
      const prop = this.getProp(platform, f)
      if (!this.dropNullField(prop, f, name)) {
        this.changes.push({ key: `${name}.${f}`, description: `moved ${name}.${f} → ${name}.universal.${f}` })
        sources.push({ prop })
      }
    }
    if (sources.length === 0) {
      return
    }
    const ok = this.moveInto(platform, "universal", sources, [])
    if (!ok) {
      this.warnings.push(`${name}.universal already exists but is not an object literal; move ${present.join(", ")} into it manually.`)
    }
  }

  private ruleElectronDownload(root: any): void {
    const ts = this.ts
    let sourceKey: "electronDownload" | "electronGet" = "electronDownload"
    let prop = this.getProp(root, "electronDownload")
    if (prop == null) {
      // A hand-renamed `electronGet` that still carries the v26 shape.
      const electronGet = this.getObjectProp(root, "electronGet")
      if (electronGet == null || !electronGet.properties.some((p: any) => isLegacyElectronDownloadKey(this.propName(p) ?? ""))) {
        return
      }
      sourceKey = "electronGet"
      prop = this.getProp(root, "electronGet")
    } else if (this.getProp(root, "electronGet") != null) {
      this.warnings.push(
        "Both electronDownload and electronGet are set; merge electronDownload into electronGet manually (mirror → mirrorOptions.mirror, isVerifyChecksum: false → unsafelyDisableChecksums: true)."
      )
      return
    }
    if (!ts.isPropertyAssignment(prop)) {
      return
    }
    const old = this.unwrap(prop.initializer)
    if (!ts.isObjectLiteralExpression(old)) {
      this.renameKey(prop, "electronGet")
      this.changes.push({ key: "electronDownload", description: "renamed electronDownload → electronGet" })
      return
    }

    const childIndent = this.propIndentFor(root) + this.indentUnit
    const entries: string[] = []
    const dropped: string[] = []
    let mirrorValueText: string | null = null
    let existingMirrorOptions: any = null

    for (const p of old.properties) {
      if (!ts.isPropertyAssignment(p)) {
        continue
      }
      const name = this.propName(p)
      if (name === "mirror") {
        mirrorValueText = this.valueText(p.initializer, childIndent + this.indentUnit)
        continue
      }
      if (name === "isVerifyChecksum") {
        if (p.initializer.kind === ts.SyntaxKind.FalseKeyword) {
          entries.push("unsafelyDisableChecksums: true")
        } else {
          this.warnings.push("electronGet: isVerifyChecksum had a non-false value; review electronGet.unsafelyDisableChecksums manually.")
        }
        continue
      }
      if ((ELECTRON_DOWNLOAD_DROPPED as readonly string[]).includes(name!)) {
        dropped.push(name!)
        continue
      }
      if (name === "mirrorOptions") {
        existingMirrorOptions = this.unwrap(p.initializer)
        continue
      }
      entries.push(this.entryText(p, childIndent))
    }

    if (mirrorValueText != null || existingMirrorOptions != null) {
      const moInner: string[] = []
      if (existingMirrorOptions != null && ts.isObjectLiteralExpression(existingMirrorOptions)) {
        for (const p of existingMirrorOptions.properties) {
          moInner.push(this.entryText(p, childIndent + this.indentUnit))
        }
      }
      if (mirrorValueText != null) {
        moInner.push(`mirror: ${mirrorValueText}`)
      }
      entries.push(`mirrorOptions: ${this.objectLiteralTextAt(moInner, childIndent)}`)
    }

    if (dropped.length > 0) {
      this.warnings.push(
        `electronGet (formerly electronDownload) dropped [${dropped.join(", ")}] — these have no equivalent in @electron/get v5. Set a mirror via electronGet.mirrorOptions if needed.`
      )
    }

    this.removeProp(prop)
    this.createChild(root, "electronGet", entries)
    this.changes.push({
      key: sourceKey,
      description:
        sourceKey === "electronDownload"
          ? "renamed electronDownload → electronGet (mirror → mirrorOptions.mirror; isVerifyChecksum → unsafelyDisableChecksums)"
          : "reshaped electronGet to the v27 options (mirror → mirrorOptions.mirror; isVerifyChecksum → unsafelyDisableChecksums)",
    })
  }

  // ── Edit primitives ───────────────────────────────────────────────────────

  /**
   * Moves `sources` properties into a child object `childKey` of `parent` (creating it when absent).
   * Returns false when the child exists but is not an object literal (caller should warn).
   */
  private moveInto(parent: any, childKey: string, sources: { prop: any; renameTo?: string }[], extraEntries: string[], treatNullAsAbsent = false): boolean {
    const ts = this.ts
    const existingProp = this.getProp(parent, childKey)
    let existingObj: any = null
    if (existingProp != null && ts.isPropertyAssignment(existingProp)) {
      const v = this.unwrap(existingProp.initializer)
      if (ts.isObjectLiteralExpression(v)) {
        existingObj = v
      } else if (!(treatNullAsAbsent && v.kind === ts.SyntaxKind.NullKeyword)) {
        return false
      }
    }

    if (existingObj != null) {
      const childIndent = this.propIndentFor(existingObj)
      const entries = sources.map(s => this.entryText(s.prop, childIndent, s.renameTo)).concat(extraEntries)
      for (const s of sources) {
        this.removeProp(s.prop)
      }
      this.insertIntoObject(existingObj, entries)
      return true
    }

    const childIndent = this.propIndentFor(parent) + this.indentUnit
    const entries = sources.map(s => this.entryText(s.prop, childIndent, s.renameTo)).concat(extraEntries)
    for (const s of sources) {
      this.removeProp(s.prop)
    }
    this.createChild(parent, childKey, entries)
    return true
  }

  /** Prepends `childKey: { entries }` (or `childKey: rawValue`) as the first property of `parent`. */
  private createChild(parent: any, childKey: string, entries: string[], rawValue?: string): void {
    const parentPropIndent = this.propIndentFor(parent)
    const value = rawValue != null ? rawValue : this.objectLiteralTextAt(entries, parentPropIndent)
    const braceEnd = this.start(parent) + 1
    this.insertEdit(braceEnd, `\n${parentPropIndent}${childKey}: ${value},`)
  }

  /** Inserts already-built "key: value" entries as the first properties of `objLit`. */
  private insertIntoObject(objLit: any, entries: string[]): void {
    if (entries.length === 0) {
      return
    }
    const propIndent = this.propIndentFor(objLit)
    const braceEnd = this.start(objLit) + 1
    const body = entries.map(e => `\n${propIndent}${e},`).join("")
    if (objLit.properties.length > 0) {
      this.insertEdit(braceEnd, body)
    } else {
      const objLineIndent = this.lineIndentAt(this.start(objLit))
      this.insertEdit(braceEnd, body + `\n${objLineIndent}`)
    }
  }

  /** Renders a multi-line object literal whose closing brace aligns to `braceIndent`. */
  private objectLiteralTextAt(entries: string[], braceIndent: string): string {
    if (entries.length === 0) {
      return "{}"
    }
    const propIndent = braceIndent + this.indentUnit
    const body = entries.map(e => `\n${propIndent}${e},`).join("")
    return `{${body}\n${braceIndent}}`
  }

  private removeProp(prop: any): void {
    if (prop == null) {
      return
    }
    this.replaceRange(prop.pos, this.endWithTrailingComma(prop), "")
  }

  private renameKey(prop: any, newName: string): void {
    this.replaceRange(this.start(prop.name), prop.name.end, newName)
  }

  private replaceValue(valueNode: any, newText: string): void {
    this.replaceRange(this.start(valueNode), valueNode.end, newText)
  }

  /** "key: value" text for a property, re-indenting a multi-line value to `targetIndent`. */
  private entryText(prop: any, targetIndent: string, renameTo?: string): string {
    if (prop.name == null) {
      // Spread assignment (`...x`) or other nameless member — capture verbatim, re-indented.
      return this.reindent(this.text.slice(this.start(prop), prop.end), this.lineIndentAt(this.start(prop)), targetIndent)
    }
    const keyText = renameTo != null ? renameTo : this.text.slice(this.start(prop.name), prop.name.end)
    if (this.ts.isPropertyAssignment(prop)) {
      return `${keyText}: ${this.valueText(prop.initializer, targetIndent)}`
    }
    if (this.ts.isShorthandPropertyAssignment(prop)) {
      return keyText
    }
    // Method / accessor — capture verbatim, re-indented.
    return this.reindent(this.text.slice(this.start(prop), prop.end), this.lineIndentAt(this.start(prop)), targetIndent)
  }

  /** Source text of a value node, re-indenting continuation lines from its original to `targetIndent`. */
  private valueText(valueNode: any, targetIndent: string): string {
    const raw = this.text.slice(this.start(valueNode), valueNode.end)
    if (!raw.includes("\n")) {
      return raw
    }
    const fromIndent = this.lineIndentAt(this.start(valueNode))
    return this.reindent(raw, fromIndent, targetIndent)
  }

  private mergeArrays(valueNodes: any[]): string {
    const ts = this.ts
    const elems: string[] = []
    for (const v of valueNodes) {
      const node = this.unwrap(v)
      if (ts.isArrayLiteralExpression(node)) {
        for (const el of node.elements) {
          elems.push(this.text.slice(this.start(el), el.end))
        }
      } else {
        elems.push(this.text.slice(this.start(node), node.end))
      }
    }
    return `[${elems.join(", ")}]`
  }

  private negate(valueNode: any): string {
    const ts = this.ts
    if (valueNode.kind === ts.SyntaxKind.TrueKeyword) {
      return "false"
    }
    if (valueNode.kind === ts.SyntaxKind.FalseKeyword) {
      return "true"
    }
    return `!(${this.text.slice(this.start(valueNode), valueNode.end)})`
  }

  // ── Low-level helpers ──────────────────────────────────────────────────────

  private start(node: any): number {
    return node.getStart(this.sf)
  }

  private getProp(objLit: any, name: string): any | null {
    const ts = this.ts
    for (const p of objLit.properties) {
      if (p.name == null) {
        continue
      }
      let key: string | undefined
      if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name)) {
        key = p.name.text
      } else {
        continue
      }
      if (key === name) {
        return p
      }
    }
    return null
  }

  private getObjectProp(objLit: any, name: string): any | null {
    const ts = this.ts
    const prop = this.getProp(objLit, name)
    if (prop == null || !ts.isPropertyAssignment(prop)) {
      return null
    }
    const v = this.unwrap(prop.initializer)
    return ts.isObjectLiteralExpression(v) ? v : null
  }

  private propName(prop: any): string | undefined {
    const ts = this.ts
    if (prop.name != null && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) || ts.isNumericLiteral(prop.name))) {
      return prop.name.text
    }
    return undefined
  }

  private stringLiteralValue(prop: any): string | undefined {
    const ts = this.ts
    if (prop == null || !ts.isPropertyAssignment(prop)) {
      return undefined
    }
    const v = this.unwrap(prop.initializer)
    return ts.isStringLiteral(v) ? v.text : undefined
  }

  private endWithTrailingComma(prop: any): number {
    let i = prop.end
    while (i < this.text.length && (this.text[i] === " " || this.text[i] === "\t")) {
      i++
    }
    return this.text[i] === "," ? i + 1 : prop.end
  }

  private lineIndentAt(pos: number): string {
    let i = pos
    while (i > 0 && this.text[i - 1] !== "\n") {
      i--
    }
    let j = i
    while (j < this.text.length && (this.text[j] === " " || this.text[j] === "\t")) {
      j++
    }
    return this.text.slice(i, j)
  }

  private detectIndentUnit(root: any): string {
    const braceIndent = this.lineIndentAt(this.start(root))
    for (const p of root.properties) {
      const pi = this.lineIndentAt(this.start(p))
      if (pi.length > braceIndent.length) {
        return pi.slice(braceIndent.length)
      }
    }
    return "  "
  }

  private propIndentFor(objLit: any): string {
    for (const p of objLit.properties) {
      return this.lineIndentAt(this.start(p))
    }
    return this.lineIndentAt(this.start(objLit)) + this.indentUnit
  }

  private reindent(text: string, fromIndent: string, toIndent: string): string {
    const delta = toIndent.length - fromIndent.length
    if (delta === 0) {
      return text
    }
    const lines = text.split("\n")
    return lines
      .map((line, idx) => {
        if (idx === 0) {
          return line
        }
        if (delta > 0) {
          return " ".repeat(delta) + line
        }
        let removed = 0
        let k = 0
        while (k < line.length && removed < -delta && line[k] === " ") {
          k++
          removed++
        }
        return line.slice(k)
      })
      .join("\n")
  }

  private replaceRange(start: number, end: number, text: string): void {
    this.edits.push({ start, end, text })
  }

  private insertEdit(pos: number, text: string): void {
    this.edits.push({ start: pos, end: pos, text })
  }

  apply(): string {
    const edits = [...this.edits].sort((a, b) => a.start - b.start || a.end - b.end)
    let out = ""
    let cursor = 0
    for (const e of edits) {
      if (e.start < cursor) {
        throw new Error(`overlapping edits at ${e.start} (cursor ${cursor})`)
      }
      out += this.text.slice(cursor, e.start) + e.text
      cursor = e.end
    }
    out += this.text.slice(cursor)
    return out
  }
}
