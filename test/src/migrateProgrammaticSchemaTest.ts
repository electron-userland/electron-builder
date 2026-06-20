import { describe, expect, test } from "vitest"
import { migrateConfig } from "../../packages/electron-builder/src/cli/migrate-schema"
import { loadTypeScript, migrateProgrammaticSource } from "../../packages/electron-builder/src/cli/migrate-schema-programmatic"

function run(source: string, fileName = "electron-builder.ts") {
  return migrateProgrammaticSource(source, fileName)
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
    expect(objFromCjs(result.code)).toEqual({
      mac: {
        sign: {
          hardenedRuntime: true,
          gatekeeperAssess: true,
        },
        target: "dmg",
        extendInfo: {
          NSCameraUsageDescription: "cam",
        },
      },
    })
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
    electronDownload: `module.exports = { electronDownload: { mirror: "https://m", isVerifyChecksum: false, cache: "/tmp" } }\n`,
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
