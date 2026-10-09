import { describe, expect, test } from "vitest"
import {
  FEED_QUERY_ADVISORY,
  MAC_ENTITLEMENTS_ADVISORY,
  migrateConfig,
  NSIS_PER_MACHINE_UPDATE_ADVISORY,
  NSIS_WEB_ADVISORY,
  PORTABLE_DEBUG_LOGGING_DROPPED,
  WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY,
} from "../../packages/electron-builder/src/cli/migrate-schema"
import { loadTypeScript, migrateProgrammaticSource } from "../../packages/electron-builder/src/cli/migrate-schema-programmatic"

function run(source: string, fileName = "electron-builder.ts") {
  return migrateProgrammaticSource(source, fileName)
}

/** Advisories for the config object literal `body` exported as CJS (`module.exports = …`) and as ESM/TS (`export default …`), after `prelude`. */
function advisoriesOfBothForms(body: string, prelude = ""): { cjs: string[]; esm: string[] } {
  return {
    cjs: run(`${prelude}module.exports = ${body}\n`, "electron-builder.cjs").advisories,
    esm: run(`${prelude}export default ${body}\n`, "electron-builder.ts").advisories,
  }
}

function expectAdvisories(body: string, expected: string[], prelude = "") {
  expect(advisoriesOfBothForms(body, prelude)).toEqual({ cjs: expected, esm: expected })
}

/** Converts a literal TS AST node into its JS value (no eval); throws on non-literal nodes. */
function literalToValue(ts: any, node: any): any {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(node))) {
    node = node.expression
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
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
  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return null
  }
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    return -literalToValue(ts, node.operand)
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((e: any) => literalToValue(ts, e))
  }
  if (ts.isObjectLiteralExpression(node)) {
    const out: Record<string, any> = {}
    for (const p of node.properties) {
      out[p.name.text] = literalToValue(ts, p.initializer)
    }
    return out
  }
  throw new Error(`non-literal node kind ${node.kind}`)
}

