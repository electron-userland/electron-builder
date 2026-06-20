/**
 * Regression tests for Appx/MSIX manifest XML escaping.
 *
 * These are pure, cross-platform unit tests (no makeappx / no platform gating): they render the
 * real manifest templates with hostile inputs and assert the result is well-formed XML. This guards
 * the latent bug where raw config text (description, displayName, …) was interpolated unescaped into
 * attribute positions — note that appInfo's `smarten()` only fixes quotes, NOT `&`/`<`/`>`.
 */
import { readFileSync } from "fs"
import * as path from "path"
import { XMLValidator } from "fast-xml-parser"
import { buildWindowsServicesXml, RAW_TEXT_MANIFEST_MACROS, substituteManifestMacros } from "app-builder-lib/src/targets/winAppUtil"

const TEMPLATES_DIR = path.join(__dirname, "../../../packages/app-builder-lib/templates")
const MSIX_TEMPLATE = path.join(TEMPLATES_DIR, "msix", "appxmanifest.xml")
const APPX_TEMPLATE = path.join(TEMPLATES_DIR, "appx", "appxmanifest.xml")

// Hostile / edge-case values for every macro the templates reference. Raw-text macros carry
// `& < > "` (and the smart quote left untouched by escaping); fragment macros are valid XML;
// validated/constant macros use plain values (they are intentionally NOT escaped).
const HOSTILE_DESCRIPTION = 'A & B <c> "q" “smart”'
const MACRO_VALUES: Record<string, string> = {
  // raw text (must be escaped by substituteManifestMacros)
  publisher: "CN=A & B",
  publisherDisplayName: "Pub & <Co>",
  executable: "app\\A & B.exe",
  displayName: 'A & B <c> "q"',
  description: HOSTILE_DESCRIPTION,
  backgroundColor: "#464646",
  minVersion: "10.0.17763.0",
  maxVersionTested: "10.0.17763.0",
  // validated / constant (NOT escaped — must contain no special chars)
  identityName: "MyApp",
  applicationId: "MyApp",
  arch: "x64",
  version: "1.0.0.0",
  logo: "assets\\StoreLogo.png",
  square150x150Logo: "assets\\Square150x150Logo.png",
  square44x44Logo: "assets\\Square44x44Logo.png",
  // prebuilt XML fragments (must NOT be escaped)
  capabilities: '<Capabilities>\n  <rescap:Capability Name="runFullTrust"/>\n</Capabilities>',
  extensions: "",
  resourceLanguages: '<Resource Language="en-US" />',
  lockScreen: "",
  defaultTile: '<uap:DefaultTile Wide310x150Logo="assets\\Wide310x150Logo.png" />',
  splashScreen: "",
  packageIntegrity: '<uap10:PackageIntegrity><uap10:Content Enforcement="on" /></uap10:PackageIntegrity>',
}

function renderTemplate(templatePath: string): string {
  const template = readFileSync(templatePath, "utf8")
  return substituteManifestMacros(template, macro => {
    if (!(macro in MACRO_VALUES)) {
      throw new Error(`Test does not provide a value for manifest macro '${macro}' — add it to MACRO_VALUES`)
    }
    return MACRO_VALUES[macro]
  })
}

// ─── substituteManifestMacros (helper logic) ──────────────────────────────────

test("substituteManifestMacros: escapes raw-text macros, emits XML fragments verbatim", ({ expect }) => {
  const out = substituteManifestMacros('<a d="${description}">${capabilities}</a>', macro => {
    switch (macro) {
      case "description":
        return 'A & B <c> "q"'
      case "capabilities":
        return '<Capabilities><Capability Name="x"/></Capabilities>'
      default:
        throw new Error(`unexpected macro ${macro}`)
    }
  })
  expect(out).toBe('<a d="A &amp; B &lt;c&gt; &quot;q&quot;"><Capabilities><Capability Name="x"/></Capabilities></a>')
})

test("substituteManifestMacros: propagates resolver errors for unknown macros", ({ expect }) => {
  expect(() =>
    substituteManifestMacros("${nope}", () => {
      throw new Error("Macro nope is not defined")
    })
  ).toThrow("Macro nope is not defined")
})

test("RAW_TEXT_MANIFEST_MACROS: raw-text macros escaped, fragment/constant macros not", ({ expect }) => {
  for (const m of ["publisher", "publisherDisplayName", "executable", "displayName", "description", "backgroundColor", "minVersion", "maxVersionTested"]) {
    expect(RAW_TEXT_MANIFEST_MACROS.has(m)).toBe(true)
  }
  for (const m of [
    "capabilities",
    "extensions",
    "lockScreen",
    "defaultTile",
    "splashScreen",
    "resourceLanguages",
    "packageIntegrity",
    "version",
    "applicationId",
    "identityName",
    "arch",
    "logo",
  ]) {
    expect(RAW_TEXT_MANIFEST_MACROS.has(m)).toBe(false)
  }
})

// ─── full-template well-formedness with hostile inputs ────────────────────────

test("MSIX template renders well-formed XML with hostile description/displayName", ({ expect }) => {
  const xml = renderTemplate(MSIX_TEMPLATE)
  expect(XMLValidator.validate(xml)).toBe(true)
  // description (with & and <, which smarten() does NOT fix) is escaped in both positions
  expect(xml).toContain("<Description>A &amp; B &lt;c&gt; &quot;q&quot; “smart”</Description>")
  expect(xml).toContain('Description="A &amp; B &lt;c&gt; &quot;q&quot; “smart”"')
  // no raw unescaped ampersand/angle bracket from the hostile inputs leaked through
  expect(xml).not.toContain("A & B <c>")
})

