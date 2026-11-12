import { createRequire } from "node:module"
import {
  ALL_PLATFORM_KEYS,
  CORE24_BUILD_ENVIRONMENT_FLAGS,
  FILE_OPTION_KEYS,
  isInheritedPublishDropped,
  LINUX_UNREAD_TARGET_OPTIONS,
  MAC_HELPER_REMOVED_FIELDS,
  MAC_PLATFORM_KEYS,
  MAC_SIGN_UNREAD_FIELDS,
  MAS_CERTIFICATE_WARNING,
  MAS_REMOVED_CERTIFICATE_FIELDS,
  MAS_REMOVED_FIELDS,
  MSI_WRAPPED_ONE_CLICK_WARNING,
  MSI_WRAPPED_REMOVED_FIELDS,
  NSIS_CONFIG_KEYS,
  PUBLISH_MANAGED_OPTIONS,
  SNAP_CORE_KEYS,
  SNAP_CORE_TARGET_OPTION_KEYS,
  UPDATE_MANIFEST_PLATFORM_KEYS,
  V26_MERGED_TARGET_PUBLISH,
  v26Boolean,
} from "app-builder-lib/internal"
import { isValidPublisherNameDn } from "builder-util-runtime"
import * as path from "path"
import {
  ASAR_PLATFORM_KEYS,
  AZURE_KNOWN_FIELDS,
  CERTIFICATE_KEYS,
  core24BuildEnvironmentKeptWarning,
  core24BuildSwitchChange,
  core24BuildSwitchesConflictWarning,
  core24BuildSwitchesUnreadWarning,
  ELECTRON_DOWNLOAD_DROPPED,
  excludesPdb,
  FEED_QUERY_ADVISORY,
  INSECURE_FEED_ADVISORY,
  isInsecureFeedEntry,
  fileOptionsChange,
  fileOptionsConflictWarning,
  gitlabTagNamePrefixKeptWarning,
  INCLUDE_PDB_CHANGES,
  INCLUDE_PDB_NOT_BOOLEAN,
  includePdbManualStep,
  isAppDirFrom,
  isLegacyElectronDownloadKey,
  isMacSignOptOutString,
  legacyKeyMessage,
  managedPublishOptionWarning,
  MAC_ENTITLEMENTS_ADVISORY,
  MAC_NULL_MEANS_UNSET_FIELDS,
  MAC_SIGN_FIELDS,
  MAC_SIGN_REMOVED_FIELDS,
  MAC_UNIVERSAL_FIELDS,
  macSignerOverMasOptionsWarning,
  macSignerOverOptionsWarning,
  macSignOptOutNextToOptionsWarning,
  namesPdbFiles,
  normalizeTargetName,
  NSIS_PER_MACHINE_UPDATE_ADVISORY,
  NSIS_WEB_ADVISORY,
  pdbFilesPatternsAdvisory,
  platformExcludedExtsPdbChange,
  PORTABLE_DEBUG_LOGGING_DROPPED,
  RETIRED_APPIMAGE_PINS,
  retiredAppImagePinDescription,
  SNAP_BASES,
  SNAP_CORE24_UNSUPPORTED,
  snapcraftCoreTargetOptionWarning,
  snapNextToSnapcraftWarning,
  TARGET_PUBLISH_REPLACES_ADVISORY,
  updateManifestBothSetWarning,
  WIN_MISSING_PUBLISHER_NAME_ADVISORY,
  WIN_PUBLISHER_NAME_DN_ADVISORY,
  WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY,
} from "./migrate-schema.js"
import type { MacSignCascade, MigrationChange } from "./migrate-schema.js"

const _require = createRequire(import.meta.url)

