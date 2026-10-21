import type { Configuration } from "app-builder-lib"
import { assertMsixUpdaterElectronVersion } from "app-builder-lib/src/targets/win/MsixTarget"
import {
  assertSafeMappingPath,
  buildCapabilitiesXml,
  buildExtensionsXml,
  buildWindowsServicesXml,
  computePackageFamilyName,
  computeUserAssets,
  defaultTileTag,
  escapeXmlAttr,
  getPackageIdentity,
  isDefaultAssetIncluded,
  isMappedTo,
  isPackageTypeMapping,
  isScaledAssetsProvided,
  lockScreenTag,
  PACKAGE_TYPE_MAPPING_DESTINATION,
  resolvePackageApplicationId,
  resolvePackageIdentityName,
  resourceLanguageTag,
  splashScreenTag,
  substituteManifestMacros,
  validateApplicationId,
  validateIdentityName,
} from "app-builder-lib/src/targets/win/winAppUtil"
import { InvalidConfigurationError, log } from "builder-util"
import { mkdtemp, readFile, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import * as path from "path"
import { vi } from "vitest"

// Minimal VmManager stub: identity path mapping with a posix separator (enough for computeUserAssets)
const fakeVm: any = { toVmFile: (f: string) => f, pathSep: "/" }

// ─── escapeXmlAttr ────────────────────────────────────────────────────────────

test("escapeXmlAttr: passes through plain strings unchanged", ({ expect }) => {
  expect(escapeXmlAttr("hello world")).toBe("hello world")
})

test("escapeXmlAttr: escapes double quotes", ({ expect }) => {
  expect(escapeXmlAttr('say "hi"')).toBe("say &quot;hi&quot;")
})

test("escapeXmlAttr: escapes ampersands", ({ expect }) => {
  expect(escapeXmlAttr("A&B")).toBe("A&amp;B")
})

test("escapeXmlAttr: escapes angle brackets", ({ expect }) => {
  expect(escapeXmlAttr("<script>")).toBe("&lt;script&gt;")
})

test("escapeXmlAttr: escapes apostrophes", ({ expect }) => {
  expect(escapeXmlAttr("O'Brien")).toBe("O&apos;Brien")
})

test("escapeXmlAttr: escapes combined special characters", ({ expect }) => {
  expect(escapeXmlAttr('<a href="x">test & demo</a>')).toBe("&lt;a href=&quot;x&quot;&gt;test &amp; demo&lt;/a&gt;")
})

// ─── validateApplicationId ────────────────────────────────────────────────────

test("validateApplicationId: accepts valid id", ({ expect }) => {
  expect(() => validateApplicationId("MyApp", "Test")).not.toThrow()
  expect(() => validateApplicationId("My.App.Id", "Test")).not.toThrow()
  expect(() => validateApplicationId("A", "Test")).not.toThrow()
  expect(() => validateApplicationId("A".repeat(64), "Test")).not.toThrow()
})

test("validateApplicationId: rejects id that is too short (empty)", ({ expect }) => {
  expect(() => validateApplicationId("", "Test")).toThrow("must be between 1 and 64")
})

test("validateApplicationId: rejects id that is too long (>64)", ({ expect }) => {
  expect(() => validateApplicationId("A".repeat(65), "Test")).toThrow("must be between 1 and 64")
})

test("validateApplicationId: rejects id with invalid characters", ({ expect }) => {
  expect(() => validateApplicationId("My-App", "Test")).toThrow("must contain only")
  expect(() => validateApplicationId("1App", "Test")).toThrow("must contain only")
})

test("validateApplicationId: rejects restricted DOS device names", ({ expect }) => {
  expect(() => validateApplicationId("CON", "Test")).toThrow("restricted values")
  expect(() => validateApplicationId("con", "Test")).toThrow("restricted values")
  expect(() => validateApplicationId("COM1", "Test")).toThrow("restricted values")
  expect(() => validateApplicationId("LPT9", "Test")).toThrow("restricted values")
})

// ─── validateIdentityName ─────────────────────────────────────────────────────

test("validateIdentityName: accepts valid identity name", ({ expect }) => {
  expect(() => validateIdentityName("MyApp", "Test")).not.toThrow()
  expect(() => validateIdentityName("My.App", "Test")).not.toThrow()
  expect(() => validateIdentityName("abc", "Test")).not.toThrow()
  expect(() => validateIdentityName("A".repeat(50), "Test")).not.toThrow()
})

test("validateIdentityName: rejects name shorter than 3 chars", ({ expect }) => {
  expect(() => validateIdentityName("AB", "Test")).toThrow("between 3 and 50")
})

test("validateIdentityName: rejects name longer than 50 chars", ({ expect }) => {
  expect(() => validateIdentityName("A".repeat(51), "Test")).toThrow("between 3 and 50")
})

test("validateIdentityName: rejects name with invalid characters", ({ expect }) => {
  expect(() => validateIdentityName("My App", "Test")).toThrow("must contain only")
  expect(() => validateIdentityName("My@App", "Test")).toThrow("must contain only")
})

test("validateIdentityName: rejects restricted DOS device names", ({ expect }) => {
  expect(() => validateIdentityName("CON", "Test")).toThrow("restricted values")
  expect(() => validateIdentityName("NUL", "Test")).toThrow("restricted values")
})

test("validateIdentityName: error message uses 'identityName' label (not 'identityName.Id')", ({ expect }) => {
  const err = (() => {
    try {
      validateIdentityName("AB", "MSIX")
    } catch (e: any) {
      return e.message
    }
  })()
  expect(err).toContain("identityName")
  expect(err).not.toContain("identityName.Id")
})

test("validateApplicationId: error message uses 'must contain only' (not 'cannot contain')", ({ expect }) => {
  const err = (() => {
    try {
      validateApplicationId("My-App", "MSIX")
    } catch (e: any) {
      return e.message
    }
  })()
  expect(err).toContain("must contain only")
  expect(err).not.toMatch(/cannot contain[^s]/)
})

// ─── resourceLanguageTag ──────────────────────────────────────────────────────

test("resourceLanguageTag: null input defaults to en-US", ({ expect }) => {
  expect(resourceLanguageTag(null)).toBe('<Resource Language="en-US" />')
})

test("resourceLanguageTag: empty array defaults to en-US", ({ expect }) => {
  expect(resourceLanguageTag([])).toBe('<Resource Language="en-US" />')
})

test("resourceLanguageTag: single language", ({ expect }) => {
  expect(resourceLanguageTag(["de-DE"])).toBe('<Resource Language="de-DE" />')
})

test("resourceLanguageTag: multiple languages", ({ expect }) => {
  const result = resourceLanguageTag(["en-US", "de-DE", "ja-JP"])
  expect(result).toBe('<Resource Language="en-US" />\n<Resource Language="de-DE" />\n<Resource Language="ja-JP" />')
})

test("resourceLanguageTag: normalizes underscores to hyphens", ({ expect }) => {
  expect(resourceLanguageTag(["en_US"])).toBe('<Resource Language="en-US" />')
})

test("resourceLanguageTag: trims whitespace around language codes", ({ expect }) => {
  expect(resourceLanguageTag([" en-US "])).toBe('<Resource Language="en-US" />')
})

test("resourceLanguageTag: escapes special characters in the language tag", ({ expect }) => {
  expect(resourceLanguageTag(['en"&<x'])).toBe('<Resource Language="en&quot;&amp;&lt;x" />')
})

// ─── lockScreenTag ────────────────────────────────────────────────────────────

test("lockScreenTag: returns empty string when no BadgeLogo asset", ({ expect }) => {
  expect(lockScreenTag(["Square44x44Logo.png", "StoreLogo.png"])).toBe("")
})

test("lockScreenTag: returns lock screen element when BadgeLogo asset present", ({ expect }) => {
  const result = lockScreenTag(["BadgeLogo.scale-100.png"])
  expect(result).toBe('<uap:LockScreen Notification="badgeAndTileText" BadgeLogo="assets\\BadgeLogo.png" />')
})

// ─── defaultTileTag ───────────────────────────────────────────────────────────

test("defaultTileTag: basic tile without name overlay", ({ expect }) => {
  const result = defaultTileTag([], false)
  expect(result).toContain('Wide310x150Logo="assets\\Wide310x150Logo.png"')
  expect(result).not.toContain("ShowNameOnTiles")
  expect(result).toContain("/>")
})

test("defaultTileTag: includes LargeTile when present in assets", ({ expect }) => {
  const result = defaultTileTag(["LargeTile.png"], false)
  expect(result).toContain('Square310x310Logo="assets\\LargeTile.png"')
})

test("defaultTileTag: includes SmallTile when present in assets", ({ expect }) => {
  const result = defaultTileTag(["SmallTile.png"], false)
  expect(result).toContain('Square71x71Logo="assets\\SmallTile.png"')
})

test("defaultTileTag: adds ShowNameOnTiles when showNameOnTiles is true", ({ expect }) => {
  const result = defaultTileTag([], true)
  expect(result).toContain("<uap:ShowNameOnTiles>")
  expect(result).toContain('Tile="wide310x150Logo"')
  expect(result).toContain('Tile="square150x150Logo"')
  expect(result).toContain("</uap:DefaultTile>")
})

// ─── splashScreenTag ──────────────────────────────────────────────────────────

test("splashScreenTag: returns empty string when no SplashScreen asset", ({ expect }) => {
  expect(splashScreenTag(["StoreLogo.png"])).toBe("")
})

test("splashScreenTag: returns splash screen element when asset present", ({ expect }) => {
  expect(splashScreenTag(["SplashScreen.png"])).toBe('<uap:SplashScreen Image="assets\\SplashScreen.png" />')
})

// ─── isDefaultAssetIncluded ───────────────────────────────────────────────────

test("isDefaultAssetIncluded: detects exact match", ({ expect }) => {
  expect(isDefaultAssetIncluded(["StoreLogo.png"], "StoreLogo.png")).toBe(true)
})

test("isDefaultAssetIncluded: detects scaled variants", ({ expect }) => {
  expect(isDefaultAssetIncluded(["StoreLogo.scale-100.png"], "StoreLogo.png")).toBe(true)
})

test("isDefaultAssetIncluded: returns false when not present", ({ expect }) => {
  expect(isDefaultAssetIncluded(["Square44x44Logo.png"], "StoreLogo.png")).toBe(false)
})

// ─── isScaledAssetsProvided ───────────────────────────────────────────────────

test("isScaledAssetsProvided: returns false for plain assets", ({ expect }) => {
  expect(isScaledAssetsProvided(["StoreLogo.png", "Square44x44Logo.png"])).toBe(false)
})

test("isScaledAssetsProvided: returns true for .scale- variant", ({ expect }) => {
  expect(isScaledAssetsProvided(["BadgeLogo.scale-100.png"])).toBe(true)
})

test("isScaledAssetsProvided: returns true for .targetsize- variant", ({ expect }) => {
  expect(isScaledAssetsProvided(["Square44x44Logo.targetsize-16.png"])).toBe(true)
})

// ─── buildCapabilitiesXml ─────────────────────────────────────────────────────

test("buildCapabilitiesXml: always includes runFullTrust", ({ expect }) => {
  const result = buildCapabilitiesXml([])
  expect(result).toContain("runFullTrust")
})

test("buildCapabilitiesXml: includes requested capability", ({ expect }) => {
  const result = buildCapabilitiesXml(["internetClient"])
  expect(result).toContain('Name="internetClient"')
  expect(result).toContain("runFullTrust")
})

test("buildCapabilitiesXml: throws for invalid capability name", ({ expect }) => {
  expect(() => buildCapabilitiesXml(["fakeCapThatDoesNotExist"])).toThrow("invalid windows capabilit")
})

test("buildCapabilitiesXml: handles null input (defaults to runFullTrust only)", ({ expect }) => {
  const result = buildCapabilitiesXml(null)
  expect(result).toContain("runFullTrust")
})

test("buildCapabilitiesXml: includes uap-namespaced capabilities", ({ expect }) => {
  const result = buildCapabilitiesXml(["picturesLibrary"])
  expect(result).toContain('<uap:Capability Name="picturesLibrary"')
})

test("buildCapabilitiesXml: includes device capabilities", ({ expect }) => {
  const result = buildCapabilitiesXml(["webcam"])
  expect(result).toContain('<DeviceCapability Name="webcam"')
})

// ─── buildExtensionsXml ───────────────────────────────────────────────────────

test("buildExtensionsXml: returns empty string when nothing configured", async ({ expect }) => {
  const result = await buildExtensionsXml({
    protocols: [],
    fileAssociations: [],
    appDir: "/some/dir",
    executable: "app\\MyApp.exe",
    displayName: "My App",
  })
  expect(result).toBe("")
})

test("buildExtensionsXml: generates protocol handler extension", async ({ expect }) => {
  const result = await buildExtensionsXml({
    protocols: [{ name: "MyApp Protocol", schemes: ["myapp"] }],
    fileAssociations: [],
    appDir: "/some/dir",
    executable: "app\\MyApp.exe",
    displayName: "My App",
  })
  expect(result).toContain("<Extensions>")
  expect(result).toContain('Category="windows.protocol"')
  expect(result).toContain('Name="myapp"')
  expect(result).toContain("MyApp Protocol")
  expect(result).toContain("</Extensions>")
})

test("buildExtensionsXml: generates file association extension", async ({ expect }) => {
  const result = await buildExtensionsXml({
    protocols: [],
    fileAssociations: [{ ext: "myf" }],
    appDir: "/some/dir",
    executable: "app\\MyApp.exe",
    displayName: "My App",
  })
  expect(result).toContain('Category="windows.fileTypeAssociation"')
  expect(result).toContain('Name="myf"')
  expect(result).toContain(".myf")
})

test("buildExtensionsXml: adds auto-launch extension when dependency detected", async ({ expect }) => {
  const result = await buildExtensionsXml({
    protocols: [],
    fileAssociations: [],
    appDir: "/some/dir",
    executable: "app\\MyApp.exe",
    displayName: "My App",
    dependencyNames: { "electron-winstore-auto-launch": "1.0.0" },
  })
  expect(result).toContain('Category="windows.startupTask"')
  expect(result).toContain('"My App"')
})

test("buildExtensionsXml: explicit addAutoLaunchExtension=false prevents auto-launch even with dependency", async ({ expect }) => {
  const result = await buildExtensionsXml({
    protocols: [],
    fileAssociations: [],
    appDir: "/some/dir",
    executable: "app\\MyApp.exe",
    displayName: "My App",
    addAutoLaunchExtension: false,
    dependencyNames: { "electron-winstore-auto-launch": "1.0.0" },
  })
  expect(result).toBe("")
})

test("buildExtensionsXml: handles multiple schemes per protocol", async ({ expect }) => {
  const result = await buildExtensionsXml({
    protocols: [{ name: "MyApp", schemes: ["myapp", "myapp2"] }],
    fileAssociations: [],
    appDir: "/some/dir",
    executable: "app\\MyApp.exe",
    displayName: "My App",
  })
  expect(result).toContain('Name="myapp"')
  expect(result).toContain('Name="myapp2"')
})

test("buildExtensionsXml: handles multiple file associations each with multiple extensions", async ({ expect }) => {
  const result = await buildExtensionsXml({
    protocols: [],
    fileAssociations: [{ ext: ["txt", "log"] }, { ext: "md" }],
    appDir: "/some/dir",
    executable: "app\\MyApp.exe",
    displayName: "My App",
  })
  expect(result).toContain('Name="txt"')
  expect(result).toContain('Name="log"')
  expect(result).toContain('Name="md"')
})

test("buildExtensionsXml: escapes special chars in protocol scheme and name", async ({ expect }) => {
  const result = await buildExtensionsXml({
    protocols: [{ name: 'My "App" & <Proto>', schemes: ['my"app&<x>'] }],
    fileAssociations: [],
    appDir: "/some/dir",
    executable: "app\\MyApp.exe",
    displayName: "My App",
  })
  expect(result).toContain('Name="my&quot;app&amp;&lt;x&gt;"')
  expect(result).toContain("My &quot;App&quot; &amp; &lt;Proto&gt;")
  // raw, unescaped special characters must not leak into the markup
  expect(result).not.toContain('my"app')
  expect(result).not.toContain("<Proto>")
})

test("buildExtensionsXml: escapes special chars in file association ext", async ({ expect }) => {
  const result = await buildExtensionsXml({
    protocols: [],
    fileAssociations: [{ ext: 'x"&<y' }],
    appDir: "/some/dir",
    executable: "app\\MyApp.exe",
    displayName: "My App",
  })
  expect(result).toContain('Name="x&quot;&amp;&lt;y"')
  expect(result).toContain(".x&quot;&amp;&lt;y")
  expect(result).not.toContain('x"&<y')
})

test("buildExtensionsXml: escapes special chars in auto-launch displayName and executable", async ({ expect }) => {
  const result = await buildExtensionsXml({
    protocols: [],
    fileAssociations: [],
    appDir: "/some/dir",
    executable: 'app\\My "App".exe',
    displayName: "A & B <c>",
    addAutoLaunchExtension: true,
  })
  expect(result).toContain('Executable="app\\My &quot;App&quot;.exe"')
  expect(result).toContain('DisplayName="A &amp; B &lt;c&gt;"')
})

// ─── resolvePackageApplicationId ─────────────────────────────────────────────

test("resolvePackageApplicationId: uses explicit applicationId when provided", ({ expect }) => {
  expect(resolvePackageApplicationId("MyExplicit", "SomeName", "appname", "Test")).toBe("MyExplicit")
})

test("resolvePackageApplicationId: falls back to identityName when no applicationId", ({ expect }) => {
  expect(resolvePackageApplicationId(undefined, "MyIdentity", "appname", "Test")).toBe("MyIdentity")
})

test("resolvePackageApplicationId: falls back to appName when both are absent", ({ expect }) => {
  expect(resolvePackageApplicationId(undefined, undefined, "myApp", "Test")).toBe("myApp")
})

test("resolvePackageApplicationId: strips leading numeric prefix from identityName", ({ expect }) => {
  // This is the numeric-prefix stripping behaviour preserved from the original AppX code
  const result = resolvePackageApplicationId(undefined, "12345Test.App", "appname", "Test")
  expect(result).toBe("Test.App")
})

test("resolvePackageApplicationId: strips leading zero-prefixed numeric from identityName", ({ expect }) => {
  const result = resolvePackageApplicationId(undefined, "01234Test.App", "appname", "Test")
  expect(result).toBe("Test.App")
})

test("resolvePackageApplicationId: throws for invalid resulting id", ({ expect }) => {
  expect(() => resolvePackageApplicationId("CON", undefined, "appname", "Test")).toThrow("restricted values")
})

// ─── resolvePackageIdentityName ───────────────────────────────────────────────

test("resolvePackageIdentityName: uses identityName when provided", ({ expect }) => {
  expect(resolvePackageIdentityName("MyId", "fallback", "Test")).toBe("MyId")
})

test("resolvePackageIdentityName: falls back to appName when identityName is null", ({ expect }) => {
  expect(resolvePackageIdentityName(null, "fallback", "Test")).toBe("fallback")
})

test("resolvePackageIdentityName: falls back to appName when identityName is undefined", ({ expect }) => {
  expect(resolvePackageIdentityName(undefined, "fallback", "Test")).toBe("fallback")
})

test("resolvePackageIdentityName: throws for invalid identity name", ({ expect }) => {
  expect(() => resolvePackageIdentityName("AB", "fallback", "Test")).toThrow("between 3 and 50")
})

// ─── buildWindowsServicesXml ──────────────────────────────────────────────────

test("buildWindowsServicesXml: returns empty string for undefined services", ({ expect }) => {
  expect(buildWindowsServicesXml(undefined, "app\\App.exe")).toBe("")
})

test("buildWindowsServicesXml: returns empty string for empty array", ({ expect }) => {
  expect(buildWindowsServicesXml([], "app\\App.exe")).toBe("")
})

test("buildWindowsServicesXml: generates service extension", ({ expect }) => {
  const result = buildWindowsServicesXml([{ name: "MySvc" }], "app\\App.exe")
  expect(result).toContain('Category="windows.service"')
  expect(result).toContain('Name="MySvc"')
  expect(result).toContain('Executable="app\\App.exe"')
  expect(result).toContain('StartupType="manual"')
  // StartAccount is required by the desktop6:Service schema and defaults to localSystem
  expect(result).toContain('StartAccount="localSystem"')
  expect(result).not.toContain("Arguments")
})

test("buildWindowsServicesXml: respects explicit startupType", ({ expect }) => {
  const result = buildWindowsServicesXml([{ name: "AutoSvc", startupType: "auto" }], "app\\App.exe")
  expect(result).toContain('StartupType="auto"')
})

test("buildWindowsServicesXml: supports the disabled startupType", ({ expect }) => {
  const result = buildWindowsServicesXml([{ name: "OffSvc", startupType: "disabled" }], "app\\App.exe")
  expect(result).toContain('StartupType="disabled"')
})

test("buildWindowsServicesXml: respects explicit startAccount", ({ expect }) => {
  const result = buildWindowsServicesXml([{ name: "NetSvc", startAccount: "networkService" }], "app\\App.exe")
  expect(result).toContain('StartAccount="networkService"')
})

test("buildWindowsServicesXml: each service independently falls back to the default executable and account", ({ expect }) => {
  const result = buildWindowsServicesXml([{ name: "A", executable: "app\\a.exe", startAccount: "localService" }, { name: "B" }], "app\\App.exe")
  // Each service is one <desktop6:Extension> block; Executable lives on the Extension element (before the Service element)
  const segments = result.split("<desktop6:Extension").filter(s => s.includes("<desktop6:Service"))
  const a = segments.find(s => s.includes('Name="A"'))!
  const b = segments.find(s => s.includes('Name="B"'))!
  expect(a).toContain('Executable="app\\a.exe"')
  expect(a).toContain('StartAccount="localService"')
  expect(b).toContain('Executable="app\\App.exe"')
  expect(b).toContain('StartAccount="localSystem"')
})

test("buildWindowsServicesXml: includes Arguments when set", ({ expect }) => {
  const result = buildWindowsServicesXml([{ name: "MySvc", arguments: "--daemon" }], "app\\App.exe")
  expect(result).toContain('Arguments="--daemon"')
})

test("buildWindowsServicesXml: uses custom executable when provided", ({ expect }) => {
  const result = buildWindowsServicesXml([{ name: "MySvc", executable: "app\\svc.exe" }], "app\\App.exe")
  expect(result).toContain('Executable="app\\svc.exe"')
})

test("buildWindowsServicesXml: escapes special characters in service name", ({ expect }) => {
  const result = buildWindowsServicesXml([{ name: 'Svc "A" & B' }], "app\\App.exe")
  expect(result).toContain('Name="Svc &quot;A&quot; &amp; B"')
  expect(result).not.toContain('"Svc "A"')
})

test("buildWindowsServicesXml: generates multiple service extensions", ({ expect }) => {
  const result = buildWindowsServicesXml([{ name: "Svc1" }, { name: "Svc2" }], "app\\App.exe")
  expect(result).toContain('Name="Svc1"')
  expect(result).toContain('Name="Svc2"')
})

test("buildWindowsServicesXml: startupType value is emitted clean (no special chars leak)", ({ expect }) => {
  // startupType is constrained to an enum in TypeScript but we validate XML safety of the emitted value too
  const result = buildWindowsServicesXml([{ name: "MySvc", startupType: "auto" }], "app\\App.exe")
  expect(result).toContain('StartupType="auto"')
  // Inspect only the StartupType attribute value (not across attribute boundaries) for special chars
  const startupTypeValue = result.match(/StartupType="([^"]*)"/)?.[1]
  expect(startupTypeValue).toBe("auto")
  expect(startupTypeValue).not.toMatch(/[&<>"']/)
})

test("buildWindowsServicesXml: escapes special chars in arguments", ({ expect }) => {
  const result = buildWindowsServicesXml([{ name: "MySvc", arguments: '--arg="val"&<x>' }], "app\\App.exe")
  expect(result).toContain('Arguments="--arg=&quot;val&quot;&amp;&lt;x&gt;"')
  expect(result).not.toContain('--arg="val"')
})

// ─── buildCapabilitiesXml (extended invariants) ───────────────────────────────

test("buildCapabilitiesXml: de-duplicates and does not duplicate an explicit runFullTrust", ({ expect }) => {
  const result = buildCapabilitiesXml(["internetClient", "internetClient", "runFullTrust"])
  expect(result.match(/Name="internetClient"/g)?.length).toBe(1)
  expect(result.match(/runFullTrust/g)?.length).toBe(1)
})

test("buildCapabilitiesXml: error message is singular for one invalid capability", ({ expect }) => {
  expect(() => buildCapabilitiesXml(["fakeCap"])).toThrow(/invalid windows capability\b/)
})

test("buildCapabilitiesXml: error message is plural for multiple invalid capabilities", ({ expect }) => {
  expect(() => buildCapabilitiesXml(["fakeA", "fakeB"])).toThrow(/invalid windows capabilities\b/)
})

// ─── resolvePackageApplicationId (additional branches) ────────────────────────

test("resolvePackageApplicationId: identityName with non-leading digits passes through unchanged", ({ expect }) => {
  expect(resolvePackageApplicationId(undefined, "Test123.App", "appname", "Test")).toBe("Test123.App")
})

test("resolvePackageApplicationId: a purely numeric identityName strips to empty and throws length error", ({ expect }) => {
  expect(() => resolvePackageApplicationId(undefined, "12345", "appname", "Test")).toThrow("between 1 and 64")
})

test("resolvePackageApplicationId: only the leading numeric run is stripped (String.replace, not replaceAll)", ({ expect }) => {
  // "9Test9App" → strips the FIRST "9" only → "Test9App" (the inner 9 survives; replaceAll would give "TestApp")
  expect(resolvePackageApplicationId(undefined, "9Test9App", "appname", "Test")).toBe("Test9App")
})

test("resolvePackageApplicationId: dash-containing identityName gives an actionable error pointing to applicationId", ({ expect }) => {
  // identityName allows dashes; Application.Id does not — the derived value must fail with guidance.
  expect(() => resolvePackageApplicationId(undefined, "My-Company.App", "appname", "MSIX")).toThrow('Set the "applicationId" option explicitly')
})

test("resolvePackageApplicationId: an explicit applicationId is validated but never gets the derivation guidance", ({ expect }) => {
  expect(() => resolvePackageApplicationId("My-App", undefined, "appname", "MSIX")).toThrow("must contain only")
  expect(() => resolvePackageApplicationId("My-App", undefined, "appname", "MSIX")).not.toThrow('Set the "applicationId" option explicitly')
})

// ─── resourceLanguageTag (order + normalization) ──────────────────────────────

test("resourceLanguageTag: preserves order (index 0 = default) while trimming and normalizing underscores", ({ expect }) => {
  expect(resourceLanguageTag([" fr_FR ", "en-US", "de_DE"])).toBe('<Resource Language="fr-FR" />\n<Resource Language="en-US" />\n<Resource Language="de-DE" />')
})

// ─── defaultTileTag (structural close) ────────────────────────────────────────

test("defaultTileTag: self-closes when showNameOnTiles=false and has no child elements", ({ expect }) => {
  const result = defaultTileTag([], false)
  expect(result.trimEnd().endsWith("/>")).toBe(true)
  expect(result).not.toContain("</uap:DefaultTile>")
  expect(result).not.toContain("ShowNameOnTiles")
})

test("defaultTileTag: opens and closes the element when showNameOnTiles=true", ({ expect }) => {
  const result = defaultTileTag([], true)
  expect(result).toContain("<uap:ShowNameOnTiles>")
  expect(result.trimEnd().endsWith("</uap:DefaultTile>")).toBe(true)
})

test("defaultTileTag: includes both LargeTile and SmallTile when both assets are present", ({ expect }) => {
  const result = defaultTileTag(["LargeTile.png", "SmallTile.png"], false)
  expect(result).toContain('Square310x310Logo="assets\\LargeTile.png"')
  expect(result).toContain('Square71x71Logo="assets\\SmallTile.png"')
})

// ─── computeUserAssets (filtering + default substitution) ─────────────────────

test("computeUserAssets: filters dotfiles/.db/extensionless and only substitutes missing default assets", async ({ expect }) => {
  const dir = await mkdtemp(path.join(tmpdir(), "msix-assets-"))
  try {
    await Promise.all(["StoreLogo.png", ".DS_Store", "Thumbs.db", "README", "Square44x44Logo.scale-200.png"].map(name => writeFile(path.join(dir, name), "x")))
    const { userAssets, allAssets } = await computeUserAssets(fakeVm, "/vendor", dir)

    // dotfiles, .db and extensionless files are excluded
    expect(userAssets.sort()).toEqual(["Square44x44Logo.scale-200.png", "StoreLogo.png"])

    const assetBasenames = allAssets.map(a => path.basename(a))
    // user supplied StoreLogo + Square44x44 → vendor defaults are added ONLY for the missing ones
    expect(assetBasenames).toContain("SampleAppx.150x150.png") // Square150x150Logo default
    expect(assetBasenames).toContain("SampleAppx.310x150.png") // Wide310x150Logo default
    expect(assetBasenames).not.toContain("SampleAppx.50x50.png") // StoreLogo supplied by user → no default
    expect(assetBasenames).not.toContain("SampleAppx.44x44.png") // Square44x44 supplied by user → no default
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("computeUserAssets: null userAssetDir emits every vendor default", async ({ expect }) => {
  const { userAssets, allAssets } = await computeUserAssets(fakeVm, "/vendor", null)
  expect(userAssets).toEqual([])
  const assetBasenames = allAssets.map(a => path.basename(a))
  expect(assetBasenames.sort()).toEqual(["SampleAppx.150x150.png", "SampleAppx.310x150.png", "SampleAppx.44x44.png", "SampleAppx.50x50.png"])
})

// ─── assertSafeMappingPath / mapping-file injection guard ─────────────────────

test("assertSafeMappingPath: accepts ordinary paths (spaces, unicode, separators)", ({ expect }) => {
  expect(() => assertSafeMappingPath("app\\My App\\ünïcode.exe", "Packaged file path")).not.toThrow()
  expect(() => assertSafeMappingPath("assets\\StoreLogo.png", "Asset file name")).not.toThrow()
})

test("assertSafeMappingPath: rejects a double-quote (mapping-file entry injection)", ({ expect }) => {
  expect(() => assertSafeMappingPath('x" "app\\hijack.exe', "Packaged file path")).toThrow("cannot contain a double-quote or newline")
})

test("assertSafeMappingPath: rejects CR/LF (mapping-file line injection)", ({ expect }) => {
  expect(() => assertSafeMappingPath("a\nb", "Packaged file path")).toThrow("double-quote or newline")
  expect(() => assertSafeMappingPath("a\rb", "Packaged file path")).toThrow("double-quote or newline")
})

// Windows forbids `"` in filenames, so the on-disk injection vector only exists on POSIX hosts (the
// realistic threat model: a non-Windows CI / cross-build packaging an attacker-named asset). The pure
// validation logic is covered cross-platform by the assertSafeMappingPath tests above.
test.ifNotWindows("computeUserAssets: rejects a user-asset name that would inject a mapping entry", async ({ expect }) => {
  const dir = await mkdtemp(path.join(tmpdir(), "msix-assets-evil-"))
  try {
    await writeFile(path.join(dir, 'evil" "assets\\hijack.png'), "x")
    await expect(computeUserAssets(fakeVm, "/vendor", dir)).rejects.toThrow("cannot contain a double-quote or newline")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// ─── computePackageFamilyName ─────────────────────────────────────────────────

test("computePackageFamilyName: matches the package family names Windows reports", ({ expect }) => {
  // 8wekyb3d8bbwe is the PublisherId of Microsoft's inbox apps; CN=EB Test Code Signing is the subject of the test signing certificate
  expect(computePackageFamilyName("Microsoft.WindowsCalculator", "CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US")).toBe(
    "Microsoft.WindowsCalculator_8wekyb3d8bbwe"
  )
  expect(computePackageFamilyName("TestApp", "CN=Electron")).toBe("TestApp_rdjwn13tdj8dy")
  expect(computePackageFamilyName("TestAppMsixUpdate", "CN=EB Test Code Signing")).toBe("TestAppMsixUpdate_by1eqepggsspe")
})

test("computePackageFamilyName: keeps the identity name verbatim and appends 13 lowercase Crockford base32 characters", ({ expect }) => {
  expect(computePackageFamilyName("My.App-Name", "CN=Electron")).toBe("My.App-Name_rdjwn13tdj8dy")
  for (const publisher of ["CN=Electron", "CN=Müller GmbH, O=Müller GmbH, C=DE", "CN=a"]) {
    // Crockford's alphabet has no i, l, o or u
    expect(computePackageFamilyName("TestApp", publisher)).toMatch(/^TestApp_[0-9a-hjkmnp-tv-z]{13}$/)
  }
})

test("computePackageFamilyName: hashes the publisher as given, not its XML-escaped form", ({ expect }) => {
  expect(computePackageFamilyName("TestApp", "CN=O'Brien & Sons")).toBe("TestApp_15tm11f05119t")
  expect(computePackageFamilyName("TestApp", "CN=O&apos;Brien &amp; Sons")).not.toBe("TestApp_15tm11f05119t")
})

// ─── getPackageIdentity ───────────────────────────────────────────────────────

const MSIX_TEMPLATE = path.join(__dirname, "../../../packages/app-builder-lib/templates/msix/appxmanifest.xml")

const ESCAPED_PUBLISHER_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10">
  <Identity Name="TestApp" ProcessorArchitecture="x64" Publisher='CN=O&apos;Brien &amp; Sons' Version="1.2.3.0" />
</Package>`

test("getPackageIdentity: returns the Identity attributes unescaped", ({ expect }) => {
  expect(getPackageIdentity(ESCAPED_PUBLISHER_MANIFEST)).toEqual({ name: "TestApp", publisher: "CN=O'Brien & Sons", version: "1.2.3.0" })
})

test("getPackageIdentity: reads a manifest that starts with a UTF-8 byte order mark", ({ expect }) => {
  // readFile(..., "utf8") keeps the BOM that a custom manifest or an appxManifestCreated hook may have written
  expect(getPackageIdentity(`\uFEFF${ESCAPED_PUBLISHER_MANIFEST}`)).toEqual({ name: "TestApp", publisher: "CN=O'Brien & Sons", version: "1.2.3.0" })
})

test("getPackageIdentity: reads a custom manifest (CRLF, comments, attribute order, double-quoted Publisher, PhoneIdentity)", ({ expect }) => {
  const manifest = [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<!-- custom manifest -->",
    '<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:mp="http://schemas.microsoft.com/appx/2014/phone/manifest">',
    '  <Identity Version="2.0.1.7" Publisher="CN=&quot;Contoso, Inc.&quot;, O=&quot;Contoso, Inc.&quot;, C=US" Name="Contoso.App" ProcessorArchitecture="arm64" />',
    '  <mp:PhoneIdentity PhoneProductId="00000000-0000-0000-0000-000000000000" PhonePublisherId="00000000-0000-0000-0000-000000000000" />',
    "</Package>",
  ].join("\r\n")
  expect(getPackageIdentity(manifest)).toEqual({ name: "Contoso.App", publisher: 'CN="Contoso, Inc.", O="Contoso, Inc.", C=US', version: "2.0.1.7" })
})

test("getPackageIdentity: reads the identity back from the rendered MSIX template", async ({ expect }) => {
  const publisher = `CN="O'Brien & Sons, Inc.", C=US`
  const values: Partial<Record<string, string>> = { identityName: "TestApp", publisher, version: "1.2.3.0", arch: "x64" }
  const manifest = substituteManifestMacros(await readFile(MSIX_TEMPLATE, "utf8"), macro => values[macro] ?? "")
  expect(manifest).toContain("Publisher='CN=&quot;O&apos;Brien &amp; Sons, Inc.&quot;, C=US'")
  expect(getPackageIdentity(manifest)).toEqual({ name: "TestApp", publisher, version: "1.2.3.0" })
})

// ─── isPackageTypeMapping / isMappedTo ────────────────────────────────────────

test("isPackageTypeMapping: matches a [Files] line mapped to app\\resources\\package-type, in any casing", ({ expect }) => {
  expect(PACKAGE_TYPE_MAPPING_DESTINATION).toBe("app\\resources\\package-type")
  expect(isPackageTypeMapping('"C:\\x\\package-type" "app\\resources\\package-type"')).toBe(true)
  // Windows paths are case-insensitive: a walked Resources\Package-Type is the same packaged file
  expect(isPackageTypeMapping('"C:\\x\\Package-Type" "App\\Resources\\PACKAGE-TYPE"')).toBe(true)
})

test("isPackageTypeMapping: does not match another destination", ({ expect }) => {
  expect(isPackageTypeMapping('"C:\\x\\package-type.txt" "app\\resources\\package-type.txt"')).toBe(false)
  // only the destination counts, not a source that ends in package-type
  expect(isPackageTypeMapping('"C:\\stage\\app\\resources\\package-type" "app\\resources\\app.asar"')).toBe(false)
  expect(isPackageTypeMapping('"C:\\x\\package-type" "app\\package-type"')).toBe(false)
  expect(isPackageTypeMapping('"C:\\x\\package-type" "app\\resources\\nested\\app\\resources\\package-type"')).toBe(false)
})

test("isMappedTo: compares the whole destination of a [Files] line, case-insensitively", ({ expect }) => {
  const line = '"/tmp/stage/app-update.yml" "app\\resources\\app-update.yml"'
  expect(isMappedTo(line, "app\\resources\\app-update.yml")).toBe(true)
  expect(isMappedTo(line, "APP\\Resources\\App-Update.yml")).toBe(true)
  expect(isMappedTo(line, "resources\\app-update.yml")).toBe(false)
})

// ─── assertMsixUpdaterElectronVersion ─────────────────────────────────────────

// The warning is logged once per configuration object, so every call that asserts it gets a fresh one.
function warningsOf(electronVersion: string | undefined, config: Configuration, isPrepackaged: boolean) {
  const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
  try {
    assertMsixUpdaterElectronVersion(electronVersion, config, isPrepackaged)
    return [...warn.mock.calls]
  } finally {
    warn.mockRestore()
  }
}

test.for(["39.5.1", "40.0.0", "40.2.0", "41.0.0-alpha.5", "38.0.0"])("assertMsixUpdaterElectronVersion: fails the build for Electron %s", (electronVersion, { expect }) => {
  const error = (() => {
    try {
      assertMsixUpdaterElectronVersion(electronVersion, {}, false)
    } catch (e: any) {
      return e
    }
  })()
  expect(error).toBeInstanceOf(InvalidConfigurationError)
  // the message names the first usable version of every line, so the user knows where to go
  for (const floor of ["39.5.2+", "40.2.1+", "41.0.0-alpha.6+", "42+"]) {
    expect(error.message).toContain(floor)
  }
  expect(error.message).toContain(`This build uses Electron ${electronVersion}.`)
})

test.for(["39.5.2", "39.8.10", "40.2.1", "41.0.0-alpha.6", "41.0.0", "42.0.0", "44.0.0-alpha.1"])(
  "assertMsixUpdaterElectronVersion: accepts Electron %s without a warning",
  (electronVersion, { expect }) => {
    expect(warningsOf(electronVersion, {}, false)).toEqual([])
  }
)

test.for<[string, string | undefined, Configuration, boolean, string]>([
  ["an unparseable version", "custom-1", {}, false, "unparseable Electron version"],
  ["an unknown version", undefined, {}, false, "unparseable Electron version"],
  ["a custom electronDist", "39.0.0", { electronDist: "C:/electron" }, false, "custom electronDist"],
  ["a prepackaged app", "39.0.0", {}, true, "prepackaged app"],
])("assertMsixUpdaterElectronVersion: only warns for %s, whose Electron cannot be checked", ([, electronVersion, config, isPrepackaged, reason], { expect }) => {
  const warnings = warningsOf(electronVersion, config, isPrepackaged)
  expect(warnings).toHaveLength(1)
  expect(warnings[0][0]).toEqual({ electronVersion, reason })
  expect(warnings[0][1]).toContain("cannot be checked")
})

test("assertMsixUpdaterElectronVersion: warns once per build configuration", ({ expect }) => {
  const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
  try {
    const config = {}
    assertMsixUpdaterElectronVersion("custom-1", config, false)
    assertMsixUpdaterElectronVersion("custom-1", config, false)
    expect(warn).toHaveBeenCalledTimes(1)
    assertMsixUpdaterElectronVersion("custom-1", {}, false)
    expect(warn).toHaveBeenCalledTimes(2)
  } finally {
    warn.mockRestore()
  }
})

test("assertMsixUpdaterElectronVersion: a mirror still serves the declared version, so it is checked", ({ expect }) => {
  vi.stubEnv("ELECTRON_MIRROR", "https://mirror.example/")
  try {
    expect(() => assertMsixUpdaterElectronVersion("39.0.0", {}, false)).toThrow(InvalidConfigurationError)
    expect(() => assertMsixUpdaterElectronVersion("39.0.0", { electronGet: { mirrorOptions: { mirror: "https://mirror.example/" } } }, false)).toThrow(InvalidConfigurationError)
  } finally {
    vi.unstubAllEnvs()
  }
})