/** Parses a pure-literal `module.exports = {...}` source string back into a config object (no eval). */
function objFromCjs(code: string): Record<string, any> {
  const ts: any = loadTypeScript()
  const sf = ts.createSourceFile("c.cjs", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  let objLit: any = null
  const find = (n: any): void => {
    if (objLit == null && ts.isObjectLiteralExpression(n)) {
      objLit = n
    }
    n.forEachChild(find)
  }
  sf.forEachChild(find)
  return literalToValue(ts, objLit)
}

describe("migrateProgrammaticSource — environment", () => {
  test("typescript is resolvable in the test environment", () => {
    expect(loadTypeScript()).not.toBeNull()
  })
})

describe("migrateProgrammaticSource — locate shapes", () => {
  const cases: { name: string; src: string }[] = [
    { name: "export default object", src: `export default {\n  npmRebuild: true,\n}\n` },
    { name: "module.exports object", src: `module.exports = {\n  npmRebuild: true,\n}\n` },
    { name: "exports.default object", src: `exports.default = {\n  npmRebuild: true,\n}\n` },
    { name: "export = object (TS)", src: `export = {\n  npmRebuild: true,\n}\n` },
    { name: "const indirection", src: `const config = {\n  npmRebuild: true,\n}\nexport default config\n` },
    { name: "satisfies Configuration", src: `export default {\n  npmRebuild: true,\n} satisfies Configuration\n` },
    { name: "inline build({ config })", src: `import { build } from "electron-builder"\nawait build({ config: {\n  npmRebuild: true,\n} })\n` },
    { name: "inline build({ config: ident })", src: `import { build } from "electron-builder"\nconst options = {\n  npmRebuild: true,\n}\nbuild({ config: options })\n` },
    { name: "arrow returning object", src: `export default () => ({\n  npmRebuild: true,\n})\n` },
    { name: "function with single return", src: `export default function () {\n  return {\n    npmRebuild: true,\n  }\n}\n` },
  ]

  for (const c of cases) {
    test(`locates and migrates: ${c.name}`, () => {
      const result = run(c.src)
      expect(result.status).toBe("migrated")
      expect(result.code).toMatch(/nativeModules:\s*\{/)
      expect(result.code).toContain("npmRebuild: true")
      // npmRebuild was grouped under nativeModules, not left as a sibling key.
      expect(result.code.match(/npmRebuild/g)).toHaveLength(1)
    })
  }
})

describe("migrateProgrammaticSource — linux.syncDesktopName", () => {
  test("removes linux.syncDesktopName: true, preserving other linux props", () => {
    const result = run(`export default {\n  linux: {\n    target: "deb",\n    syncDesktopName: true,\n  },\n}\n`)
    expect(result.status).toBe("migrated")
    expect(result.code).not.toContain("syncDesktopName")
    expect(result.code).toContain(`target: "deb"`)
    expect(result.changes.some(c => c.key === "linux.syncDesktopName")).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  test("removes linux.syncDesktopName: false and warns", () => {
    const result = run(`export default {\n  linux: {\n    syncDesktopName: false,\n  },\n}\n`)
    expect(result.status).toBe("migrated")
    expect(result.code).not.toContain("syncDesktopName")
    expect(result.warnings.some(w => w.includes("syncDesktopName") && w.includes("desktopName"))).toBe(true)
  })
})

describe("migrateProgrammaticSource — disableDefaultIgnoredFiles", () => {
  test("strips the root-level key, preserving surrounding properties", () => {
    const result = run(`export default {\n  appId: "com.a.b",\n  disableDefaultIgnoredFiles: true,\n  files: ["dist/**/*"],\n}\n`)
    expect(result.status).toBe("migrated")
    expect(result.code).not.toContain("disableDefaultIgnoredFiles")
    expect(result.code).toContain(`appId: "com.a.b"`)
    expect(result.code).toContain(`files: ["dist/**/*"]`)
    expect(result.changes.some(c => c.key === "disableDefaultIgnoredFiles")).toBe(true)
  })

  test("strips the key from platform config objects too (win/mas/masDev)", () => {
    const result = run(
      `export default {\n  win: {\n    target: "nsis",\n    disableDefaultIgnoredFiles: true,\n  },\n  mas: {\n    disableDefaultIgnoredFiles: true,\n  },\n  masDev: {\n    disableDefaultIgnoredFiles: true,\n  },\n}\n`
    )
    expect(result.status).toBe("migrated")
    expect(result.code).not.toContain("disableDefaultIgnoredFiles")
    expect(result.code).toContain(`target: "nsis"`)
  })
})

describe("migrateProgrammaticSource — unsupported shapes (bail with reason)", () => {
  test("spread is unsupported", () => {
    const result = run(`const base = {}\nexport default {\n  ...base,\n  npmRebuild: true,\n}\n`)
    expect(result.status).toBe("unsupported")
    expect(result.unsupportedReason).toMatch(/spread/)
    expect(result.code).toContain("...base") // source unchanged
  })

  test("dynamically built function config is unsupported", () => {
    const result = run(`export default () => {\n  const c = {}\n  if (process.env.CI) return { npmRebuild: false }\n  return { npmRebuild: true }\n}\n`)
    expect(result.status).toBe("unsupported")
  })

  test("no config object found", () => {
    const result = run(`console.log("hello")\n`)
    expect(result.status).toBe("unsupported")
  })

  test("computed key is unsupported", () => {
    const result = run(`const k = "npmRebuild"\nexport default {\n  [k]: true,\n}\n`)
    expect(result.status).toBe("unsupported")
    expect(result.unsupportedReason).toMatch(/spread|computed/)
  })
})

describe("migrateProgrammaticSource — formatting & comment fidelity", () => {
  test("moves mac signing fields into mac.sign, preserving everything else", () => {
    const src = `export default {
  mac: {
    target: "dmg",
    hardenedRuntime: true,
    gatekeeperAssess: true,
    extendInfo: {
      NSCameraUsageDescription: "cam",
    },
  },
}
`
    const result = run(src)
    expect(result.status).toBe("migrated")
    // Compare parsed objects, not whitespace: the signing fields are grouped under mac.sign,
    // everything else is preserved, and the top-level shape is unchanged.
    // gatekeeperAssess is removed, not moved: @electron/osx-sign 2.x dropped the spctl --assess
    // step, so mac.sign.gatekeeperAssess does not exist and the schema rejects it.
    expect(objFromCjs(result.code)).toEqual({
      mac: {
        sign: {
          hardenedRuntime: true,
        },
        target: "dmg",
        extendInfo: {
          NSCameraUsageDescription: "cam",
        },
      },
    })
    expect(result.changes.some(c => c.key === "mac.gatekeeperAssess")).toBe(true)
  })

  test("preserves comments, imports, and functions on untouched code", () => {
    const src = `import { notarize } from "./notarize"

// Build configuration
export default {
  // sign on macOS
  afterSign: async ctx => {
    await notarize(ctx)
  },
  npmRebuild: true,
}
`
    const result = run(src)
    expect(result.status).toBe("migrated")
    expect(result.code).toContain(`import { notarize } from "./notarize"`)
    expect(result.code).toContain("// Build configuration")
    expect(result.code).toContain("afterSign: async ctx => {")
    expect(result.code).toContain("await notarize(ctx)")
    expect(result.code).toContain("nativeModules: {")
  })

  test("no-op when already migrated", () => {
    const src = `export default {\n  appId: "com.example.app",\n  nativeModules: {\n    npmRebuild: true,\n  },\n}\n`
    const result = run(src)
    expect(result.status).toBe("no-op")
    expect(result.code).toBe(src)
  })
})

describe("migrateProgrammaticSource — boolean inversions", () => {
  test("squirrelWindows.noMsi literal → msi inverted", () => {
    const result = run(`export default {\n  squirrelWindows: {\n    noMsi: true,\n  },\n}\n`)
    expect(result.code).toContain("msi: false")
    expect(result.code).not.toContain("noMsi")
  })

  test("npmSkipBuildFromSource with non-literal value wraps with !()", () => {
    const result = run(`export default {\n  npmSkipBuildFromSource: process.env.FROM_SOURCE !== "1",\n}\n`)
    expect(result.code).toContain(`buildDependenciesFromSource: !(process.env.FROM_SOURCE !== "1")`)
    expect(result.code).toContain("nativeModules")
  })
})

describe("migrateProgrammaticSource — per-rule coverage (CJS, drift-checked vs migrateConfig)", () => {
  const fixtures: Record<string, string> = {
    electronCompile: `module.exports = { electronCompile: true, appId: "a" }\n`,
    framework: `module.exports = { framework: "electron", nodeVersion: "current", launchUiVersion: "1.0.0" }\n`,
    nativeModules: `module.exports = { buildDependenciesFromSource: true, nodeGypRebuild: false, npmRebuild: true, nativeRebuilder: "sequential" }\n`,
    npmSkip: `module.exports = { npmSkipBuildFromSource: true }\n`,
    asarUnpack: `module.exports = { asarUnpack: ["**/*.node"] }\n`,
    asarTrue: `module.exports = { asar: true, disableAsarIntegrity: true }\n`,
    asarObject: `module.exports = { asar: { unpackDir: "foo" }, disableSanityCheckAsar: true }\n`,
    appImage: `module.exports = { appImage: { systemIntegration: "ask" } }\n`,
    appImageMixed: `module.exports = { appImage: { systemIntegration: "ask", artifactName: "x.AppImage" } }\n`,
    helperBundleId: `module.exports = { "helper-bundle-id": "com.example.helper" }\n`,
    squirrel: `module.exports = { squirrelWindows: { noMsi: true } }\n`,
    macSign: `module.exports = { mac: { identity: "Dev", hardenedRuntime: true, signIgnore: "foo" } }\n`,
    macUniversal: `module.exports = { mac: { mergeASARs: true, x64ArchFiles: "*" } }\n`,
    macSignNull: `module.exports = { mac: { sign: null, identity: "Dev" } }\n`,
    winSigntool: `module.exports = { win: { signtoolOptions: { certificateFile: "c.pfx", publisherName: "Me" } } }\n`,
    winAzure: `module.exports = { win: { azureSignOptions: { endpoint: "https://x", customField: "v" } } }\n`,
    snapBase: `module.exports = { snap: { base: "core22", confinement: "strict" } }\n`,
    snapNoBase: `module.exports = { snap: { confinement: "strict" } }\n`,
    publishGithub: `module.exports = { publish: [{ provider: "github", vPrefixedTagName: false }] }\n`,
    publishGithubGitlab: `module.exports = { publish: [{ provider: "github", vPrefixedTagName: false }, { provider: "gitlab", vPrefixedTagName: false }] }\n`,
    electronDownload: `module.exports = { electronDownload: { mirror: "https://m", isVerifyChecksum: false, cache: "/tmp" } }\n`,
    electronDownloadForce: `module.exports = { electronDownload: { force: true, mirrorOptions: { mirror: "https://m" } } }\n`,
    electronGetLegacy: `module.exports = { electronGet: { mirror: "https://m", isVerifyChecksum: false } }\n`,
    platformAsarUnpack: `module.exports = { mac: { asarUnpack: ["**/*.node"] }, win: { asar: true, asarUnpack: "x.dll" }, masDev: { asar: { smartUnpack: false }, asarUnpack: "y" } }\n`,
    platformAsarDisabled: `module.exports = { linux: { asar: false, asarUnpack: "x" }, win: { asarUnpack: "y" }, asar: false }\n`,
    rootAsarFalse: `module.exports = { asar: false, asarUnpack: "x", disableSanityCheckAsar: true }\n`,
    toolsets: `module.exports = { toolsets: { wine: null, nsis: "1.2.1", appimage: "1.0.2" } }\n`,
    nativeRebuilderLegacy: `module.exports = { nativeRebuilder: "legacy", npmRebuild: false }\n`,
    macNulls: `module.exports = { mac: { sign: null, type: null, provisioningProfile: null, identity: null, singleArchFiles: null } }\n`,
    macOnlyNulls: `module.exports = { mac: { sign: null, type: null, target: "dmg" } }\n`,
    publishTagPrefixKept: `module.exports = { publish: { provider: "github", tagNamePrefix: "release-", vPrefixedTagName: false } }\n`,
    publishTagPrefixEmpty: `module.exports = { publish: [{ provider: "github", tagNamePrefix: "" }, { provider: "github", tagNamePrefix: "", vPrefixedTagName: false }] }\n`,
    publishInTargetSection: `module.exports = { nsis: { publish: { provider: "github", vPrefixedTagName: false } }, dmg: { publish: [{ provider: "github", vPrefixedTagName: true }] } }\n`,
    snapCore24: `module.exports = { snap: { base: "core24", allowNativeWayland: true, grade: "stable" } }\n`,
    winSignAndEditFalse: `module.exports = { win: { signAndEditExecutable: false } }\n`,
    winSignDisabledLegacy: `module.exports = { win: { signExecutable: false, signtoolOptions: { certificateFile: "c.pfx" } } }\n`,
    winSignNullSigntool: `module.exports = { win: { sign: null, signtoolOptions: { certificateFile: "c.pfx" } } }\n`,
  }

  for (const [name, src] of Object.entries(fixtures)) {
    test(`${name}: migrated output deep-equals migrateConfig`, () => {
      const result = migrateProgrammaticSource(src, "electron-builder.cjs")
      expect(result.status).toBe("migrated")
      const fromCodemod = objFromCjs(result.code)
      const fromObject = migrateConfig(objFromCjs(src)).migrated
      expect(fromCodemod).toEqual(fromObject)
    })
  }
})

describe("migrateProgrammaticSource — warnings", () => {
  test("custom mac.sign function warns instead of clobbering", () => {
    const result = run(`export default {\n  mac: {\n    sign: configuration => {},\n    identity: "Dev",\n  },\n}\n`)
    expect(result.warnings.some(w => w.includes("custom signing"))).toBe(true)
    expect(result.code).toContain("identity") // not moved
  })

  test("electronDownload dropped fields warn", () => {
    const result = run(`export default {\n  electronDownload: {\n    cache: "/tmp",\n    mirror: "https://m",\n  },\n}\n`)
    expect(result.warnings.some(w => w.includes("cache"))).toBe(true)
    expect(result.code).toContain("electronGet")
    expect(result.code).toContain("mirrorOptions")
  })
})

describe("migrateProgrammaticSource — v27 audit rules that stay manual", () => {
  // A platform-level asar replaces the root one in v27; copying the root options into it is left to the user.
  test("platform asarUnpack next to root-level asar options warns instead of rewriting", () => {
    const result = run(`module.exports = { asarUnpack: "root/**", mac: { asarUnpack: "m/**" } }\n`)
    expect(result.warnings.some(w => w.startsWith("mac.asar:"))).toBe(true)
    expect(objFromCjs(result.code).mac).toEqual({ asarUnpack: "m/**" })
  })

  test("shorthand or non-literal asar values are never rewritten", () => {
    const result = run(`const asar = { smartUnpack: false }\nmodule.exports = { asar, mac: { asarUnpack: "m/**" } }\n`)
    expect(result.warnings.some(w => w.startsWith("mac.asar:"))).toBe(true)
    expect(result.code).toContain(`mac: { asarUnpack: "m/**" }`)
  })

  test("squirrelWindows.customSquirrelVendorDir warns and is left in place", () => {
    const src = `module.exports = { squirrelWindows: { customSquirrelVendorDir: "./vendor" } }\n`
    const result = run(src)
    expect(result.status).toBe("no-op")
    expect(result.code).toBe(src)
    expect(result.warnings.some(w => w.includes("toolsets.squirrel"))).toBe(true)
  })

  test("asar: true change log distinguishes a populated replacement from a removal", () => {
    const replaced = run(`module.exports = { asar: true, asarUnpack: "**/*.node" }\n`).changes.find(c => c.key === "asar")
    expect(replaced?.description).toBe("replaced asar: true with an asar object carrying unpack")
    const removed = run(`module.exports = { asar: true }\n`).changes.find(c => c.key === "asar")
    expect(removed?.description).toContain("removed redundant asar: true")
  })

  test("mac config without entitlements emits the entitlements advisory", () => {
    expect(run(`module.exports = { mac: { target: "dmg" } }\n`).advisories.some(a => a.includes("allow-jit"))).toBe(true)
    expect(run(`module.exports = { mac: { entitlements: "build/e.plist" } }\n`).advisories).toHaveLength(0)
    expect(run(`module.exports = { mac: { sign: "./customSign.js" } }\n`).advisories).toHaveLength(0)
    expect(run(`module.exports = { mac: { identity: null } }\n`).advisories).toHaveLength(0)
  })
})

describe("migrateProgrammaticSource — nsis-web advisory", () => {
  test("nsis-web-only config is a no-op but still emits the advisory (code unchanged)", () => {
    const source = `export default {\n  win: { target: "nsis-web" },\n}\n`
    const result = run(source)
    expect(result.status).toBe("no-op")
    expect(result.advisories).toHaveLength(1)
    expect(result.advisories[0]).toMatch(/nsis-web/)
    expect(result.advisories[0]).toMatch(/disableWebInstaller = false/)
    expect(result.code).toBe(source)
  })

  test("advisory is emitted alongside a real migration (status 'migrated')", () => {
    const result = run(`export default {\n  electronCompile: true,\n  win: { target: "nsis-web" },\n}\n`)
    expect(result.status).toBe("migrated")
    expect(result.advisories).toHaveLength(1)
    expect(result.code).not.toContain("electronCompile")
  })

  test("array target form is detected", () => {
    const result = run(`export default {\n  win: { target: ["nsis", "nsis-web"] },\n}\n`)
    expect(result.advisories).toHaveLength(1)
  })

  test("object target form is detected", () => {
    const result = run(`export default {\n  win: { target: [{ target: "nsis-web", arch: "x64" }] },\n}\n`)
    expect(result.advisories).toHaveLength(1)
  })

  test("non-web target yields no advisory", () => {
    const result = run(`export default {\n  win: { target: "nsis" },\n}\n`)
    expect(result.advisories).toHaveLength(0)
    expect(result.status).toBe("no-op")
  })

  test("an ':arch' suffix, any letter case and a nested { target } are detected", () => {
    expectAdvisories(`{ win: { target: "nsis-web:ia32" } }`, [NSIS_WEB_ADVISORY])
    expectAdvisories(`{ win: { target: [{ target: "NSIS-Web", arch: "x64" }] } }`, [NSIS_WEB_ADVISORY])
    expectAdvisories(`{ target: { target: ["nsis-web"] } }`, [NSIS_WEB_ADVISORY])
  })

  test("a spread or computed key before win.target does not hide it; one after it may override it", () => {
    expectAdvisories(`{ win: { ...base, target: "nsis-web" } }`, [NSIS_WEB_ADVISORY], "const base = {}\n")
    expectAdvisories(`{ win: { [key]: "nsis", target: "nsis-web" } }`, [NSIS_WEB_ADVISORY], `const key = "target"\n`)
    expectAdvisories(`{ win: { target: "nsis-web", ...base } }`, [], "const base = {}\n")
    expectAdvisories(`{ win: { target: "nsis-web", [key]: "nsis" } }`, [], `const key = "target"\n`)
  })
})

describe("migrateProgrammaticSource — updater advisories", () => {
  test.each<[string, string[]]>([
    [`module.exports = { nsis: { perMachine: true } }\n`, [NSIS_PER_MACHINE_UPDATE_ADVISORY]],
    [`export default {\n  win: { sign: { type: "signtool", sign: "./sign.js" } },\n}\n`, [WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY]],
    [`export default {\n  publish: { provider: "generic", url: "https://u.example.com/?t=1" },\n}\n`, [FEED_QUERY_ADVISORY]],
  ])("an advisory-only config is a no-op and the code is unchanged: %s", (src, expected) => {
    const result = run(src)
    expect(result.status).toBe("no-op")
    expect(result.code).toBe(src)
    expect(result.advisories).toEqual(expected)
  })

  describe("per-machine NSIS", () => {
    test.each([`{ nsis: { oneClick: false, perMachine: true } }`, `{ nsisWeb: { perMachine: true } }`, `{ nsis: { perMachine: (true) }, nsisWeb: { perMachine: true } }`])(
      "%s emits the advisory",
      body => expectAdvisories(body, [NSIS_PER_MACHINE_UPDATE_ADVISORY])
    )

    test.each([`{ nsis: { perMachine: false }, nsisWeb: { perMachine: false } }`, `{ win: { target: "nsis" }, nsis: { oneClick: false } }`, `{ nsis: { perMachine: "true" } }`])(
      "%s emits nothing",
      body => expectAdvisories(body, [])
    )

    test("a non-literal perMachine, or one a later spread may override, is not read", () => {
      expectAdvisories(`{ nsis: { perMachine: process.env.PER_MACHINE === "1" } }`, [])
      expectAdvisories(`{ nsis: { perMachine } }`, [], "const perMachine = true\n")
      expectAdvisories(`{ nsisWeb: { perMachine: true, ...base } }`, [], "const base = {}\n")
      expectAdvisories(`{ nsisWeb: { ...base, perMachine: true } }`, [NSIS_PER_MACHINE_UPDATE_ADVISORY], "const base = {}\n")
      expectAdvisories(`{ nsis: options }`, [], "const options = { perMachine: true }\n")
    })
  })

  describe("custom Windows signing hook without publisherName", () => {
    test.each([
      `{ win: { sign: { type: "signtool", sign: "./sign.js" } } }`,
      `{ win: { sign: { type: "hsm", cryptoServiceProvider: "p", keyContainer: "k", sign: "./sign.js" } } }`,
      `{ win: { sign: { type: "pkcs11", pkcs11Module: "/m.so", pkcs11KeyUri: "pkcs11:object=k", sign: "./sign.js" } } }`,
      `{ win: { sign: { type: "signtool", sign: "./sign.js", certificateFile: null }, verifyUpdateCodeSignature: true } }`,
      `{ cscLink: "c.pfx", win: { sign: { type: "hsm", cryptoServiceProvider: "p", keyContainer: "k", sign: "./sign.js" } } }`,
      // a certificate in the config doesn't suppress it: a hook always needs publisherName
      `{ win: { sign: { type: "signtool", sign: "./sign.js", certificateFile: "c.pfx" } } }`,
      `{ win: { sign: { type: "signtool", sign: "./sign.js", certificateSubjectName: "Acme" } } }`,
      `{ win: { sign: { type: "hsm", cryptoServiceProvider: "p", keyContainer: "k", sign: "./sign.js", certificateSha1: "ABCDEF" } } }`,
      `{ win: { sign: { type: "signtool", sign: "./sign.js" }, cscLink: "c.pfx" } }`,
      `{ cscLink: "c.pfx", win: { sign: { type: "signtool", sign: "./sign.js" } } }`,
    ])("%s emits the advisory", body => expectAdvisories(body, [WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY]))

    test.each([
      `{ win: { sign: { type: "signtool", sign: "./sign.js", publisherName: "CN=Acme" } } }`,
      `{ win: { sign: { type: "signtool", sign: "./sign.js", publisherName: ["CN=Old", "CN=New"] } } }`,
      `{ win: { sign: { type: "signtool", sign: "./sign.js", publisherName: null } } }`,
      `{ win: { sign: { type: "signtool", sign: "./sign.js" }, verifyUpdateCodeSignature: false } }`,
      `{ win: { sign: { type: "signtool", sign: "./sign.js", certificateFile: "c.pfx", publisherName: "CN=Acme" } } }`,
      `{ win: { sign: { type: "signtool", sign: null } } }`,
      `{ win: { sign: { type: "signtool" } } }`,
      `{ win: { sign: false } }`,
    ])("%s emits nothing", body => expectAdvisories(body, []))

    test("a v26 win.signtoolOptions.sign hook emits the advisory, and so does the migrated output", () => {
      for (const src of [
        `module.exports = { win: { signtoolOptions: { sign: "./sign.js", signingHashAlgorithms: ["sha256"] } } }\n`,
        `export default {\n  win: {\n    sign: null,\n    signtoolOptions: {\n      sign: "./sign.js",\n    },\n  },\n}\n`,
      ]) {
        const result = run(src)
        expect(result.status).toBe("migrated")
        expect(result.advisories).toEqual([WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY])
        expect(run(result.code).advisories).toEqual([WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY])
      }
    })

    test("a v26 hook is not flagged when signing was disabled, it has a publisherName, or win.sign is already set", () => {
      expectAdvisories(`{ win: { signExecutable: false, signtoolOptions: { sign: "./sign.js" } } }`, [])
      expectAdvisories(`{ win: { signAndEditExecutable: false, signtoolOptions: { sign: "./sign.js" } } }`, [])
      expectAdvisories(`{ win: { signtoolOptions: { sign: "./sign.js", publisherName: "CN=Acme" } } }`, [])
      // a cscLink doesn't suppress it
      expectAdvisories(`{ cscLink: "c.pfx", win: { signtoolOptions: { sign: "./sign.js", type: "hsm" } } }`, [WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY])
      expectAdvisories(`{ win: { sign: { type: "signtool", certificateFile: "c.pfx" }, signtoolOptions: { sign: "./sign.js" } } }`, [])
      // an unknown string-valued azureSignOptions field moves into additionalMetadata, and Azure wins over signtoolOptions
      expectAdvisories(`{ win: { azureSignOptions: { endpoint: "https://e/", sign: "./sign.js" } } }`, [])
      expectAdvisories(`{ win: { azureSignOptions: { endpoint: "https://e/" }, signtoolOptions: { sign: "./sign.js" } } }`, [])
    })

    test.each(["sign", "sign: customSign", "sign: async configuration => {}", "sign(configuration) {}", `sign: require("./sign")`, "sign: `./sign-${process.platform}.js`"])(
      "a function, imported or computed hook (%s) counts as a hook",
      hook => {
        const prelude = `const sign = require("./sign")\nconst customSign = sign\n`
        expectAdvisories(`{ win: { sign: { type: "signtool", ${hook} } } }`, [WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY], prelude)
        expectAdvisories(`{ win: { signtoolOptions: { ${hook} } } }`, [WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY], prelude)
      }
    )

    test("non-literal values that may suppress the advisory are not flagged", () => {
      const hook = `sign: "./sign.js"`
      expectAdvisories(`{ win: { sign: { type: "signtool", ${hook}, publisherName: process.env.PUBLISHER } } }`, [])
      expectAdvisories(`{ win: { sign: { type: "signtool", ${hook} }, verifyUpdateCodeSignature: !process.env.DEV } }`, [])
      expectAdvisories(`{ win: { sign: { ...base, type: "signtool", ${hook} } } }`, [], "const base = {}\n")
      expectAdvisories(`{ win: { sign: { type: "signtool", ${hook}, ...base } } }`, [], "const base = {}\n")
      expectAdvisories(`{ win: { ...base, sign: { type: "signtool", ${hook} } } }`, [], "const base = {}\n")
      expectAdvisories(`{ win: { sign: { type: "signtool", ${hook} }, ...base } }`, [], "const base = {}\n")
      expectAdvisories(`{ win: { sign: signConfig } }`, [], `const signConfig = { type: "signtool", ${hook} }\n`)
      expectAdvisories(`{ win: { signExecutable: process.env.SIGN === "1", signtoolOptions: { ${hook} } } }`, [])
      // a certificate or cscLink, literal or not, doesn't suppress it, and neither does a non-literal type
      expectAdvisories(`{ win: { sign: { type: "signtool", ${hook}, certificateFile: process.env.CERT_FILE } } }`, [WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY])
      expectAdvisories(`{ cscLink: process.env.CSC_LINK, win: { sign: { type: "signtool", ${hook} } } }`, [WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY])
      expectAdvisories(`{ cscLink: "c.pfx", win: { sign: { type: signType, ${hook} } } }`, [WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY], `const signType = "signtool"\n`)
      expectAdvisories(`{ win: { sign: { type: signType, ${hook} } } }`, [WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY], `const signType = "signtool"\n`)
    })

    test("an undefined value counts as absent, as it does for migrateConfig", () => {
      expectAdvisories(`{ win: { sign: { type: "signtool", sign: undefined } } }`, [])
      expectAdvisories(
        `{ cscLink: undefined, win: { sign: { type: "signtool", sign: "./sign.js", publisherName: undefined, certificateFile: undefined }, verifyUpdateCodeSignature: undefined } }`,
        [WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY]
      )
      expectAdvisories(`{ win: { sign: undefined, signExecutable: undefined, azureSignOptions: undefined, signtoolOptions: { sign: "./sign.js" } } }`, [
        WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY,
      ])
    })
  })

  describe("generic publish url with a query string", () => {
    test.each([
      `{ publish: { provider: "generic", url: "https://u.example.com/?token=t" } }`,
      `{ publish: [{ provider: "github", owner: "o", repo: "r" }, { provider: "generic", url: "https://u.example.com/feed?key=k" }] }`,
      `{ win: { publish: { provider: "generic", url: "https://u.example.com/win?key=k" } } }`,
      `{ nsis: { publish: [{ provider: "generic", url: "https://u.example.com/?key=k" }] } }`,
      `{ linux: { publish: [{ provider: "generic", url: "https://u.example.com/?key=\${env.KEY}" }] } }`,
      `{ snap: { base: "custom", publish: { provider: "generic", url: "https://u.example.com/?key=k" } } }`,
    ])("%s emits the advisory", body => expectAdvisories(body, [FEED_QUERY_ADVISORY]))

    test.each([
      `{ publish: { provider: "generic", url: "https://u.example.com/app" } }`,
      `{ publish: { provider: "generic" } }`,
      `{ publish: ["github", "generic"] }`,
      `{ publish: null, win: { publish: [null] } }`,
      `{ publish: [{ provider: "s3", bucket: "b", endpoint: "https://s3.example.com/?x=1" }, { provider: "custom", url: "https://u.example.com/?t=1" }] }`,
      // a v26 snap moves under snapcraft.<base>, where migrateConfig does not look
      `{ snap: { base: "core22", publish: { provider: "generic", url: "https://u.example.com/?key=k" } } }`,
    ])("%s emits nothing", body => expectAdvisories(body, []))

    test("a non-literal url or provider is not read; a '?' in a template's static text is", () => {
      expectAdvisories('{ publish: { provider: "generic", url: `https://u.example.com/?token=${process.env.TOKEN}` } }', [FEED_QUERY_ADVISORY])
      expectAdvisories('{ publish: { provider: "generic", url: `${process.env.FEED_URL}/app` } }', [])
      expectAdvisories(`{ publish: { provider: "generic", url: process.env.FEED_URL } }`, [])
      expectAdvisories(`{ publish: { provider, url: "https://u.example.com/?t=1" } }`, [], `const provider = "generic"\n`)
      expectAdvisories(`{ publish: { provider: "generic", url: "https://u.example.com/?t=1", ...base } }`, [], "const base = {}\n")
      expectAdvisories(`{ publish: { ...base, provider: "generic", url: "https://u.example.com/?t=1" } }`, [FEED_QUERY_ADVISORY], "const base = {}\n")
      expectAdvisories(`{ win: { publish: { provider: "generic", url: "https://u.example.com/?t=1" }, ...base } }`, [], "const base = {}\n")
      expectAdvisories(`{ win: { ...base, publish: { provider: "generic", url: "https://u.example.com/?t=1" } } }`, [FEED_QUERY_ADVISORY], "const base = {}\n")
      // a custom-base snap whose spread may carry a publish may replace snapcraft.publish
      const snapcraft = `snapcraft: { publish: { provider: "generic", url: "https://u.example.com/?t=1" } }`
      expectAdvisories(`{ snap: { base: "custom", ...base }, ${snapcraft} }`, [], "const base = {}\n")
      expectAdvisories(`{ snap: { ...base, base: "custom", publish: { provider: "github" } }, ${snapcraft} }`, [], "const base = {}\n")
      expectAdvisories(`{ publish: [...base, { provider: "generic", url: "https://u.example.com/?t=1" }] }`, [FEED_QUERY_ADVISORY], "const base = []\n")
    })
  })
})

describe("migrateProgrammaticSource — advisories match migrateConfig (parity)", () => {
  const hook = { type: "signtool", sign: "./sign.js" }
  const feed = { provider: "generic", url: "https://u.example.com/?token=t" }
  const configs: Record<string, Record<string, any>> = {
    empty: {},
    allFive: { win: { target: "nsis-web", sign: hook }, nsisWeb: { perMachine: true }, mac: { target: "dmg" }, publish: feed },
    nsisWebWinTarget: { win: { target: "nsis-web" } },
    nsisWebRootTarget: { target: "nsis-web" },
    nsisWebArchAndCase: { win: { target: ["nsis", { target: "NSIS-Web:ia32" }] } },
    nsisWebNestedObject: { win: { target: { target: ["nsis-web"] } } },
    nsisWebUnderLinux: { linux: { target: "nsis-web" } },
    nsisOnly: { win: { target: "nsis" } },
    nsisWebNullAndDeepObject: { win: { target: [null, { target: { target: "nsis-web" } }] } },
    macDefault: { mac: { target: "dmg" } },
    macV26Entitlements: { mac: { entitlements: "build/e.plist" } },
    macV27Entitlements: { mas: { sign: { entitlements: "build/e.plist" } } },
    macIdentityNull: { masDev: { identity: null } },
    nsisPerMachine: { win: { target: "nsis" }, nsis: { perMachine: true } },
    nsisWebPerMachine: { nsisWeb: { perMachine: true } },
    perMachineFalse: { nsis: { perMachine: false }, nsisWeb: { perMachine: false } },
    perMachineString: { nsis: { perMachine: "true" } },
    perMachineNsisNull: { nsis: null, nsisWeb: { perMachine: true } },
    perMachineUnderWin: { win: { nsis: { perMachine: true } } },
    hookSigntool: { win: { sign: hook } },
    hookHsm: { win: { sign: { type: "hsm", cryptoServiceProvider: "p", keyContainer: "k", sign: "./sign.js" } } },
    hookPkcs11: { win: { sign: { type: "pkcs11", pkcs11Module: "/m.so", pkcs11KeyUri: "pkcs11:object=k", sign: "./sign.js" } } },
    hookNoType: { cscLink: "c.pfx", win: { sign: { sign: "./sign.js" } } },
    hookVerifyTrue: { win: { sign: hook, verifyUpdateCodeSignature: true } },
    hookVerifyFalse: { win: { sign: hook, verifyUpdateCodeSignature: false } },
    hookPublisherName: { win: { sign: { ...hook, publisherName: "CN=Acme" } } },
    hookPublisherNameNull: { win: { sign: { ...hook, publisherName: null } } },
    hookPublisherNameArray: { win: { sign: { ...hook, publisherName: ["CN=Old", "CN=New"] } } },
    hookCertificateFile: { win: { sign: { ...hook, certificateFile: "c.pfx" } } },
    hookCertificateFileNull: { win: { sign: { ...hook, certificateFile: null } } },
    hookCertificateSubjectName: { win: { sign: { ...hook, certificateSubjectName: "Acme" } } },
    hookCertificateSha1: { win: { sign: { ...hook, certificateSha1: "ABCDEF" } } },
    hookWinCscLink: { win: { sign: hook, cscLink: "c.pfx" } },
    hookRootCscLink: { cscLink: "c.pfx", win: { sign: hook } },
    hookRootCscLinkNull: { cscLink: null, win: { sign: hook } },
    hookRootCscLinkHsm: { cscLink: "c.pfx", win: { sign: { type: "hsm", cryptoServiceProvider: "p", keyContainer: "k", sign: "./sign.js" } } },
    hookNull: { win: { sign: { type: "signtool", sign: null } } },
    hookNumber: { win: { sign: { type: "signtool", sign: 1 } } },
    signFalse: { win: { sign: false } },
    signNull: { win: { sign: null } },
    v26Signtool: { win: { signtoolOptions: { sign: "./sign.js", signingHashAlgorithms: ["sha256"] } } },
    v26SigntoolPublisherName: { win: { signtoolOptions: { sign: "./sign.js", publisherName: "CN=Acme" } } },
    v26SigntoolTypeForced: { cscLink: "c.pfx", win: { signtoolOptions: { sign: "./sign.js", type: "hsm" } } },
    v26SignNull: { win: { sign: null, signtoolOptions: { sign: "./sign.js" } } },
    v26SignExecutableFalse: { win: { signExecutable: false, signtoolOptions: { sign: "./sign.js" } } },
    v26SignAndEditFalse: { win: { signAndEditExecutable: false, signtoolOptions: { sign: "./sign.js" } } },
    v26SignExecutableTrue: { win: { signExecutable: true, signtoolOptions: { sign: "./sign.js" } } },
    v26SignExecutableFalseV27Sign: { win: { signExecutable: false, sign: hook } },
    v26SignAlreadySet: { win: { sign: { type: "signtool", certificateFile: "c.pfx" }, signtoolOptions: { sign: "./sign.js" } } },
    v26AzureStringHook: { win: { azureSignOptions: { endpoint: "https://e/", sign: "./sign.js" } } },
    v26AzureWinsOverSigntool: { win: { azureSignOptions: { endpoint: "https://e/" }, signtoolOptions: { sign: "./sign.js" } } },
    v26AzureNull: { win: { azureSignOptions: null, signtoolOptions: { sign: "./sign.js" } } },
    v26SignFalse: { win: { sign: false, signtoolOptions: { sign: "./sign.js" } } },
    v26SignTrue: { win: { sign: true, signtoolOptions: { sign: "./sign.js" } } },
    v26SignSetIgnoresLegacyPublisherName: { win: { sign: { sign: "./sign.js" }, signtoolOptions: { publisherName: "CN=Acme" } } },
    v26WinCscLink: { win: { signtoolOptions: { sign: "./sign.js" }, cscLink: "c.pfx" } },
    v26SignExecutableNull: { win: { signExecutable: null, signtoolOptions: { sign: "./sign.js" } } },
    v26Undefined: { win: { sign: undefined, signExecutable: undefined, azureSignOptions: undefined, signtoolOptions: { sign: "./sign.js" } } },
    hookAzureType: { win: { sign: { type: "azure", sign: "./sign.js" } } },
    hookEmptyString: { win: { sign: { sign: "" } } },
    hookPublisherNameEmpty: { win: { sign: { sign: "./sign.js", publisherName: "" } } },
    hookVerifyString: { win: { sign: hook, verifyUpdateCodeSignature: "false" } },
    hookUndefined: { win: { sign: { type: "signtool", sign: undefined } } },
    hookUndefinedSuppressors: { cscLink: undefined, win: { sign: { ...hook, publisherName: undefined, certificateFile: undefined }, verifyUpdateCodeSignature: undefined } },
    feedRootObject: { publish: feed },
    feedRootArray: { publish: [{ provider: "github", owner: "o", repo: "r" }, feed] },
    feedPlatform: { mac: { entitlements: "e.plist", publish: feed } },
    feedTargetSection: { nsis: { publish: [feed] } },
    feedMacro: { linux: { publish: [{ provider: "generic", url: "https://u.example.com/?key=${env.KEY}" }] } },
    feedNoQuery: { publish: { provider: "generic", url: "https://u.example.com/app" } },
    feedNoUrl: { publish: { provider: "generic" } },
    feedStrings: { publish: ["github", "generic"] },
    feedNulls: { publish: null, win: { publish: [null] } },
    feedOtherProviders: {
      publish: [
        { provider: "s3", endpoint: "https://s3.example.com/?x=1" },
        { provider: "custom", url: "https://u.example.com/?t=1" },
      ],
    },
    feedSnapCore22: { snap: { base: "core22", publish: feed } },
    feedSnapNoBase: { snap: { publish: feed } },
    feedSnapCustom: { snap: { base: "custom", publish: feed } },
    feedSnapCustomKeepsSnapcraft: { snap: { base: "custom" }, snapcraft: { publish: feed } },
    feedSnapCustomReplacesSnapcraft: { snap: { base: "custom", publish: { provider: "github" } }, snapcraft: { publish: feed } },
    feedSnapcraftNextToSnap: { snap: { base: "core22" }, snapcraft: { publish: feed } },
    feedSnapNotObject: { snap: "x", snapcraft: { publish: feed } },
    feedSnapCustomPublishNull: { snap: { base: "custom", publish: null }, snapcraft: { publish: feed } },
    feedSnapCustomPublishUndefined: { snap: { base: "custom", publish: undefined }, snapcraft: { publish: feed } },
    feedSnapcraftBaseSection: { snapcraft: { core22: { publish: feed } } },
    feedAnySection: { directories: { output: "dist" }, extraMetadata: { publish: feed } },
    feedNestedArray: { publish: [[feed]] },
    feedProviderCase: { publish: { provider: "Generic", url: feed.url } },
    v26AllButEntitlements: {
      snap: { base: "custom", publish: feed },
      win: { signtoolOptions: { sign: "./sign.js" }, target: "nsis-web:x64", signExecutable: true },
      nsisWeb: { perMachine: true },
      mac: { target: "dmg", entitlements: "e.plist", hardenedRuntime: true },
      asarUnpack: ["x"],
    },
  }

  /** JS source for `config`, keeping the `undefined` values that JSON.stringify drops. */
  const toSource = (config: Record<string, any>) =>
    JSON.stringify(config, (_key, value) => (value === undefined ? "__undefined__" : value), 2).replace(/"__undefined__"/g, "undefined")

  test.each(Object.entries(configs))("%s", (_name, config) => {
    expectAdvisories(toSource(config), migrateConfig(config).advisories)
  })

  test.each<[string, (body: string) => string, string]>([
    ["export =", body => `export = ${body}\n`, "electron-builder.ts"],
    ["exports.default", body => `exports.default = ${body}\n`, "electron-builder.js"],
    ["a const with satisfies", body => `const config = ${body} satisfies Configuration\nexport default config\n`, "electron-builder.ts"],
    ["an async arrow function", body => `module.exports = async () => (${body})\n`, "electron-builder.js"],
    ["a function with a single return", body => `export default function () {\n  return ${body}\n}\n`, "electron-builder.mts"],
    ["build({ config })", body => `import { build } from "electron-builder"\nawait build({ config: ${body} })\n`, "build.mjs"],
  ])("the whole table gives the same advisories through %s", (_form, wrap, fileName) => {
    for (const [name, config] of Object.entries(configs)) {
      expect({ name, advisories: run(wrap(toSource(config)), fileName).advisories }).toEqual({ name, advisories: migrateConfig(config).advisories })
    }
  })

  test("the table triggers and skips every advisory", () => {
    const results = Object.values(configs).map(config => migrateConfig(config).advisories)
    for (const advisory of [NSIS_WEB_ADVISORY, MAC_ENTITLEMENTS_ADVISORY, NSIS_PER_MACHINE_UPDATE_ADVISORY, WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY, FEED_QUERY_ADVISORY]) {
      expect(results.some(it => it.includes(advisory))).toBe(true)
      expect(results.some(it => !it.includes(advisory))).toBe(true)
    }
    expect(results.find(it => it.length === 5)).toEqual([
      NSIS_WEB_ADVISORY,
      MAC_ENTITLEMENTS_ADVISORY,
      NSIS_PER_MACHINE_UPDATE_ADVISORY,
      WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY,
      FEED_QUERY_ADVISORY,
    ])
  })
})

describe("migrateProgrammaticSource — removed customNsisBinary / customNsisResources", () => {
  const url = "https://downloads.example.com/nsisbi.7z?token=s3cr3t-token"
  const checksum = "374cfc092fd1bd1898472df627549ecc165b0d6ba88e82deba085673aec95336"

  test("debugLogging moves to installerDebugLogging and the emptied customNsisBinary is removed", () => {
    const result = run(`module.exports = {\n  nsis: {\n    customNsisBinary: { url: null, debugLogging: true },\n    oneClick: false,\n  },\n}\n`, "electron-builder.cjs")
    expect(result.status).toBe("migrated")
    expect(result.code).toBe(`module.exports = {\n  nsis: {\n    installerDebugLogging: true,\n    oneClick: false,\n  },\n}\n`)
    expect(result.warnings).toHaveLength(0)
  })

  test("a custom bundle is kept and reported without its values; debugLogging still moves", () => {
    const src = `export default {\n  nsisWeb: {\n    customNsisBinary: {\n      url: "${url}",\n      checksum: "${checksum}",\n      debugLogging: true,\n    },\n  },\n}\n`
    const result = run(src)
    expect(result.code).toBe(
      `export default {\n  nsisWeb: {\n    installerDebugLogging: true,\n    customNsisBinary: {\n      url: "${url}",\n      checksum: "${checksum}",\n    },\n  },\n}\n`
    )
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain("`nsisWeb.customNsisBinary` was replaced by `toolsets.nsis`")
    expect(result.warnings[0]).not.toContain(url)
    expect(result.warnings[0]).not.toContain(checksum)
  })

  test("customNsisResources and a non-literal customNsisBinary are kept and reported; nothing is rewritten", () => {
    const src = `const bin = require("./nsis-bin.json")\nmodule.exports = { nsis: { customNsisBinary: bin }, portable: { customNsisResources: { url: "${url}", checksum: "${checksum}", version: "1" } } }\n`
    const result = run(src, "electron-builder.cjs")
    expect(result.status).toBe("no-op")
    expect(result.code).toBe(src)
    expect(result.warnings.map(w => w.split("\n")[0])).toEqual([
      "`nsis.customNsisBinary` was replaced by `toolsets.nsis` and `nsis.installerDebugLogging` in electron-builder v27.",
      "`portable.customNsisResources` was replaced by `toolsets.nsis` in electron-builder v27.",
    ])
  })

  test("portable debugLogging is dropped with a warning; null keys are removed; a spread is not mistaken for the key", () => {
    const result = run(
      `const shared = {}\nmodule.exports = {\n  portable: {\n    ...shared,\n    customNsisBinary: { debugLogging: true },\n  },\n  nsisWeb: {\n    ...shared,\n    customNsisResources: null,\n  },\n}\n`
    )
    expect(result.code).toBe(`const shared = {}\nmodule.exports = {\n  portable: {\n    ...shared,\n  },\n  nsisWeb: {\n    ...shared,\n  },\n}\n`)
    expect(result.warnings).toEqual([PORTABLE_DEBUG_LOGGING_DROPPED])
  })
})