/** What `jsonLiteral` returns for a value the AST cannot read. */
const UNREAD = Symbol("unread")

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
  /** The object children createChild added, by parent node and key. */
  private readonly createdChildren = new Map<any, Map<string, { edit: Edit; entries: string[] }>>()
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
    this.ruleRootTarget(root)
    this.ruleMsiWrappedAndMsix(root)
    this.ruleMasAndHelperIds(root)
    this.ruleRootCertificates(root)
    this.ruleRemoveKeys(root, ["framework", "nodeVersion", "launchUiVersion"], key => `removed ${key} (Electron is the only supported framework in v27)`)
    const disableDefaultIgnoredFilesDesc = "removed disableDefaultIgnoredFiles (in v27, include a default-excluded file via an explicit `fileOptions.files` glob, e.g. `**/*.obj`)"
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
    // re-emits its properties verbatim, which would overlap an edit made inside it. mas / masDev are skipped too: ruleMasAndHelperIds
    // removes their publish.
    for (const prop of root.properties) {
      const name = this.propName(prop)
      const obj = name != null && !["snap", "mas", "masDev", "publish", "extraMetadata"].includes(name) ? this.getObjectProp(root, name) : null
      if (obj != null) {
        this.rulePublish(obj, "publish", name + ".")
      }
    }
    this.ruleSnap(root)
    this.ruleSnapcraftCoreTargetOptions(root)
    this.ruleLinuxUnreadTargetOptions(root)
    this.ruleCore24BuildEnvironment(root)
    this.ruleHelperBundleId(root)
    this.ruleSquirrelNoMsi(root)
    this.ruleCustomNsis(root)
    this.ruleWinSign(root)
    // a custom signer reaches the later sections through the mac → mas → masDev merge, which the cascade follows (see migrateConfig step 13)
    let macSignCascade: MacSignCascade | "unknown" = { signer: null, signerWasBare: false, options: null }
    for (const platform of MAC_PLATFORM_KEYS) {
      const p = this.getObjectProp(root, platform)
      if (p != null) {
        this.ruleMacSigning(p, platform, macSignCascade)
        this.ruleMacUniversal(p, platform)
      }
      macSignCascade = this.macSignCascadeAfter(root, platform, macSignCascade)
    }
    this.ruleElectronDownload(root)
    this.ruleUpdateManifestSigning(root)
    this.ruleToolsets(root)
    // ruleFileOptions adds the excludedExts entry ruleIncludePdb returns to the root fileOptions it may create for the flat keys.
    this.ruleFileOptions(root, "", this.ruleIncludePdb(root))
    for (const platform of ALL_PLATFORM_KEYS) {
      const p = this.getObjectProp(root, platform)
      if (p != null) {
        this.ruleFileOptions(p, `${platform}.`)
      }
    }
    this.ruleNsisWebAdvisory(root)
    this.ruleMacEntitlementsAdvisory(root)
    this.ruleNsisPerMachineAdvisory(root)
    this.ruleWinSignHookPublisherNameAdvisory(root)
    this.ruleWinPublisherNameDnAdvisory(root)
    this.ruleWinMissingPublisherNameAdvisory(root)
    this.ruleFeedQueryAdvisory(root)
    this.ruleInsecureFeedAdvisory(root)
    this.ruleTargetPublishReplacesAdvisory(root)
    this.rulePdbFilesPatternsAdvisory(root)
  }

  // ── Rules ───────────────────────────────────────────────────────────────

  // Advisory only — adds no edit, so an nsis-web-only config stays a "no-op" and is never rewritten.
  private ruleNsisWebAdvisory(root: any): void {
    if (this.detectTarget(root, "win", ["nsis-web"])) {
      this.advisories.push(NSIS_WEB_ADVISORY)
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
    // Not signing with electron-builder's defaults at all: a custom signer, sign: false or identity: null (skip signing).
    const bypassesDefaults = (p: any, sign: any): boolean => {
      const signProp = this.getProp(p, "sign")
      const value = signProp != null && ts.isPropertyAssignment(signProp) ? this.unwrap(signProp.initializer) : null
      // a bare signer (moved to sign.sign), the opt-out "false" / "" (left in place), a method, false, or a value the AST cannot read; not
      // null, undefined (no sign at all), true, a number or an array
      const custom =
        signProp != null &&
        sign == null &&
        !isNullLiteral(signProp) &&
        !(value != null && ts.isIdentifier(value) && value.text === "undefined") &&
        !(value != null && this.isLiteral(value) && !ts.isStringLiteralLike(value) && value.kind !== ts.SyntaxKind.FalseKeyword)
      const hook = sign == null ? undefined : this.propValue(sign, "sign")
      const hasHook = hook !== undefined && hook.kind !== ts.SyntaxKind.NullKeyword && !(this.isLiteral(hook) && !ts.isStringLiteralLike(hook))
      return custom || hasHook || isNullLiteral(this.getProp(p, "identity")) || (sign != null && isNullLiteral(this.getProp(sign, "identity")))
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

  // Advisory only. Mirrors migrateConfig: nsis.perMachine or nsisWeb.perMachine is literally true (a non-literal value is not read).
  private ruleNsisPerMachineAdvisory(root: any): void {
    const ts = this.ts
    if (["nsis", "nsisWeb"].some(name => this.propValue(this.objectLiteral(this.propValue(root, name)), "perMachine")?.kind === ts.SyntaxKind.TrueKeyword)) {
      this.advisories.push(NSIS_PER_MACHINE_UPDATE_ADVISORY)
    }
  }

  /**
   * The win.sign object literal that migrateConfig produces: win.sign when set, otherwise the v26 win.azureSignOptions (else
   * win.signtoolOptions) moved into it, unless signExecutable / signAndEditExecutable: false disabled signing. Returns its field reader
   * (a field migrateConfig moves into additionalMetadata reads as undefined), or null when it is not an object literal.
   */
  private migratedWinSign(win: any): ((name: string) => any) | null {
    const ts = this.ts
    const isNullish = (v: any) => v === undefined || v.kind === ts.SyntaxKind.NullKeyword
    // A non-literal flag may be false, so it counts as false.
    const isFalseOrUnread = (v: any) => v !== undefined && (v.kind === ts.SyntaxKind.FalseKeyword || !this.isLiteral(v))
    const winSign = this.propValue(win, "sign")
    let legacy: "azure" | "signtool" | null = null
    let sign: any = null
    if (!isNullish(winSign)) {
      sign = this.objectLiteral(winSign)
    } else if (!["signExecutable", "signAndEditExecutable"].some(k => isFalseOrUnread(this.propValue(win, k)))) {
      const azure = this.propValue(win, "azureSignOptions")
      legacy = isNullish(azure) ? "signtool" : "azure"
      sign = this.objectLiteral(legacy === "azure" ? azure : this.propValue(win, "signtoolOptions"))
    }
    if (sign == null) {
      return null
    }
    // migrateConfig moves a string-valued azureSignOptions field that is not a known Azure option into additionalMetadata.
    return (name: string) => {
      const v = this.propValue(sign, name)
      return legacy === "azure" && v !== undefined && !AZURE_KNOWN_FIELDS.has(name) && (ts.isStringLiteralLike(v) || ts.isTemplateExpression(v)) ? undefined : v
    }
  }

  // Advisory only. Mirrors migrateConfig on the win.sign it produces (see migratedWinSign).
  private ruleWinSignHookPublisherNameAdvisory(root: any): void {
    const ts = this.ts
    const isNullish = (v: any) => v === undefined || v.kind === ts.SyntaxKind.NullKeyword
    // A non-literal flag may be false, so it counts as false (no advisory).
    const isFalseOrUnread = (v: any) => v !== undefined && (v.kind === ts.SyntaxKind.FalseKeyword || !this.isLiteral(v))
    const win = this.objectLiteral(this.propValue(root, "win"))
    if (win == null) {
      return
    }
    // A sign value that is not an object literal may carry publisherName or a certificate (a spread in one counts as a publisherName below).
    const field = this.migratedWinSign(win)
    if (field == null) {
      return
    }
    // Any value but null or a non-string literal counts as a hook: a JS config usually passes a function or an imported module.
    const hook = field("sign")
    if (isNullish(hook) || (this.isLiteral(hook) && !ts.isStringLiteralLike(hook))) {
      return
    }
    // Mere presence suppresses: publisherName with any value (null too). A certificate in the config doesn't: a hook needs publisherName.
    if (field("publisherName") !== undefined || isFalseOrUnread(this.propValue(win, "verifyUpdateCodeSignature"))) {
      return
    }
    this.advisories.push(WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY)
  }

  // Advisory only. Mirrors migrateConfig on the win.sign it produces (see migratedWinSign): a publisherName (or an entry of a publisherName
  // array literal) that is a string literal but not a distinguished name, or another literal (no string at all). A value
  // the AST cannot read is skipped; publisherName: null is the opt-out.
  private ruleWinPublisherNameDnAdvisory(root: any): void {
    const ts = this.ts
    const win = this.objectLiteral(this.propValue(root, "win"))
    const field = win == null ? null : this.migratedWinSign(win)
    const value = field == null ? undefined : field("publisherName")
    if (value === undefined) {
      return
    }
    const publisherName = this.unwrap(value)
    if (publisherName.kind === ts.SyntaxKind.NullKeyword) {
      return
    }
    const entries = ts.isArrayLiteralExpression(publisherName) ? publisherName.elements.map((el: any) => this.unwrap(el)) : [publisherName]
    const isInvalid = (entry: any) => (ts.isStringLiteralLike(entry) ? !isValidPublisherNameDn(entry.text) : this.isLiteral(entry))
    if (entries.some(isInvalid)) {
      this.advisories.push(WIN_PUBLISHER_NAME_DN_ADVISORY)
    }
  }

  // Advisory only. Mirrors migrateConfig on the win.sign it produces (see migratedWinSign): win.sign: false / null (also a v26
  // signExecutable / signAndEditExecutable: false, which migrates to win.sign: false when win.sign is unset) or a publisherName: null,
  // unless win.verifyUpdateCodeSignature is false. Only literals count: a value the AST cannot read may resolve a publisherName.
  private ruleWinMissingPublisherNameAdvisory(root: any): void {
    const ts = this.ts
    const win = this.objectLiteral(this.propValue(root, "win"))
    if (win == null) {
      return
    }
    const kind = (v: any) => (v === undefined ? undefined : this.unwrap(v).kind)
    const verify = this.propValue(win, "verifyUpdateCodeSignature")
    // a value that is not a literal may be false
    if (verify !== undefined && (kind(verify) === ts.SyntaxKind.FalseKeyword || !this.isLiteral(verify))) {
      return
    }
    const isNullish = (v: any) => v === undefined || kind(v) === ts.SyntaxKind.NullKeyword
    const winSign = this.propValue(win, "sign")
    let missing: boolean
    if (!isNullish(winSign)) {
      missing = kind(winSign) === ts.SyntaxKind.FalseKeyword
    } else if (["signExecutable", "signAndEditExecutable"].some(k => kind(this.propValue(win, k)) === ts.SyntaxKind.FalseKeyword)) {
      // migrates to win.sign: false
      missing = true
    } else {
      // win.sign: null stays null unless migrateConfig moves v26 signing options into it
      missing = winSign !== undefined && ["signtoolOptions", "azureSignOptions"].every(k => isNullish(this.propValue(win, k)))
    }
    if (!missing) {
      const field = this.migratedWinSign(win)
      missing = field != null && kind(field("publisherName")) === ts.SyntaxKind.NullKeyword
    }
    if (missing) {
      this.advisories.push(WIN_MISSING_PUBLISHER_NAME_ADVISORY)
    }
  }

  // Advisory only, for the publish entries migrateConfig walks (see publishEntries).
  private ruleFeedQueryAdvisory(root: any): void {
    const ts = this.ts
    // A non-literal url is not read, but a template's static text is: a "?" there is in every url the template produces.
    const urlHasQuery = (url: any): boolean =>
      url !== undefined &&
      (ts.isStringLiteralLike(url)
        ? url.text.includes("?")
        : ts.isTemplateExpression(url) && [url.head, ...url.templateSpans.map((s: any) => s.literal)].some((part: any) => part.text.includes("?")))
    const isGenericWithQuery = (entry: any): boolean => {
      const obj = this.objectLiteral(this.unwrap(entry))
      const provider = this.propValue(obj, "provider")
      return provider !== undefined && ts.isStringLiteralLike(provider) && provider.text === "generic" && urlHasQuery(this.propValue(obj, "url"))
    }
    if (this.publishEntries(root).some(isGenericWithQuery)) {
      this.advisories.push(FEED_QUERY_ADVISORY)
    }
  }

  // Advisory only. The same publish entries as ruleFeedQueryAdvisory, read like migrateConfig's isInsecureFeedEntry: only literal values (a
  // property the AST cannot read makes the entry unread, so a non-literal `accelerate` never reports an endpoint it may replace).
  private ruleInsecureFeedAdvisory(root: any): void {
    const ts = this.ts
    const isInsecure = (entry: any): boolean => {
      const obj = this.objectLiteral(this.unwrap(entry))
      if (obj == null) {
        return false
      }
      const fields: Record<string, string | boolean> = {}
      for (const name of ["provider", "url", "protocol", "host", "endpoint", "accelerate"]) {
        const value = this.propValue(obj, name)
        if (value === undefined) {
          continue
        }
        if (ts.isStringLiteralLike(value)) {
          fields[name] = value.text
        } else if (value.kind === ts.SyntaxKind.TrueKeyword || value.kind === ts.SyntaxKind.FalseKeyword) {
          fields[name] = value.kind === ts.SyntaxKind.TrueKeyword
        } else {
          return false
        }
      }
      return isInsecureFeedEntry(fields)
    }
    if (this.publishEntries(root).some(isInsecure)) {
      this.advisories.push(INSECURE_FEED_ADVISORY)
    }
  }

  // Advisory only. Mirrors migrateConfig, which reads the configuration as written. A publish value the AST cannot read counts when the other
  // one may be merged with it (a string, null, or a list next to an object was never merged); a section it cannot read is skipped.
  private ruleTargetPublishReplacesAdvisory(root: any): void {
    const ts = this.ts
    const isNullish = (node: any) => node === undefined || node.kind === ts.SyntaxKind.NullKeyword
    // v26.12 and later read the snap section as `snapcraft ?? snap`
    const publishOf = (key: string) => {
      const section = this.propValue(root, key)
      return this.propValue(this.objectLiteral(key === "snapcraft" && isNullish(section) ? this.propValue(root, "snap") : section), "publish")
    }
    const isContainer = (node: any) => ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node)
    const mayMerge = (node: any) => isContainer(node) || !this.isLiteral(node)
    const replaces = Object.entries(V26_MERGED_TARGET_PUBLISH).some(([target, inherited]) => {
      const own = publishOf(target)
      const parent = publishOf(inherited)
      if (own === undefined || parent === undefined) {
        return false
      }
      const ownValue = this.jsonLiteral(own)
      const parentValue = this.jsonLiteral(parent)
      if (ownValue === UNREAD || parentValue === UNREAD) {
        // a list next to an object was never merged, even when an option of either cannot be read
        return isContainer(own) && isContainer(parent) ? ts.isArrayLiteralExpression(own) === ts.isArrayLiteralExpression(parent) : mayMerge(own) && mayMerge(parent)
      }
      return isInheritedPublishDropped(target, parentValue, ownValue)
    })
    if (replaces) {
      this.advisories.push(TARGET_PUBLISH_REPLACES_ADVISORY)
    }
  }

  // Mirrors migrateConfig, which walks the publish of the root and of each top-level section of the migrated config: a v26 `snap` moves
  // under snapcraft.<base> (not walked) unless its base is "custom", when its keys replace snapcraft's.
  private publishEntries(root: any): any[] {
    const ts = this.ts
    // migrateConfig drops a v26 snap next to a snapcraft that is set (ruleSnap: an object literal), and otherwise moves snap.publish to
    // snapcraft.publish; both remove mas.publish / masDev.publish
    const snapcraftValue = this.propValue(root, "snapcraft")
    const snapDropped = snapcraftValue !== undefined && ts.isObjectLiteralExpression(snapcraftValue)
    const sections: any[] = [root]
    for (const prop of root.properties) {
      const name = this.propName(prop)
      const skipped = name == null || ["mas", "masDev", "publish", "extraMetadata"].includes(name) || (name === "snap" && snapDropped)
      const section = skipped ? null : this.objectLiteral(this.propValue(root, name))
      if (section != null) {
        sections.push(section)
      }
    }
    // it also moves snapcraft.<base>.publish to an unset snapcraft.publish
    const snapcraft = this.objectLiteral(snapcraftValue)
    const base = snapcraft == null ? undefined : this.propValue(snapcraft, "base")
    if (snapcraft != null && base !== undefined && ts.isStringLiteral(base) && this.propValue(snapcraft, "publish") === undefined) {
      const baseOptions = this.objectLiteral(this.propValue(snapcraft, base.text))
      if (baseOptions != null) {
        sections.push(baseOptions)
      }
    }
    return sections.flatMap(section => {
      const publish = this.propValue(section, "publish")
      return publish === undefined ? [] : ts.isArrayLiteralExpression(publish) ? [...publish.elements] : [publish]
    })
  }

  // Advisory only. Mirrors migrateConfig, which reads the root and platform `fileOptions.files` after the flat keys moved into them: the
  // `fileOptions.files` of an object literal, else the flat `files` that ruleFileOptions moves there (a `fileOptions` the AST cannot read is skipped).
  private rulePdbFilesPatternsAdvisory(root: any): void {
    const ts = this.ts
    const patterns: Array<{ key: string; pattern: string }> = []
    const holders: Array<[string, any]> = [["", root], ...ALL_PLATFORM_KEYS.map((platform): [string, any] => [`${platform}.`, this.objectLiteral(this.propValue(root, platform))])]
    for (const [prefix, holder] of holders) {
      const fileOptions = this.propValue(holder, "fileOptions")
      if (holder == null || (fileOptions !== undefined && fileOptions.kind !== ts.SyntaxKind.NullKeyword && !ts.isObjectLiteralExpression(fileOptions))) {
        continue
      }
      const nested = this.objectLiteral(fileOptions) != null && this.getProp(fileOptions, "files") != null
      const files = nested ? this.propValue(fileOptions, "files") : this.propValue(holder, "files")
      for (const pattern of this.appFilesPatterns(files).filter(namesPdbFiles)) {
        patterns.push({ key: `${prefix}fileOptions.files`, pattern })
      }
    }
    if (patterns.length > 0) {
      this.advisories.push(pdbFilesPatternsAdvisory(patterns))
    }
  }

  /**
   * Mirrors migrateConfig's `appFilesPatterns`: the string literals of a `files` value (a pattern, a FileSet or a list of them) that apply to
   * the app directory, from the strings and the `filter` of a FileSet without `from` or with from "."; what the AST cannot read is skipped.
   */
  private appFilesPatterns(files: any): string[] {
    const ts = this.ts
    const elements = (node: any): any[] => (node === undefined ? [] : ts.isArrayLiteralExpression(node) ? node.elements.map((el: any) => this.unwrap(el)) : [node])
    const result: string[] = []
    for (const entry of elements(files)) {
      if (ts.isStringLiteralLike(entry)) {
        result.push(entry.text)
        continue
      }
      if (!ts.isObjectLiteralExpression(entry)) {
        continue
      }
      const from = this.propValue(entry, "from")
      if (from === undefined || from.kind === ts.SyntaxKind.NullKeyword || (ts.isStringLiteralLike(from) && isAppDirFrom(from.text))) {
        result.push(
          ...elements(this.propValue(entry, "filter"))
            .filter((it: any) => ts.isStringLiteralLike(it))
            .map((it: any) => it.text)
        )
      }
    }
    return result
  }

  private ruleToolsets(root: any): void {
    const ts = this.ts
    const toolsets = this.getObjectProp(root, "toolsets")
    if (toolsets == null) {
      return
    }
    for (const prop of toolsets.properties) {
      const name = this.propName(prop)
      // toolsets.executables is not a bundle, and null is valid for it (the default locations)
      if (name == null || name === "executables" || !ts.isPropertyAssignment(prop)) {
        continue
      }
      const value = this.unwrap(prop.initializer)
      if (value.kind === ts.SyntaxKind.NullKeyword) {
        this.removeProp(prop)
        this.changes.push({
          key: `toolsets.${name}`,
          description: `removed toolsets.${name}: null (v27 rejects null; unset resolves to "latest", the newest bundle — pin "0.0.0" to keep the legacy bundle v26 used)`,
        })
      } else if (name === "appimage" && ts.isStringLiteral(value)) {
        const retired = RETIRED_APPIMAGE_PINS.get(value.text)
        if (retired != null) {
          this.replaceValue(prop.initializer, JSON.stringify(retired.replacement))
          this.changes.push({ key: "toolsets.appimage", description: retiredAppImagePinDescription(value.text, retired) })
        }
      }
    }
  }

  /** Mirrors migrateConfig's detectTarget: `<platform>.target` selects one of `names` (a root-level `target` never selected anything). */
  private detectTarget(root: any, platform: "win" | "linux", names: ReadonlyArray<string>): boolean {
    const platformTarget = this.propValue(this.objectLiteral(this.propValue(root, platform)), "target")
    return this.hasTargetIn(platformTarget, names)
  }

  /** Mirrors migrateConfig's hasTarget: a target name (with an optional ":<arch>" suffix, any case), a `{ target }` object, or an array of either. */
  private hasTargetIn(value: any, names: ReadonlyArray<string>): boolean {
    const ts = this.ts
    if (value === undefined) {
      return false
    }
    // A non-literal name (identifier, template with substitutions, …) is not read.
    if (ts.isStringLiteralLike(value)) {
      return names.includes(normalizeTargetName(value.text))
    }
    if (ts.isArrayLiteralExpression(value)) {
      return value.elements.some((el: any) => this.hasTargetIn(this.unwrap(el), names))
    }
    return this.hasTargetIn(this.propValue(this.objectLiteral(value), "target"), names)
  }

  // A root-level `target` never selected a target (only <platform>.target is read): remove it and say what it named. It is never
  // moved to a platform: zip / 7z / dir name no platform, and placing dmg / nsis / deb there would change what is built.
  private ruleRootTarget(root: any): void {
    const ts = this.ts
    const prop = this.getProp(root, "target")
    if (prop == null) {
      return
    }
    const value = ts.isPropertyAssignment(prop) ? prop.initializer.getText(this.sf) : ts.isShorthandPropertyAssignment(prop) ? prop.name.getText(this.sf) : null
    this.removeProp(prop)
    this.changes.push({ key: "target", description: "removed the root-level target (it never selected a target; targets are set per platform)" })
    if (value != null && value !== "null" && value !== "undefined") {
      this.warnings.push(`the root-level target ${value} never had an effect and was removed; to build it, set it under mac.target, win.target or linux.target`)
    }
  }

  // Mirrors migrateConfig step 2e: the msiWrapped installer options and msix.electronUpdaterAware never had an effect. They are
  // never moved to nsis.*, which would change the NSIS installer. oneClick: false (or a value that is not a literal true) warns.
  private ruleMsiWrappedAndMsix(root: any): void {
    const ts = this.ts
    const msiWrapped = this.getObjectProp(root, "msiWrapped")
    if (msiWrapped != null) {
      const oneClick = this.getProp(msiWrapped, "oneClick")
      if (oneClick != null && !(ts.isPropertyAssignment(oneClick) && oneClick.initializer.kind === ts.SyntaxKind.TrueKeyword)) {
        this.warnings.push(MSI_WRAPPED_ONE_CLICK_WARNING)
      }
      for (const key of MSI_WRAPPED_REMOVED_FIELDS) {
        const prop = this.getProp(msiWrapped, key)
        if (prop != null) {
          this.removeProp(prop)
          this.changes.push({ key: `msiWrapped.${key}`, description: `removed msiWrapped.${key} (no effect on the MSI wrapper; the wrapped installer uses nsis.${key})` })
        }
      }
    }
    const msix = this.getObjectProp(root, "msix")
    const electronUpdaterAware = msix == null ? null : this.getProp(msix, "electronUpdaterAware")
    if (electronUpdaterAware != null) {
      this.removeProp(electronUpdaterAware)
      this.changes.push({ key: "msix.electronUpdaterAware", description: "removed msix.electronUpdaterAware (it had no effect: MSIX writes no update info)" })
    }
  }

  // Mirrors migrateConfig step 2f: the mas / masDev options Mac App Store builds never read, and the Helper EH / NP bundle ids. They are
  // never moved to mac, which would change the macOS build. A spread can bring any mac option into mas / masDev, so it warns.
  private ruleMasAndHelperIds(root: any): void {
    const ts = this.ts
    for (const platform of ["mas", "masDev"]) {
      const p = this.getObjectProp(root, platform)
      if (p == null) {
        continue
      }
      if (p.properties.some((prop: any) => ts.isSpreadAssignment(prop))) {
        this.warnings.push(
          `${platform} spreads another object: Mac App Store builds already inherit every mac option, and a spread key that ${platform} no longer accepts ` +
            "(target, icon, publish, …) fails the v27 build. Remove the spread and keep only the options Mac App Store builds read. " +
            "See https://www.electron.build/docs/migration/v27-config-changes#mas-masdev-options"
        )
      }
      if (MAS_REMOVED_CERTIFICATE_FIELDS.some(key => this.getProp(p, key) != null) && !this.warnings.includes(MAS_CERTIFICATE_WARNING)) {
        this.warnings.push(MAS_CERTIFICATE_WARNING)
      }
      for (const key of Object.keys(MAS_REMOVED_FIELDS)) {
        const prop = this.getProp(p, key)
        if (prop != null) {
          this.removeProp(prop)
          this.changes.push({ key: `${platform}.${key}`, description: `removed ${platform}.${key} (Mac App Store builds never read it there)` })
        }
      }
    }
    for (const platform of MAC_PLATFORM_KEYS) {
      const p = this.getObjectProp(root, platform)
      for (const key of MAC_HELPER_REMOVED_FIELDS) {
        const prop = p == null ? null : this.getProp(p, key)
        if (prop != null) {
          this.removeProp(prop)
          this.changes.push({ key: `${platform}.${key}`, description: `removed ${platform}.${key} (Electron 4 and later ship no such helper)` })
        }
      }
    }
  }

  // Mirrors migrateConfig's root cscLink step: a root cscLink / cscKeyPassword applied to mac and win alike and won over their own values, so it is
  // copied into both (a missing section is created). A mac / win that is not an object literal leaves the root keys for the build-time
  // guard, with a warning. linux.cscLink / cscKeyPassword never had an effect.
  private ruleRootCertificates(root: any): void {
    const ts = this.ts
    const valueOf = (prop: any): string | null =>
      ts.isPropertyAssignment(prop) ? prop.initializer.getText(this.sf) : ts.isShorthandPropertyAssignment(prop) ? prop.name.getText(this.sf) : null
    const moved: Array<{ key: string; prop: any }> = []
    for (const key of CERTIFICATE_KEYS) {
      const prop = this.getProp(root, key)
      if (prop == null) {
        continue
      }
      const value = valueOf(prop)
      if (value === "null" || value === "undefined") {
        this.removeProp(prop)
        this.changes.push({ key, description: `removed ${key}: ${value} (it had no effect)` })
      } else {
        moved.push({ key, prop })
      }
    }
    const platforms = ["mac", "win"]
    // a spread or computed key in mac / win could set the key after the copied root value, which won over it in v26
    const unreadable = platforms.filter(platform => {
      const section = this.getObjectProp(root, platform)
      return this.getProp(root, platform) != null && (section == null || this.hasSpreadOrComputed(section))
    })
    if (moved.length > 0 && unreadable.length > 0) {
      this.warnings.push(
        `the root ${moved.map(it => it.key).join(" / ")} applies to mac and win, but ${unreadable.join(" and ")} is not an object literal, spreads another object or uses a computed key: ` +
          "move it into mac and win manually"
      )
    } else if (moved.length > 0) {
      for (const platform of platforms) {
        const section = this.getObjectProp(root, platform)
        if (section == null) {
          this.createChild(
            root,
            platform,
            moved.map(it => this.entryText(it.prop, this.propIndentFor(root) + this.indentUnit))
          )
          continue
        }
        for (const { key, prop } of moved) {
          const existing = this.getProp(section, key)
          if (existing == null) {
            continue
          }
          if (valueOf(existing) !== valueOf(prop)) {
            this.warnings.push(
              `the root ${key} was copied over the different ${platform}.${key}: in v26 the root value won over it, so the build is unchanged. ` +
                `If ${platform} should use its own value, set ${platform}.${key} back.`
            )
          }
          this.removeProp(existing)
        }
        this.insertIntoObject(
          section,
          moved.map(it => this.entryText(it.prop, this.propIndentFor(section)))
        )
      }
      for (const { key, prop } of moved) {
        this.removeProp(prop)
        this.changes.push({ key, description: `moved ${key} → mac.${key} and win.${key} (the root value applied to both)` })
      }
    }
    const linux = this.getObjectProp(root, "linux")
    for (const key of linux == null ? [] : CERTIFICATE_KEYS) {
      const prop = this.getProp(linux, key)
      if (prop != null) {
        this.removeProp(prop)
        this.changes.push({ key: `linux.${key}`, description: `removed linux.${key} (it never had an effect: Linux packages are not code-signed)` })
      }
    }
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
        this.changes.push({ key: "asar", description: "removed redundant asar: true (asar is enabled by default; the explicit `true` is not needed)" })
      } else {
        this.replaceValue(asarProp.initializer, this.objectLiteralTextAt(entries, braceIndent))
        const keys = entries.map(e => e.slice(0, e.indexOf(":")))
        this.changes.push({ key: "asar", description: `replaced asar: true with an asar object carrying ${keys.join(", ")}` })
      }
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
    const label = `${prefix}${key}`
    // As in migratePublishEntries, a GitLab true here becomes an explicit "v": v26 merged the publish object of such a target over the inherited
    // one, so the true overrode an inherited false, and without the default the build's replaced-publish check reports the inherited
    // tagNamePrefix as dropped. Two lists were concatenated instead, so a list entry overrode nothing.
    const mergedTargetObject = !ts.isArrayLiteralExpression(value) && Object.prototype.hasOwnProperty.call(V26_MERGED_TARGET_PUBLISH, prefix.slice(0, -1))
    let changed = false
    for (const entry of entries) {
      const obj = this.unwrap(entry)
      if (!ts.isObjectLiteralExpression(obj)) {
        continue
      }
      // Mirrors migratePublishEntries: the fields electron-builder writes into app-update.yml are removed on every provider, except
      // publisherName, which is kept with a warning
      for (const field of Object.keys(PUBLISH_MANAGED_OPTIONS)) {
        const fieldProp = this.getProp(obj, field)
        if (fieldProp == null) {
          continue
        }
        if (field !== "publisherName") {
          this.removeProp(fieldProp)
          if (!this.changes.some(it => it.key === `${label}[].${field}`)) {
            this.changes.push({ key: `${label}[].${field}`, description: `removed ${label}[].${field} (electron-builder writes it into app-update.yml itself)` })
          }
        }
        const warning = managedPublishOptionWarning(label, field)
        if (warning != null && !this.warnings.includes(warning)) {
          this.warnings.push(warning)
        }
      }
      const provider = this.stringLiteralValue(this.getProp(obj, "provider"))
      if (provider !== "github" && provider !== "gitlab") {
        continue
      }
      // Mirrors migratePublishEntries. These edits cannot overlap the removals above: removeProp cuts a property up to just after its comma
      const vPrefixed = this.getProp(obj, "vPrefixedTagName")
      const tagNamePrefix = this.getProp(obj, "tagNamePrefix")
      if (provider === "gitlab") {
        if (vPrefixed == null) {
          continue
        }
        // v26 rejected a tagNamePrefix on GitLab, so one set next to it was written for v27 and is kept
        if (tagNamePrefix != null) {
          this.removeProp(vPrefixed)
          const warning = gitlabTagNamePrefixKeptWarning(label)
          if (!this.warnings.includes(warning)) {
            this.warnings.push(warning)
          }
        } else {
          const vPrefix = this.v26UsedVPrefix(vPrefixed, "GitLab", label)
          if (vPrefix == null) {
            continue
          }
          const initializer = this.unwrap(vPrefixed.initializer)
          if (!vPrefix) {
            this.replaceRange(this.start(vPrefixed), vPrefixed.end, 'tagNamePrefix: ""')
          } else if (mergedTargetObject && !(ts.isIdentifier(initializer) && initializer.text === "undefined")) {
            // an `undefined` is removed: v26's merge skipped it, so it overrode nothing (and migrateConfig's JSON copy drops it)
            this.replaceRange(this.start(vPrefixed), vPrefixed.end, 'tagNamePrefix: "v"')
          } else {
            this.removeProp(vPrefixed)
          }
        }
        changed = true
        continue
      }
      const prefixText = this.stringLiteralValue(tagNamePrefix)
      if (vPrefixed != null) {
        // v26 githubTagPrefix(): a non-empty tagNamePrefix won; otherwise vPrefixedTagName (default true, read as v26Boolean) chose "v" or "".
        if (tagNamePrefix != null && prefixText !== "") {
          this.removeProp(vPrefixed)
        } else {
          const vPrefix = this.v26UsedVPrefix(vPrefixed, "GitHub", label, tagNamePrefix != null)
          if (vPrefix == null) {
            continue
          }
          if (tagNamePrefix == null) {
            this.replaceRange(this.start(vPrefixed), vPrefixed.end, `tagNamePrefix: ${vPrefix ? '"v"' : '""'}`)
          } else {
            this.replaceValue(tagNamePrefix.initializer, vPrefix ? '"v"' : '""')
            this.removeProp(vPrefixed)
          }
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
        key: `${label}[].vPrefixedTagName`,
        description: "replaced vPrefixedTagName with tagNamePrefix on GitHub and GitLab publish entries",
      })
    }
  }

  /**
   * Whether v26 tagged with the "v" prefix for a GitHub / GitLab `vPrefixedTagName` property: false when its literal value read as false
   * (`v26Boolean`), else true (`undefined` included). null for a value the AST cannot read, which is left in place with a warning, for the
   * build-time check to reject. `nextToEmptyPrefix`: the entry also sets `tagNamePrefix: ""`, which v26 ignored, so both keys must be replaced.
   */
  private v26UsedVPrefix(prop: any, provider: "GitHub" | "GitLab", label: string, nextToEmptyPrefix = false): boolean | null {
    const ts = this.ts
    const value = ts.isPropertyAssignment(prop) ? this.unwrap(prop.initializer) : null
    if (value == null || !(this.isLiteral(value) || (ts.isIdentifier(value) && value.text === "undefined"))) {
      const warning = nextToEmptyPrefix
        ? `The ${provider} vPrefixedTagName in ${label} is not a literal, so it was left in place next to tagNamePrefix: "" (which v26 ignored): ` +
          'replace both keys with tagNamePrefix: "" where it is false and with tagNamePrefix: "v" where it is true.'
        : `The ${provider} vPrefixedTagName in ${label} is not a literal, so it was left in place: replace it with tagNamePrefix: "" where it is false ` +
          '(no prefix), and remove it where it is true (tagNamePrefix defaults to "v").'
      if (!this.warnings.includes(warning)) {
        this.warnings.push(warning)
      }
      return null
    }
    return v26Boolean(this.scalarLiteral(value)) !== false
  }

  private ruleSnap(root: any): void {
    const ts = this.ts
    const snapProp = this.getProp(root, "snap")
    if (snapProp == null || !ts.isPropertyAssignment(snapProp)) {
      return
    }
    const snap = this.unwrap(snapProp.initializer)
    // an empty value (null, undefined, false, a string): there is nothing to move. A variable, a conditional or a call may hold options.
    const snapIsEmpty = (ts.isIdentifier(snap) && snap.text === "undefined") || (this.isLiteral(snap) && !ts.isObjectLiteralExpression(snap) && !ts.isArrayLiteralExpression(snap))
    if (snapIsEmpty) {
      this.removeProp(snapProp)
      this.changes.push({ key: "snap", description: "removed empty snap config (use snapcraft in v27)" })
      return
    }

    // Mirrors migrateConfig: v26.12 and later read `snapcraft ?? snap`, so a snap next to a snapcraft that is set was ignored and is dropped
    // rather than merged in. A `snapcraft: null` / `undefined` is no snapcraft; a value the AST cannot read leaves both for the guard.
    const snapcraftProp = this.getProp(root, "snapcraft")
    const snapcraftValue = snapcraftProp != null && ts.isPropertyAssignment(snapcraftProp) ? this.unwrap(snapcraftProp.initializer) : null
    const snapcraftIsUnset =
      snapcraftValue != null && (snapcraftValue.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(snapcraftValue) && snapcraftValue.text === "undefined"))
    if (snapcraftProp != null && !snapcraftIsUnset) {
      if (snapcraftValue == null || !ts.isObjectLiteralExpression(snapcraftValue)) {
        this.warnings.push(
          "snap was left in place: snapcraft is not an object literal, and v26 read snap whenever snapcraft was null or undefined. " +
            "Move the snap options you need into snapcraft yourself (publish / artifactName on snapcraft itself, the others under snapcraft.<base>) and remove snap."
        )
        return
      }
      this.removeProp(snapProp)
      this.changes.push({ key: "snap", description: "removed snap (it was ignored next to snapcraft)" })
      const keys = ts.isObjectLiteralExpression(snap) ? snap.properties.map((p: any) => this.propName(p)).filter((name: string | undefined) => name != null) : []
      this.warnings.push(snapNextToSnapcraftWarning(keys))
      return
    }
    if (!ts.isObjectLiteralExpression(snap)) {
      this.warnings.push(
        "snap was left in place: it is not an object literal, so its options cannot be moved automatically. " +
          "Move them into snapcraft yourself (publish / artifactName on snapcraft itself, the others under snapcraft.<base>) and remove snap."
      )
      return
    }

    // snap's properties are re-emitted verbatim below, so rulePublish skipped it — flag what it would have rewritten.
    const snapPublish = this.getProp(snap, "publish")
    if (snapPublish != null && this.setsTagNamePrefixRewrite(snapPublish)) {
      this.warnings.push(
        "snap.publish sets vPrefixedTagName or an empty tagNamePrefix; after the move, apply the GitHub / GitLab tagNamePrefix change under snapcraft.publish manually."
      )
    }

    // A `snapcraft: null` / `undefined` is replaced in place: a second `snapcraft` property would be a TS error, and the last one wins in JS.
    const emit = (entries: string[]) => {
      this.removeProp(snapProp)
      if (snapcraftIsUnset) {
        this.replaceValue(snapcraftProp.initializer, this.objectLiteralTextAt(entries, this.propIndentFor(root)))
      } else {
        this.createChild(root, "snapcraft", entries)
      }
    }

    const baseProp = this.getProp(snap, "base")
    let base = this.stringLiteralValue(baseProp)
    const restProps = snap.properties.filter((p: any) => p !== baseProp)
    const snapcraftChildIndent = this.propIndentFor(root) + this.indentUnit

    // the snap's publish lands on snapcraft.publish, which migrateConfig then strips of the fields electron-builder writes into app-update.yml
    const movedPublish = snapPublish == null ? null : this.movedPublishEntry(snapPublish, snapcraftChildIndent)
    const movedEntryText = (p: any) => (p === snapPublish && movedPublish != null ? movedPublish.text : this.entryText(p, snapcraftChildIndent))

    if (base === "custom") {
      emit(['base: "custom"', ...restProps.map(movedEntryText)])
      this.changes.push({ key: "snap", description: "moved snap (base: custom) → snapcraft verbatim" })
      this.recordMovedPublish(movedPublish)
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

    // the snap's file name and upload target are read from snapcraft itself, never per base
    const hoistedProps = restProps.filter((p: any) => (SNAP_CORE_TARGET_OPTION_KEYS as readonly string[]).includes(this.propName(p) ?? ""))
    // a snap never read synopsis (migrateConfig removes it once it is under snapcraft.<base>)
    const synopsisProp = restProps.find((p: any) => this.propName(p) === "synopsis")
    let nestedProps = restProps.filter((p: any) => !hoistedProps.includes(p) && p !== synopsisProp)
    if (base === "core24") {
      const unsupported = (SNAP_CORE24_UNSUPPORTED as readonly string[]).filter(k => this.getProp(snap, k) != null)
      nestedProps = nestedProps.filter((p: any) => !unsupported.includes(this.propName(p)!))
      if (unsupported.length > 0) {
        this.warnings.push(
          `snap config set [${unsupported.join(", ")}], which the v27 snapcraft.core24 options do not support (core24 builds with the snapcraft CLI directly); they were dropped.`
        )
      }
    }

    const baseChildIndent = snapcraftChildIndent + this.indentUnit
    const nestedEntries = nestedProps.map((p: any) => this.entryText(p, baseChildIndent))
    const nestedObject = nestedEntries.length > 0 ? this.objectLiteralTextAt(nestedEntries, snapcraftChildIndent) : "{}"
    emit([`base: "${base}"`, ...hoistedProps.map(movedEntryText), `${base}: ${nestedObject}`])
    this.changes.push({ key: "snap", description: `moved snap → snapcraft.${base}${assumed ? " (base defaulted to core20)" : ""}` })
    if (synopsisProp != null) {
      this.changes.push({ key: `snapcraft.${base}.synopsis`, description: `removed snapcraft.${base}.synopsis (it never had an effect)` })
    }
    this.recordMovedPublish(movedPublish)
  }

  /**
   * The `publish: …` entry that ruleSnap / ruleSnapcraftCoreTargetOptions move to snapcraft (as entryText makes it), without the fields
   * electron-builder writes into app-update.yml, with the removals and warnings to record. Mirrors migratePublishEntries, which
   * migrateConfig runs on snapcraft.publish after the move; publisherName is kept with a warning, as rulePublish keeps it.
   */
  private movedPublishEntry(prop: any, targetIndent: string): { text: string; changes: MigrationChange[]; warnings: string[] } {
    const ts = this.ts
    const label = "snapcraft.publish"
    const changes: MigrationChange[] = []
    const warnings: string[] = []
    if (!ts.isPropertyAssignment(prop)) {
      return { text: this.entryText(prop, targetIndent), changes, warnings }
    }
    const value = this.unwrap(prop.initializer)
    const cuts: Array<[number, number]> = []
    for (const entry of ts.isArrayLiteralExpression(value) ? value.elements : [value]) {
      const obj = this.unwrap(entry)
      if (!ts.isObjectLiteralExpression(obj)) {
        continue
      }
      for (const field of Object.keys(PUBLISH_MANAGED_OPTIONS)) {
        const fieldProp = this.getProp(obj, field)
        if (fieldProp == null) {
          continue
        }
        if (field !== "publisherName") {
          cuts.push([fieldProp.pos, this.endWithTrailingComma(fieldProp)])
          if (!changes.some(it => it.key === `${label}[].${field}`)) {
            changes.push({ key: `${label}[].${field}`, description: `removed ${label}[].${field} (electron-builder writes it into app-update.yml itself)` })
          }
        }
        const warning = managedPublishOptionWarning(label, field)
        if (warning != null && !warnings.includes(warning)) {
          warnings.push(warning)
        }
      }
    }
    if (cuts.length === 0) {
      return { text: this.entryText(prop, targetIndent), changes, warnings }
    }
    // the initializer's text without the removed properties, cut the way removeProp cuts them
    const start = this.start(prop.initializer)
    let raw = ""
    let cursor = start
    for (const [from, to] of cuts.sort((a, b) => a[0] - b[0])) {
      raw += this.text.slice(cursor, from)
      cursor = to
    }
    raw += this.text.slice(cursor, prop.initializer.end)
    const valueText = raw.includes("\n") ? this.reindent(raw, this.lineIndentAt(start), targetIndent) : raw
    return { text: `${this.text.slice(this.start(prop.name), prop.name.end)}: ${valueText}`, changes, warnings }
  }

  private recordMovedPublish(moved: { changes: MigrationChange[]; warnings: string[] } | null): void {
    for (const change of moved?.changes ?? []) {
      if (!this.changes.some(it => it.key === change.key)) {
        this.changes.push(change)
      }
    }
    for (const warning of moved?.warnings ?? []) {
      if (!this.warnings.includes(warning)) {
        this.warnings.push(warning)
      }
    }
  }

  // Mirrors migrateConfig step 6c: a snapcraft.<core>.publish / artifactName was never read. It is moved to snapcraft itself when <core> is
  // the snapcraft.base literal and snapcraft does not set the key, and removed otherwise. A base the AST cannot read leaves them for the guard.
  private ruleSnapcraftCoreTargetOptions(root: any): void {
    const snapcraft = this.getObjectProp(root, "snapcraft")
    if (snapcraft == null) {
      return
    }
    const found = SNAP_CORE_KEYS.flatMap(core => {
      const options = this.getObjectProp(snapcraft, core)
      return options == null ? [] : SNAP_CORE_TARGET_OPTION_KEYS.map(key => ({ core, key, prop: this.getProp(options, key) })).filter(it => it.prop != null)
    })
    if (found.length === 0) {
      return
    }
    const ts = this.ts
    // propValue returns the spread or computed key that may set base, when one does
    const baseValue = this.propValue(snapcraft, "base")
    const base = baseValue !== undefined && ts.isStringLiteral(baseValue) ? baseValue.text : undefined
    if (baseValue !== undefined && base == null) {
      this.warnings.push(
        `snapcraft.base is not a string literal (or a spread / computed key may set it), so [${found.map(it => `snapcraft.${it.core}.${it.key}`).join(", ")}] were left in place: ` +
          "move the selected base's publish / artifactName to snapcraft itself and remove the others"
      )
      return
    }
    const entries: string[] = []
    let movedPublish: ReturnType<typeof this.movedPublishEntry> | null = null
    for (const { core, key, prop } of found) {
      const path = `snapcraft.${core}.${key}`
      this.removeProp(prop)
      // a literal `publish: undefined` on snapcraft is unset, as migrateConfig and publishEntries read it: the value replaces it in place
      const existing = this.getProp(snapcraft, key)
      const existingIsUndefined = existing != null && this.propValue(snapcraft, key) === undefined
      if (core === base && (existing == null || existingIsUndefined)) {
        let text: string
        if (key === "publish") {
          movedPublish = this.movedPublishEntry(prop, this.propIndentFor(snapcraft))
          text = movedPublish.text
        } else {
          text = this.entryText(prop, this.propIndentFor(snapcraft))
        }
        if (existingIsUndefined) {
          this.replaceRange(this.start(existing), existing.end, text)
        } else {
          entries.push(text)
        }
        this.changes.push({ key: path, description: `moved ${path} → snapcraft.${key}` })
        this.warnings.push(snapcraftCoreTargetOptionWarning(path, key, true))
        if (key === "publish" && this.setsTagNamePrefixRewrite(prop)) {
          this.warnings.push(
            `${path} sets vPrefixedTagName or an empty tagNamePrefix; after the move, apply the GitHub / GitLab tagNamePrefix change under snapcraft.publish manually.`
          )
        }
      } else {
        this.changes.push({ key: path, description: `removed ${path} (it was never read)` })
        this.warnings.push(snapcraftCoreTargetOptionWarning(path, key, false))
      }
    }
    this.insertIntoObject(snapcraft, entries)
    this.recordMovedPublish(movedPublish)
  }

  // Mirrors migrateConfig step 6d: Linux target options that never had an effect are removed. A v26 snap.synopsis is dropped by ruleSnap,
  // which re-emits the snap's other options as text.
  private ruleLinuxUnreadTargetOptions(root: any): void {
    for (const { parent, key } of LINUX_UNREAD_TARGET_OPTIONS) {
      let holder: any = root
      for (const segment of parent) {
        holder = holder == null ? null : this.getObjectProp(holder, segment)
      }
      const prop = holder == null ? null : this.getProp(holder, key)
      if (prop != null) {
        this.removeProp(prop)
        const path = [...parent, key].join(".")
        this.changes.push({ key: path, description: `removed ${path} (it never had an effect)` })
      }
    }
  }

  // Mirrors migrateConfig step 6e: the snapcraft.core24 build switches → buildEnvironment. A switch is read only as a true, false or null literal; the
  // identifier undefined counts as off (the guard rejects `useLXD: undefined` too). A value it cannot read, or a spread that may set a switch, leaves
  // them all for the guard. Each property gets at most one edit, so the edits never overlap; the selected switch is rewritten in place, keeping its comments.
  private ruleCore24BuildEnvironment(root: any): void {
    const ts = this.ts
    const snapcraft = this.getObjectProp(root, "snapcraft")
    const core24 = snapcraft == null ? null : this.getObjectProp(snapcraft, "core24")
    if (core24 == null) {
      return
    }
    const remoteBuildProp = this.getProp(core24, "remoteBuild")
    const remoteBuildValue = remoteBuildProp != null && ts.isPropertyAssignment(remoteBuildProp) ? this.unwrap(remoteBuildProp.initializer) : null
    const remoteBuild = this.objectLiteral(remoteBuildValue)
    const enabledProp = remoteBuild == null ? null : this.getProp(remoteBuild, "enabled")
    const isOffLiteral = (node: any) => node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(node) && node.text === "undefined")
    // the source text of a true, false, null or undefined literal (the last three are off: they had no effect), or null for a value the AST cannot
    // read (a string, an expression, a shorthand, a method)
    const read = (prop: any): string | null => {
      const value = ts.isPropertyAssignment(prop) ? this.unwrap(prop.initializer) : null
      return value != null && (value.kind === ts.SyntaxKind.TrueKeyword || isOffLiteral(value)) ? this.text.slice(this.start(value), value.end) : null
    }
    // in v26's order: a remote build won, then the host, LXD and Multipass
    const switches = [
      ...(enabledProp == null ? [] : [{ path: "remoteBuild.enabled", prop: enabledProp, environment: "remote" }]),
      ...Object.entries(CORE24_BUILD_ENVIRONMENT_FLAGS).flatMap(([key, environment]) => {
        const prop = this.getProp(core24, key)
        return prop == null ? [] : [{ path: key, prop, environment }]
      }),
    ].map(it => ({ ...it, value: read(it.prop) }))
    if (switches.length === 0) {
      return
    }

    // a remoteBuild the AST cannot read may hold an enabled: true that won over every other switch
    const remoteBuildReadable =
      remoteBuildProp == null || (remoteBuildValue != null && isOffLiteral(remoteBuildValue)) || (remoteBuild != null && !this.hasSpreadOrComputed(remoteBuild))
    const unread = switches.filter(it => it.value == null)
    if (unread.length > 0 || !remoteBuildReadable || this.hasSpreadOrComputed(core24)) {
      const paths = (unread.length > 0 ? unread : switches).map(it => it.path)
      if (!remoteBuildReadable && enabledProp == null) {
        paths.push("remoteBuild.enabled")
      }
      this.warnings.push(core24BuildSwitchesUnreadWarning(paths))
      return
    }
    const on = switches.filter(it => it.value === "true")
    if (on.length > 1) {
      this.warnings.push(core24BuildSwitchesConflictWarning(on.map(it => it.path)))
      return
    }

    const selected = on.length === 1 ? on[0] : null
    // an existing buildEnvironment is kept, whatever its value: it is the newer intent
    const existingProp = this.getProp(core24, "buildEnvironment")
    const written = selected != null && existingProp == null
    if (selected != null && existingProp != null) {
      const existing = this.stringLiteralValue(existingProp)
      if (existing !== selected.environment) {
        const existingNode = ts.isPropertyAssignment(existingProp) ? this.unwrap(existingProp.initializer) : existingProp
        const existingText = existing == null ? this.text.slice(this.start(existingNode), existingNode.end) : JSON.stringify(existing)
        this.warnings.push(core24BuildEnvironmentKeptWarning(existingText, selected.path, selected.environment))
      }
    }
    // an enabled that is remoteBuild's only property goes with its remoteBuild (as migrateConfig removes the emptied object), never next to it
    const remoteBuildGoes = remoteBuild != null && remoteBuild.properties.length === 1 && enabledProp != null
    for (const it of switches) {
      const target = it.prop === enabledProp && remoteBuildGoes ? remoteBuildProp : it.prop
      if (it !== selected || !written) {
        this.removeProp(target)
      } else if (target === enabledProp) {
        this.insertIntoObject(core24, ['buildEnvironment: "remote"'])
        this.removeProp(enabledProp)
      } else {
        this.replaceRange(this.start(target), target.end, `buildEnvironment: "${it.environment}"`)
      }
      this.changes.push(core24BuildSwitchChange(it.path, it.value ?? "", it.value !== "true" ? "off" : written ? it.environment : "kept"))
    }
  }

  /** Whether the source of a publish property sets what rulePublish rewrites: vPrefixedTagName (GitHub and GitLab), or an empty tagNamePrefix (GitHub). */
  private setsTagNamePrefixRewrite(publishProp: any): boolean {
    return /\bvPrefixedTagName\b|\btagNamePrefix\s*:\s*(""|'')/.test(this.text.slice(this.start(publishProp), publishProp.end))
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

  // Mirrors migrateConfig's migrateCustomNsis: customNsisBinary.debugLogging → <section>.installerDebugLogging (dropped for portable),
  // an emptied or null customNsisBinary / customNsisResources is removed, and a custom bundle is kept and reported, never converted
  // to toolsets.nsis (the bundle layout differs: it must carry the NSIS plugins).
  private ruleCustomNsis(root: any): void {
    const ts = this.ts
    const isNullLiteral = (prop: any) => ts.isPropertyAssignment(prop) && this.unwrap(prop.initializer).kind === ts.SyntaxKind.NullKeyword
    for (const section of NSIS_CONFIG_KEYS) {
      const options = this.getObjectProp(root, section)
      if (options == null) {
        continue
      }
      const binaryPath = `${section}.customNsisBinary`
      const binaryProp = this.getProp(options, "customNsisBinary")
      const binary = this.getObjectProp(options, "customNsisBinary")
      if (binaryProp != null && isNullLiteral(binaryProp)) {
        this.removeProp(binaryProp)
        this.changes.push({ key: binaryPath, description: `removed ${binaryPath}: null (the key was removed in v27)` })
      } else if (binary != null) {
        const found = this.getProp(binary, "debugLogging")
        // A method / accessor named debugLogging is not read; it stays and keeps the key.
        const debugProp = found != null && (ts.isPropertyAssignment(found) || ts.isShorthandPropertyAssignment(found)) ? found : null
        // A shorthand, spread, method or computed key may hold a custom bundle, so only `name: null` counts as unset.
        const keepsBundle = binary.properties.some((p: any) => p !== debugProp && !isNullLiteral(p))
        if (debugProp != null) {
          const valueText = ts.isShorthandPropertyAssignment(debugProp) ? debugProp.name.text : this.valueText(debugProp.initializer, this.propIndentFor(options))
          if (section === "portable") {
            if (!isNullLiteral(debugProp)) {
              this.warnings.push(PORTABLE_DEBUG_LOGGING_DROPPED)
            }
            this.changes.push({ key: `${binaryPath}.debugLogging`, description: `removed ${binaryPath}.debugLogging (no effect on portable targets)` })
          } else if (!isNullLiteral(debugProp) && this.getProp(options, "installerDebugLogging") == null) {
            this.insertIntoObject(options, [`installerDebugLogging: ${valueText}`])
            this.changes.push({ key: `${binaryPath}.debugLogging`, description: `moved ${binaryPath}.debugLogging → ${section}.installerDebugLogging` })
          } else {
            this.changes.push({ key: `${binaryPath}.debugLogging`, description: `removed ${binaryPath}.debugLogging` })
          }
          if (keepsBundle) {
            this.removeProp(debugProp)
          }
        }
        if (keepsBundle) {
          this.warnings.push(legacyKeyMessage(binaryPath))
        } else {
          this.removeProp(binaryProp)
          this.changes.push({ key: binaryPath, description: `removed ${binaryPath} (no custom bundle was set)` })
        }
      } else if (binaryProp != null) {
        this.warnings.push(legacyKeyMessage(binaryPath))
      }

      const resourcesPath = `${section}.customNsisResources`
      const resourcesProp = this.getProp(options, "customNsisResources")
      if (resourcesProp != null && isNullLiteral(resourcesProp)) {
        this.removeProp(resourcesProp)
        this.changes.push({ key: resourcesPath, description: `removed ${resourcesPath}: null (the key was removed in v27)` })
      } else if (resourcesProp != null) {
        this.warnings.push(legacyKeyMessage(resourcesPath))
      }
    }
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

  /**
   * Mirrors migrateConfig's migrateMacSigning: the v26 signing fields move into `sign`, and a custom signer the AST can read (a string or
   * template literal other than the opt-out "false" / "", a function, a method) into `sign.sign`, next to the options it receives. `cascade`
   * is what the earlier sections hand this one through the mac → mas → masDev merge, "unknown" after a value the AST cannot read.
   */
  private ruleMacSigning(platform: any, name: string, cascade: MacSignCascade | "unknown"): void {
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
    // a method or shorthand property, which has no initializer, stands for itself
    const existingSign = existingSignProp == null ? null : ts.isPropertyAssignment(existingSignProp) ? this.unwrap(existingSignProp.initializer) : existingSignProp
    const existingSignObj = this.objectLiteral(existingSign)
    for (const field of MAC_SIGN_UNREAD_FIELDS) {
      const prop = existingSignObj == null ? null : this.getProp(existingSignObj, field)
      if (prop != null) {
        this.removeProp(prop)
        this.changes.push({
          key: `${name}.sign.${field}`,
          description: `removed ${name}.sign.${field} (it never had an effect: electron-builder always passes ${field}: false to @electron/osx-sign)`,
        })
      }
    }

    // "false" and "" stay: the v27 schema reads them as the opt-out (false / null), not as a module path
    const optOut = existingSign != null && ts.isStringLiteralLike(existingSign) && isMacSignOptOutString(existingSign.text) ? existingSign.text : null
    const isSigner = existingSign != null && optOut == null && this.isMacSigner(existingSign)
    // a literal undefined is no sign: the merge and migrateConfig's JSON copy skip it, as propValue and macSignCascadeAfter do
    const signIsUndefined = existingSign != null && ts.isIdentifier(existingSign) && existingSign.text === "undefined"
    if (existingSign != null && !isSigner && !signIsUndefined && !this.isLiteral(existingSign)) {
      // an identifier, a call, a shorthand, a getter, …: a custom signer to move into sign.sign, or the signing options
      const later =
        name === "mac" ? "mas.sign.sign: null (or masDev.sign.sign: null) where a Mac App Store app" : name === "mas" ? "masDev.sign.sign: null if the mas-dev app" : null
      this.warnings.push(
        `${name}.sign is not a literal migrate-schema can read, so it was left as it is${present.length > 0 || hasSignIgnore ? ", with the v26 signing options next to it" : ""}. ` +
          `In electron-builder v27 a custom signer is ${name}.sign.sign, inside the sign object, where it receives the signing options next to it: if ${name}.sign is one, move it there` +
          (later == null ? "" : `. It then signs the later sections' apps too, as in v26: set ${later} must keep @electron/osx-sign`) +
          ". See https://www.electron.build/docs/migration/v27-config-changes#macos-signing-macsign"
      )
      return
    }
    const signIsNull = existingSign != null && existingSign.kind === ts.SyntaxKind.NullKeyword

    // the same rules as migrateConfig, on the cascade as written. Over a cascade the AST cannot read (only mas / masDev: mac starts it), a
    // sign: null is kept as sign.sign: null too, which signs like the bare null whether or not an earlier section sets a signer.
    const inherited = cascade === "unknown" ? null : cascade
    const keepsNoSigner = signIsNull && (cascade === "unknown" || cascade.signer != null)
    if (isSigner) {
      if (inherited?.options != null) {
        this.warnings.push(macSignerOverOptionsWarning(name, inherited.options))
      }
      this.changes.push({ key: `${name}.sign`, description: `moved the custom signer ${name}.sign → ${name}.sign.sign` })
    } else if (keepsNoSigner) {
      const kept = inherited == null ? "any signer an earlier section sets, which migrate-schema cannot read," : inherited.signer
      this.changes.push({
        key: `${name}.sign`,
        description: `replaced ${name}.sign: null with ${name}.sign.sign: null (in v26 it kept ${kept} from signing the ${name} app; a bare sign: null now means skip signing)`,
      })
    } else if (existingSignObj != null && this.propValue(existingSignObj, "sign") === undefined && inherited?.signer != null && inherited.signerWasBare) {
      this.warnings.push(macSignerOverMasOptionsWarning(name, inherited.signer))
    }

    if (!isSigner && !keepsNoSigner && present.length === 0 && !hasSignIgnore) {
      if (signIsNull) {
        this.removeProp(existingSignProp)
        this.changes.push({ key: `${name}.sign`, description: `removed ${name}.sign: null (v26 "no custom signer" = v27 default; sign: null now means skip signing)` })
      }
      return
    }
    if (optOut != null) {
      this.warnings.push(macSignOptOutNextToOptionsWarning(name, optOut))
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

    if (isSigner || keepsNoSigner || (signIsUndefined && sources.length > 0)) {
      // moveInto refuses a value that is not an object, so the sign object is written in place of it: it keeps its position, e.g. after
      // a spread that may set sign too
      const braceIndent = this.lineIndentAt(this.start(existingSignProp))
      const childIndent = braceIndent + this.indentUnit
      const entries = [
        ...(isSigner ? [this.entryText(existingSignProp, childIndent)] : keepsNoSigner ? ["sign: null"] : []),
        ...sources.map(s => this.entryText(s.prop, childIndent, s.renameTo)),
      ]
      for (const s of sources) {
        this.removeProp(s.prop)
      }
      const key = this.text.slice(this.start(existingSignProp.name), existingSignProp.name.end)
      this.replaceRange(this.start(existingSignProp), existingSignProp.end, `${key}: ${this.objectLiteralTextAt(entries, braceIndent)}`)
      return
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

  /** A custom signer the AST can read: a module path (a string or template literal) or a function (an arrow, a function expression, a method). */
  private isMacSigner(node: any): boolean {
    const ts = this.ts
    return ts.isStringLiteralLike(node) || ts.isTemplateExpression(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)
  }

  /**
   * The signer cascade after section `name`, read from the source as written (migrateConfig folds the migrated value instead). It turns
   * "unknown" after a value the AST cannot read, until a section sets the signer again.
   */
  private macSignCascadeAfter(root: any, name: string, cascade: MacSignCascade | "unknown"): MacSignCascade | "unknown" {
    const ts = this.ts
    const sectionProp = this.getProp(root, name)
    if (sectionProp == null) {
      return cascade
    }
    const section = this.getObjectProp(root, name)
    if (section == null) {
      // the merge skips a null or undefined section, as migrateConfig's step 13 does
      const value = ts.isPropertyAssignment(sectionProp) ? this.unwrap(sectionProp.initializer) : null
      return value != null && (value.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(value) && value.text === "undefined")) ? cascade : "unknown"
    }
    // a spread after sign, or anywhere when sign is absent, is what propValue returns for it, which reads as unknown below
    const value = this.propValue(section, "sign")
    if (value === undefined) {
      return cascade
    }
    // false, and the "false" / "" that stay, replace the earlier sections' sign
    if (value.kind === ts.SyntaxKind.FalseKeyword || (ts.isStringLiteralLike(value) && isMacSignOptOutString(value.text))) {
      return { signer: null, signerWasBare: false, options: null }
    }
    if (this.isMacSigner(value)) {
      return { signer: `${name}.sign.sign`, signerWasBare: true, options: cascade === "unknown" ? null : cascade.options }
    }
    if (value.kind === ts.SyntaxKind.NullKeyword) {
      // over an inherited signer it becomes sign.sign: null, otherwise it is dropped; over an unknown cascade (sign.sign: null too) the
      // options stay unknown
      return cascade !== "unknown" && cascade.signer != null ? { ...cascade, signer: null, signerWasBare: false } : cascade
    }
    const signObject = this.objectLiteral(value)
    if (signObject == null) {
      // the schema rejects another literal (true, a number, a list)
      return this.isLiteral(value) ? cascade : "unknown"
    }
    if (this.hasSpreadOrComputed(signObject)) {
      return "unknown"
    }
    const options = signObject.properties.some((p: any) => this.propName(p) !== "sign") ? `${name}.sign` : cascade === "unknown" ? null : cascade.options
    const hook = this.propValue(signObject, "sign")
    if (hook === undefined) {
      return cascade === "unknown" ? cascade : { ...cascade, options }
    }
    if (this.isMacSigner(hook)) {
      return { signer: `${name}.sign.sign`, signerWasBare: false, options }
    }
    return this.isLiteral(hook) ? { signer: null, signerWasBare: false, options } : "unknown"
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

  /**
   * Mirrors migrateConfig's `migrateFileOptions`: flat `files` / `extraResources` / `extraFiles` → `fileOptions`. `extraEntries` (from
   * ruleIncludePdb, which returns none for a `fileOptions` that is not an object literal) go into the same `fileOptions`.
   */
  private ruleFileOptions(holder: any, prefix: string, extraEntries: string[] = []): void {
    const present = FILE_OPTION_KEYS.filter(key => this.getProp(holder, key) != null)
    if (present.length === 0 && extraEntries.length === 0) {
      return
    }
    const fileOptionsProp = this.getProp(holder, "fileOptions")
    const existing = this.getObjectProp(holder, "fileOptions")
    const isNull = fileOptionsProp != null && existing == null && this.propValue(holder, "fileOptions")?.kind === this.ts.SyntaxKind.NullKeyword
    if (fileOptionsProp != null && existing == null && !isNull) {
      this.warnings.push(`${prefix}fileOptions is not an object literal; move ${present.map(key => prefix + key).join(", ")} into it manually.`)
      return
    }

    const sources: { prop: any }[] = []
    for (const key of present) {
      const prop = this.getProp(holder, key)
      const conflict = existing != null && this.getProp(existing, key) != null
      if (conflict) {
        this.removeProp(prop)
        this.warnings.push(fileOptionsConflictWarning(prefix, key))
      } else {
        sources.push({ prop })
      }
      this.changes.push(fileOptionsChange(prefix, key, conflict))
    }
    if (sources.length > 0 || extraEntries.length > 0) {
      if (isNull) {
        // replaced by the object moveInto creates
        this.removeProp(fileOptionsProp)
      }
      this.moveInto(holder, "fileOptions", sources, extraEntries, /* treatNullAsAbsent */ true)
    }
  }

  /**
   * Mirrors migrateConfig's `migrateIncludePdb`: `includePdb: true` → `fileOptions.excludedExts: ["default", "!pdb"]` ("!pdb" is added to an
   * existing root list instead, and to each platform-level list, which replaces the root one); `false` → `fileOptions.excludedExts: ["default"]`
   * (unless a root list is set), so that it keeps overriding an `includePdb: true` of another config layer; `undefined` is removed. Literals are read as v26 coerced them. A
   * value the AST cannot read, or one v26 rejected, is left in place with a warning. A string-literal `excludedExts` is a one-entry list, which
   * becomes an array literal when "!pdb" is added to it. Returns the `excludedExts` entry for ruleFileOptions to add to the root `fileOptions`.
   */
  private ruleIncludePdb(root: any): string[] {
    const ts = this.ts
    const prop = this.getProp(root, "includePdb")
    if (prop == null) {
      return []
    }
    const value = ts.isPropertyAssignment(prop) ? this.unwrap(prop.initializer) : null
    if (value == null || !(this.isLiteral(value) || (ts.isIdentifier(value) && value.text === "undefined"))) {
      this.warnings.push(
        "includePdb is not a literal true or false, so it was left in place. In v27, .pdb files are excluded by default: remove includePdb, " +
          'and where it is true set fileOptions.excludedExts: ["default", "!pdb"] instead (e.g. excludedExts: <condition> ? ["default", "!pdb"] : ["default"]).'
      )
      return []
    }
    const includePdb = v26Boolean(this.scalarLiteral(value))
    if (includePdb == null && !ts.isIdentifier(value)) {
      this.warnings.push(INCLUDE_PDB_NOT_BOOLEAN)
      return []
    }
    // `undefined` never overrode another layer's value in v26
    if (includePdb == null) {
      this.removeProp(prop)
      this.changes.push({ key: "includePdb", description: INCLUDE_PDB_CHANGES.removed })
      return []
    }

    const fileOptionsProp = this.getProp(root, "fileOptions")
    const fileOptions = this.getObjectProp(root, "fileOptions")
    if (fileOptionsProp != null && fileOptions == null && this.propValue(root, "fileOptions")?.kind !== ts.SyntaxKind.NullKeyword) {
      this.warnings.push(`fileOptions is not an object literal; ${includePdbManualStep(includePdb)}`)
      // a platform list replaces the root one, so it gets "!pdb" whatever the root list is
      if (includePdb) {
        this.appendPdbToPlatformLists(root)
      }
      return []
    }
    const listProp = fileOptions == null ? null : this.getProp(fileOptions, "excludedExts")
    const list = this.propValue(fileOptions, "excludedExts")
    if (list !== undefined && list.kind !== ts.SyntaxKind.NullKeyword && !this.isExcludedExtsLiteral(list)) {
      this.warnings.push(
        includePdb
          ? 'fileOptions.excludedExts is not a string or array literal (or a spread may set it); add "!pdb" to it and remove includePdb: true manually.'
          : 'fileOptions.excludedExts is not a string or array literal (or a spread may set it); remove includePdb: false manually, and set excludedExts: ["default"] where it is unset (written out, it keeps overriding an includePdb: true from another config layer).'
      )
      if (includePdb) {
        this.appendPdbToPlatformLists(root)
      }
      return []
    }

    // "!pdb" appended to a list whose elements cannot be read could leave only removals (e.g. an empty spread), which the build rejects
    if (includePdb && list !== undefined && list.kind !== ts.SyntaxKind.NullKeyword && this.listExcludesPdb(list) == null) {
      this.warnings.push(
        'fileOptions.excludedExts has elements that cannot be read (a spread, an identifier, …); if it excludes .pdb files, add "!pdb" to it, and remove includePdb: true manually.'
      )
      this.appendPdbToPlatformLists(root)
      return []
    }

    this.removeProp(prop)
    const replacement = includePdb ? '["default", "!pdb"]' : '["default"]'
    const created = includePdb ? INCLUDE_PDB_CHANGES.created : INCLUDE_PDB_CHANGES.overridesParent
    let entries: string[] = []
    if (list === undefined && listProp == null) {
      entries = [`excludedExts: ${replacement}`]
      this.changes.push({ key: "includePdb", description: created })
    } else if (list === undefined || list.kind === ts.SyntaxKind.NullKeyword) {
      // `excludedExts: null` / `undefined`
      this.replaceValue(listProp.initializer, replacement)
      this.changes.push({ key: "includePdb", description: created })
    } else if (!includePdb) {
      // the root list already replaces the parent's
      this.changes.push({ key: "includePdb", description: this.listExcludesPdb(list) === false ? INCLUDE_PDB_CHANGES.listKeepsPdb : INCLUDE_PDB_CHANGES.removed })
    } else if (this.listExcludesPdb(list)) {
      this.appendPdbRemoval(list)
      this.changes.push({ key: "includePdb", description: INCLUDE_PDB_CHANGES.appended })
    } else {
      this.changes.push({ key: "includePdb", description: INCLUDE_PDB_CHANGES.unneeded })
    }
    if (!includePdb) {
      return entries
    }

    this.appendPdbToPlatformLists(root)
    return entries
  }

  /** For `includePdb: true`: adds "!pdb" to each platform-level `fileOptions.excludedExts` that excludes `.pdb` files, since it replaces the root list. */
  private appendPdbToPlatformLists(root: any): void {
    const ts = this.ts
    for (const platform of ALL_PLATFORM_KEYS) {
      const platformValue = this.propValue(root, platform)
      if (platformValue !== undefined && platformValue.kind !== ts.SyntaxKind.NullKeyword && !ts.isObjectLiteralExpression(platformValue)) {
        this.warnings.push(`${platform} cannot be read; if its fileOptions.excludedExts excludes .pdb files, add "!pdb" to it manually (includePdb: true).`)
        continue
      }
      const platformFileOptions = this.propValue(this.objectLiteral(platformValue), "fileOptions")
      // A fileOptions the AST cannot read may set excludedExts.
      const platformList =
        platformFileOptions === undefined || this.isLiteral(platformFileOptions) ? this.propValue(this.objectLiteral(platformFileOptions), "excludedExts") : platformFileOptions
      if (platformList === undefined || platformList.kind === ts.SyntaxKind.NullKeyword) {
        continue
      }
      const excludesPdb = this.isExcludedExtsLiteral(platformList) ? this.listExcludesPdb(platformList) : null
      if (excludesPdb == null) {
        this.warnings.push(`${platform}.fileOptions.excludedExts cannot be read; if it excludes .pdb files, add "!pdb" to it manually (includePdb: true).`)
      } else if (excludesPdb) {
        this.appendPdbRemoval(platformList)
        this.changes.push(platformExcludedExtsPdbChange(platform))
      }
    }
  }

  /** True for an `excludedExts` value ruleIncludePdb can read and edit: an array literal, or a string literal (a one-entry list). */
  private isExcludedExtsLiteral(list: any): boolean {
    return this.ts.isArrayLiteralExpression(list) || this.ts.isStringLiteralLike(list)
  }

  /** `excludesPdb` for an array or string literal, or null when an array element cannot be read (an identifier, a spread, …). */
  private listExcludesPdb(list: any): boolean | null {
    const ts = this.ts
    if (ts.isStringLiteralLike(list)) {
      return excludesPdb([list.text])
    }
    const elements = list.elements.map((el: any) => this.unwrap(el))
    // a non-string literal is skipped, as migrateConfig does; a spread, an identifier or a call could hold anything
    if (elements.some((el: any) => !this.isLiteral(el))) {
      return null
    }
    return excludesPdb(elements.filter((el: any) => ts.isStringLiteralLike(el)).map((el: any) => el.text))
  }

  /** Adds "!pdb" to an array literal, or turns a string literal into an array literal of it (its text kept) and "!pdb". */
  private appendPdbRemoval(list: any): void {
    if (this.ts.isStringLiteralLike(list)) {
      this.replaceValue(list, `[${this.text.slice(this.start(list), list.end)}, "!pdb"]`)
    } else {
      this.appendToArray(list, '"!pdb"')
    }
  }

  /** Appends `elementText` to a non-empty array literal, on a line of its own when the closing bracket is on one. */
  private appendToArray(list: any, elementText: string): void {
    const last = list.elements[list.elements.length - 1]
    const closePos = list.end - 1
    const lineStart = this.text.lastIndexOf("\n", closePos - 1) + 1
    if (lineStart <= last.end || this.text.slice(lineStart, closePos).trim() !== "") {
      this.insertEdit(last.end, `, ${elementText}`)
      return
    }
    // Before the line of the closing bracket, so a comment after the last element stays on its line.
    const trailingComma = list.elements.hasTrailingComma === true
    if (!trailingComma) {
      this.insertEdit(last.end, ",")
    }
    this.insertEdit(lineStart, `${this.lineIndentAt(this.start(last))}${elementText}${trailingComma ? "," : ""}\n`)
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

  // Mirrors migrateConfig step 14b: renamed in place at the root and on mac / win / linux, the value untouched (null keeps signing required).
  // mas / masDev are left to ruleMasAndHelperIds, which removes it there.
  private ruleUpdateManifestSigning(root: any): void {
    const holders = [{ holder: root, prefix: "" }, ...UPDATE_MANIFEST_PLATFORM_KEYS.map(platform => ({ holder: this.getObjectProp(root, platform), prefix: `${platform}.` }))]
    for (const { holder, prefix } of holders) {
      const prop = holder == null ? null : this.getProp(holder, "updateManifest")
      if (prop == null) {
        continue
      }
      if (this.getProp(holder, "updateManifestSigning") != null) {
        this.warnings.push(updateManifestBothSetWarning(prefix))
        continue
      }
      this.renameKey(prop, "updateManifestSigning")
      this.changes.push({ key: `${prefix}updateManifest`, description: `renamed ${prefix}updateManifest → ${prefix}updateManifestSigning (the value is unchanged)` })
    }
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
    // a child another rule already created here (e.g. `mac` from the root cscLink and from helper-bundle-id) gets the entries, so the
    // key is never written twice (TS1117 in a .ts config, and in JS the later one silently wins)
    const created = rawValue == null ? this.createdChildren.get(parent)?.get(childKey) : undefined
    if (created != null) {
      created.entries.push(...entries)
      created.edit.text = `\n${parentPropIndent}${childKey}: ${this.objectLiteralTextAt(created.entries, parentPropIndent)},`
      return
    }
    const value = rawValue != null ? rawValue : this.objectLiteralTextAt(entries, parentPropIndent)
    const braceEnd = this.start(parent) + 1
    const edit: Edit = { start: braceEnd, end: braceEnd, text: `\n${parentPropIndent}${childKey}: ${value},` }
    this.edits.push(edit)
    if (rawValue == null) {
      const children = this.createdChildren.get(parent) ?? new Map<string, { edit: Edit; entries: string[] }>()
      children.set(childKey, { edit, entries: [...entries] })
      this.createdChildren.set(parent, children)
    }
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

  /** Renames a property in place; a shorthand `{ name }` keeps its variable as the value (`newName: name`), never a dangling `{ newName }`. */
  private renameKey(prop: any, newName: string): void {
    if (this.ts.isShorthandPropertyAssignment(prop)) {
      this.replaceRange(this.start(prop), prop.end, `${newName}: ${prop.name.text}`)
      return
    }
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
      // renamed, a shorthand keeps its variable as the value: `{ signIgnore }` → `ignore: signIgnore`
      return renameTo != null && renameTo !== prop.name.text ? `${renameTo}: ${prop.name.text}` : keyText
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

  /**
   * Value of property `name` for the advisory rules: undefined when `objLit` is null or lacks the property (or sets it to `undefined`,
   * which JSON drops), else the unwrapped initializer of a `name: value` property, or a node the AST cannot read: the property itself
   * for a shorthand / method, or a spread / computed key that may set the property (one after it, or anywhere when it is absent).
   */
  private propValue(objLit: any, name: string): any {
    const ts = this.ts
    if (objLit == null) {
      return undefined
    }
    const prop = this.getProp(objLit, name)
    const unread = objLit.properties
      .slice(prop == null ? 0 : objLit.properties.indexOf(prop) + 1)
      .find((p: any) => ts.isSpreadAssignment(p) || (p.name != null && ts.isComputedPropertyName(p.name)))
    if (unread != null || prop == null) {
      return unread
    }
    const value = ts.isPropertyAssignment(prop) ? this.unwrap(prop.initializer) : prop
    return ts.isIdentifier(value) && value.text === "undefined" ? undefined : value
  }

  /** The value of a string, number, boolean or null literal; undefined for any other node. */
  private scalarLiteral(node: any): unknown {
    const ts = this.ts
    if (ts.isStringLiteralLike(node)) {
      return node.text
    }
    if (ts.isNumericLiteral(node)) {
      return Number(node.text)
    }
    if (node.kind === ts.SyntaxKind.TrueKeyword) {
      return true
    }
    if (node.kind === ts.SyntaxKind.FalseKeyword) {
      return false
    }
    return node.kind === ts.SyntaxKind.NullKeyword ? null : undefined
  }

  /**
   * The JSON value of a literal: a string, number, boolean or null, or an object / array literal of them, without its `undefined` properties
   * (as in migrateConfig's JSON copy). UNREAD for anything else, such as an identifier, a call, a spread, a shorthand or method property, a
   * computed key or a template with substitutions.
   */
  private jsonLiteral(node: any): unknown {
    const ts = this.ts
    const value = this.unwrap(node)
    if (ts.isArrayLiteralExpression(value)) {
      const items = value.elements.map((element: any) => this.jsonLiteral(element))
      return items.includes(UNREAD) ? UNREAD : items
    }
    if (ts.isObjectLiteralExpression(value)) {
      const result: Record<string, unknown> = {}
      for (const prop of value.properties) {
        const name = ts.isPropertyAssignment(prop) ? this.propName(prop) : undefined
        if (name === undefined) {
          return UNREAD
        }
        const initializer = this.unwrap(prop.initializer)
        if (ts.isIdentifier(initializer) && initializer.text === "undefined") {
          continue
        }
        const item = this.jsonLiteral(initializer)
        if (item === UNREAD) {
          return UNREAD
        }
        result[name] = item
      }
      return result
    }
    const scalar = this.scalarLiteral(value)
    return scalar === undefined ? UNREAD : scalar
  }

  /** `node` when it is an object literal, else null. */
  private objectLiteral(node: any): any | null {
    return node != null && this.ts.isObjectLiteralExpression(node) ? node : null
  }

  /** True for a value the AST reads like JSON: a string, number, boolean, null, or an object / array literal. */
  private isLiteral(node: any): boolean {
    const ts = this.ts
    return (
      ts.isStringLiteralLike(node) ||
      ts.isNumericLiteral(node) ||
      ts.isObjectLiteralExpression(node) ||
      ts.isArrayLiteralExpression(node) ||
      [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)
    )
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

  /** The end of `prop` with its trailing comma, which may follow whitespace, line breaks or comments (comma-first style included). */
  private endWithTrailingComma(prop: any): number {
    const ts = this.ts
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, this.text, undefined, prop.end)
    return scanner.scan() === ts.SyntaxKind.CommaToken ? scanner.getTokenEnd() : prop.end
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