test("AppX template renders well-formed XML with hostile description/displayName", ({ expect }) => {
  const xml = renderTemplate(APPX_TEMPLATE)
  expect(XMLValidator.validate(xml)).toBe(true)
  expect(xml).toContain('Description="A &amp; B &lt;c&gt; &quot;q&quot; “smart”"')
  expect(xml).not.toContain("A & B <c>")
})

// ─── render with macro overrides (reuses MACRO_VALUES) ────────────────────────

function renderMsixWith(overrides: Record<string, string>): string {
  const template = readFileSync(MSIX_TEMPLATE, "utf8")
  const values = { ...MACRO_VALUES, ...overrides }
  return substituteManifestMacros(template, macro => {
    if (!(macro in values)) {
      throw new Error(`Test does not provide a value for manifest macro '${macro}'`)
    }
    return values[macro]
  })
}

// ─── packageIntegrity placement ───────────────────────────────────────────────

test("packageIntegrity: when enabled, the uap10:PackageIntegrity element renders inside <Properties>", ({ expect }) => {
  const integrity = '<uap10:PackageIntegrity><uap10:Content Enforcement="on" /></uap10:PackageIntegrity>'
  const xml = renderMsixWith({ packageIntegrity: integrity })
  expect(XMLValidator.validate(xml)).toBe(true)
  const idx = xml.indexOf("<uap10:PackageIntegrity")
  expect(idx).toBeGreaterThan(xml.indexOf("<Properties>"))
  expect(idx).toBeLessThan(xml.indexOf("</Properties>"))
  expect(xml).toContain('<uap10:Content Enforcement="on" />')
})

test("packageIntegrity: when disabled (empty), the manifest is still well-formed and contains no PackageIntegrity", ({ expect }) => {
  const xml = renderMsixWith({ packageIntegrity: "" })
  expect(XMLValidator.validate(xml)).toBe(true)
  expect(xml).not.toContain("PackageIntegrity")
})

// ─── full template with desktop6 services + uap10 integrity populated ─────────

test("MSIX template renders well-formed XML with windows services + package integrity both enabled", ({ expect }) => {
  const services = buildWindowsServicesXml([{ name: "Bg", startupType: "auto", startAccount: "localSystem" }], "app\\App.exe")
  const xml = renderMsixWith({
    extensions: `<Extensions>${services}</Extensions>`,
    packageIntegrity: '<uap10:PackageIntegrity><uap10:Content Enforcement="on" /></uap10:PackageIntegrity>',
  })
  expect(XMLValidator.validate(xml)).toBe(true)
  expect(xml).toContain('<desktop6:Service Name="Bg"')
  expect(xml).toContain('StartAccount="localSystem"')
  expect(xml).toContain("<uap10:PackageIntegrity>")
})

// ─── substituteManifestMacros boundary handling ───────────────────────────────

test("substituteManifestMacros: leaves literal $ text and non-${alnum} sequences untouched", ({ expect }) => {
  const out = substituteManifestMacros("price is $5 and ${displayName}", macro => {
    if (macro === "displayName") {
      return "X"
    }
    throw new Error(`unexpected macro ${macro}`)
  })
  expect(out).toBe("price is $5 and X")
})

test("substituteManifestMacros: ${} and ${with-dash} are not treated as macros (regex only matches ${alnum})", ({ expect }) => {
  const out = substituteManifestMacros("a ${} b ${with-dash} c", () => {
    throw new Error("resolver must not be called")
  })
  expect(out).toBe("a ${} b ${with-dash} c")
})

test("substituteManifestMacros: only RAW_TEXT macros are escaped; validated/constant macros pass through raw", ({ expect }) => {
  // displayName is in RAW_TEXT_MANIFEST_MACROS → escaped
  expect(substituteManifestMacros("${displayName}", () => "A&B")).toBe("A&amp;B")
  // applicationId is NOT in RAW_TEXT_MANIFEST_MACROS → emitted verbatim
  expect(RAW_TEXT_MANIFEST_MACROS.has("applicationId")).toBe(false)
  expect(substituteManifestMacros("${applicationId}", () => "A&B")).toBe("A&B")
})

// ─── VisualElements child ordering (schema sequence) ──────────────────────────

test("MSIX VisualElements children follow the schema sequence: DefaultTile, then LockScreen, then SplashScreen", ({ expect }) => {
  // uap:VisualElements declares its children as an ordered xs:sequence (DefaultTile?, LockScreen?,
  // SplashScreen?). Render all three non-empty (as when a BadgeLogo asset is present) and assert order.
  // https://learn.microsoft.com/uwp/schemas/appxpackage/uapmanifestschema/element-uap-visualelements
  const xml = renderMsixWith({
    defaultTile: '<uap:DefaultTile Wide310x150Logo="assets\\Wide310x150Logo.png" />',
    lockScreen: '<uap:LockScreen Notification="badgeAndTileText" BadgeLogo="assets\\BadgeLogo.png" />',
    splashScreen: '<uap:SplashScreen Image="assets\\SplashScreen.png" />',
  })
  expect(XMLValidator.validate(xml)).toBe(true)
  const di = xml.indexOf("<uap:DefaultTile")
  const li = xml.indexOf("<uap:LockScreen")
  const si = xml.indexOf("<uap:SplashScreen")
  expect(di).toBeGreaterThan(-1)
  expect(di).toBeLessThan(li)
  expect(li).toBeLessThan(si)
})
