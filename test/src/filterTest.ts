import { FilterStats } from "builder-util"
import {
  collectExplicitReincludes,
  DEFAULT_EXCLUDED_EXTENSIONS,
  DEFAULT_EXCLUDED_NAMES,
  FileMatcher,
  getDefaultIgnoredPatterns,
  getFileMatchers,
  GetFileMatchersOptions,
  getMainFileMatchers,
} from "app-builder-lib/internal"
import * as path from "path"

// ---------------------------------------------------------------------------
// Stat mocks
// ---------------------------------------------------------------------------

function fileStat(): FilterStats {
  return { isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false } as unknown as FilterStats
}

function dirStat(): FilterStats {
  return { isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false } as unknown as FilterStats
}

const noMacro = (s: string) => s

// ---------------------------------------------------------------------------
// minimatch partial-match regression (10.2.3 bug)
// ---------------------------------------------------------------------------

/**
 * Critical regression: minimatch 10.2.3's #matchGlobstar returned `sawSome`
 * (false) instead of `partial || sawSome` (true) when a directory was checked
 * against a pattern like build/app/**\/*.js, so the walker skipped the directory
 * entirely. minimatch >=10.2.5 fixes this.
 */
describe("createFilter – build/app/**/* partial directory matching (test-app-build-sub regression)", () => {
  const src = "/app"

  const matcher = new FileMatcher(src, "/out", noMacro, [
    "!**/node_modules/**",
    "!build{,/**/*}",
    "!build/dist{,/**/*}",
    "build/app/**/*.js",
    "build/app/**/*.html",
    "!build/dist/*-unpacked{,/**/*}",
    "package.json",
    "!**/*.{iml,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,suo,xproj,cc,d.ts,mk,a,o,obj,forge-meta,pdb}",
    "!**/._*",
    "!**/electron-builder.{yaml,yml,json,json5,toml,ts}",
  ])
  const filter = matcher.createFilter()

  test("includes build/app/main.js (file)", ({ expect }) => {
    expect(filter("/app/build/app/main.js", fileStat())).toBe(true)
  })

  test("includes build/app/index.html (file)", ({ expect }) => {
    expect(filter("/app/build/app/index.html", fileStat())).toBe(true)
  })

  test("includes build/app directory (partial match for traversal)", ({ expect }) => {
    expect(filter("/app/build/app", dirStat())).toBe(true)
  })

  test("includes build directory (partial match for traversal)", ({ expect }) => {
    expect(filter("/app/build", dirStat())).toBe(true)
  })

  test("excludes build/dist directory", ({ expect }) => {
    expect(filter("/app/build/dist", dirStat())).toBe(false)
  })

  test("excludes files not matching the include patterns (e.g. css)", ({ expect }) => {
    expect(filter("/app/build/app/styles.css", fileStat())).toBe(false)
  })

  test("includes package.json", ({ expect }) => {
    expect(filter("/app/package.json", fileStat())).toBe(true)
  })
})

describe("createFilter – ** matching zero path segments", () => {
  const src = "/root"
  const matcher = new FileMatcher(src, "/out", noMacro, ["a/**/*.js"])
  const filter = matcher.createFilter()

  test("a/b.js matches a/**/*.js (** matches zero segments)", ({ expect }) => {
    expect(filter("/root/a/b.js", fileStat())).toBe(true)
  })

  test("a/sub/b.js matches a/**/*.js (** matches one segment)", ({ expect }) => {
    expect(filter("/root/a/sub/b.js", fileStat())).toBe(true)
  })

  test("a directory is traversable (partial match)", ({ expect }) => {
    expect(filter("/root/a", dirStat())).toBe(true)
  })

  test("a/sub directory is traversable (partial match)", ({ expect }) => {
    expect(filter("/root/a/sub", dirStat())).toBe(true)
  })

  test("b/c.js does not match a/**/*.js", ({ expect }) => {
    expect(filter("/root/b/c.js", fileStat())).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// FileMatcher – constructor / normalizePattern
// ---------------------------------------------------------------------------

describe("FileMatcher – constructor", () => {
  test("strips trailing slash from from/to", ({ expect }) => {
    const m = new FileMatcher("/app/", "/out/", noMacro)
    expect(m.from).toBe(path.normalize("/app"))
    expect(m.to).toBe(path.normalize("/out"))
  })

  test("expands macros in from/to", ({ expect }) => {
    const expand = (s: string) => s.replace("${platform}", "linux")
    const m = new FileMatcher("/app/${platform}", "/out/${platform}", expand)
    expect(m.from).toBe(path.normalize("/app/linux"))
    expect(m.to).toBe(path.normalize("/out/linux"))
  })

  test("normalizePattern strips leading ./", ({ expect }) => {
    const m = new FileMatcher("/app", "/out", noMacro, ["./src/index.js"])
    expect(m.patterns).toEqual(["src/index.js"])
  })

  test("normalizePattern expands macros inside patterns", ({ expect }) => {
    const expand = (s: string) => s.replace("${env.NAME}", "foo")
    const m = new FileMatcher("/app", "/out", expand, ["dist/${env.NAME}/**"])
    expect(m.patterns).toEqual(["dist/foo/**"])
  })

  test("isSpecifiedAsEmptyArray is true for []", ({ expect }) => {
    const m = new FileMatcher("/app", "/out", noMacro, [])
    expect(m.isSpecifiedAsEmptyArray).toBe(true)
  })

  test("isSpecifiedAsEmptyArray is false for null", ({ expect }) => {
    const m = new FileMatcher("/app", "/out", noMacro, null)
    expect(m.isSpecifiedAsEmptyArray).toBe(false)
  })

  test("isSpecifiedAsEmptyArray is false for non-empty array", ({ expect }) => {
    const m = new FileMatcher("/app", "/out", noMacro, ["**/*"])
    expect(m.isSpecifiedAsEmptyArray).toBe(false)
  })

  test("string pattern is coerced to single-element array", ({ expect }) => {
    const m = new FileMatcher("/app", "/out", noMacro, "**/*")
    expect(m.patterns).toEqual(["**/*"])
    expect(m.isSpecifiedAsEmptyArray).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// FileMatcher – isEmpty / containsOnlyIgnore
// ---------------------------------------------------------------------------

describe("FileMatcher – isEmpty / containsOnlyIgnore", () => {
  test("isEmpty returns true when no patterns given", ({ expect }) => {
    expect(new FileMatcher("/app", "/out", noMacro).isEmpty()).toBe(true)
  })

  test("isEmpty returns false when patterns exist", ({ expect }) => {
    expect(new FileMatcher("/app", "/out", noMacro, ["**/*"]).isEmpty()).toBe(false)
  })

  test("containsOnlyIgnore returns false for empty matcher", ({ expect }) => {
    expect(new FileMatcher("/app", "/out", noMacro).containsOnlyIgnore()).toBe(false)
  })

  test("containsOnlyIgnore returns true when all patterns are negations", ({ expect }) => {
    const m = new FileMatcher("/app", "/out", noMacro, ["!node_modules/**", "!dist/**"])
    expect(m.containsOnlyIgnore()).toBe(true)
  })

  test("containsOnlyIgnore returns false when any pattern is an inclusion", ({ expect }) => {
    const m = new FileMatcher("/app", "/out", noMacro, ["!node_modules/**", "src/**"])
    expect(m.containsOnlyIgnore()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// FileMatcher – addPattern / prependPattern
// ---------------------------------------------------------------------------

describe("FileMatcher – addPattern / prependPattern", () => {
  test("addPattern appends to the end", ({ expect }) => {
    const m = new FileMatcher("/app", "/out", noMacro, ["a"])
    m.addPattern("b")
    expect(m.patterns).toEqual(["a", "b"])
  })

  test("prependPattern inserts at the front", ({ expect }) => {
    const m = new FileMatcher("/app", "/out", noMacro, ["b"])
    m.prependPattern("a")
    expect(m.patterns).toEqual(["a", "b"])
  })

  test("addPattern normalizes the pattern (strips ./)", ({ expect }) => {
    const m = new FileMatcher("/app", "/out", noMacro)
    m.addPattern("./src/index.js")
    expect(m.patterns).toEqual(["src/index.js"])
  })
})

// ---------------------------------------------------------------------------
// FileMatcher – computeParsedPatterns auto-expansion of directory patterns
// computeParsedPatterns adds a `/**/*` sibling for patterns with no dots and
// no glob magic so that bare directory names like "dist" also match their contents.
// ---------------------------------------------------------------------------

describe("FileMatcher – computeParsedPatterns: auto-expand bare directory names", () => {
  test("bare dir name gets a /**/* sibling in the filter", ({ expect }) => {
    // "dist" has no dot and no magic → auto-expanded to also include dist/**/*
    const m = new FileMatcher("/app", "/out", noMacro, ["dist"])
    const filter = m.createFilter()
    expect(filter("/app/dist/bundle.js", fileStat())).toBe(true)
  })

  test("pattern with a dot extension does NOT get /**/* expansion", ({ expect }) => {
    // "dist/index.js" has a dot → only exact match, no automatic /**/* expansion
    const m = new FileMatcher("/app", "/out", noMacro, ["dist/index.js"])
    const filter = m.createFilter()
    // The exact file matches
    expect(filter("/app/dist/index.js", fileStat())).toBe(true)
    // A sibling file should NOT match (no expansion happened)
    expect(filter("/app/dist/other.js", fileStat())).toBe(false)
  })

  test("glob-magic pattern does NOT get /**/* expansion", ({ expect }) => {
    // "dist/**" has magic (GLOBSTAR) → no extra pattern added
    const m = new FileMatcher("/app", "/out", noMacro, ["dist/**"])
    const filter = m.createFilter()
    expect(filter("/app/dist/a/b.js", fileStat())).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// FileMatcher – createFilter with excludePatterns
// excludePatterns act as a secondary exclusion layer applied only to files
// (not directories, so traversal is not blocked).
// ---------------------------------------------------------------------------

describe("FileMatcher – createFilter with excludePatterns", () => {
  test("excludePatterns exclude matched files but not directories", ({ expect }) => {
    const { Minimatch } = require("minimatch")
    const m = new FileMatcher("/app", "/out", noMacro, ["**/*"])
    m.excludePatterns = [new Minimatch("**/*.map", { dot: true })]
    const filter = m.createFilter()

    expect(filter("/app/dist/bundle.js", fileStat())).toBe(true)
    expect(filter("/app/dist/bundle.js.map", fileStat())).toBe(false)
    // Directories are never excluded by excludePatterns
    expect(filter("/app/dist", dirStat())).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getFileMatchers
// ---------------------------------------------------------------------------

describe("getFileMatchers – string patterns in config.files", () => {
  const opts: GetFileMatchersOptions = {
    macroExpander: noMacro,
    customBuildOptions: {},
    globalOutDir: "/app/dist",
    defaultSrc: "/app",
  }

  test("returns null when config has no files and no customBuildOptions.files", ({ expect }) => {
    const result = getFileMatchers({} as any, "files", "/out", opts)
    expect(result).toBeNull()
  })

  test("string pattern creates a single default matcher", ({ expect }) => {
    const result = getFileMatchers({ files: "src/**" } as any, "files", "/out", opts)
    expect(result).not.toBeNull()
    expect(result!.length).toBe(1)
    expect(result![0].patterns).toContain("src/**")
  })

  test("array of strings all go into the default matcher", ({ expect }) => {
    const result = getFileMatchers({ files: ["src/**", "!src/__tests__/**"] } as any, "files", "/out", opts)
    expect(result).not.toBeNull()
    expect(result![0].patterns).toContain("src/**")
    expect(result![0].patterns).toContain("!src/__tests__/**")
  })

  test("object pattern with from/to creates a separate FileMatcher", ({ expect }) => {
    const result = getFileMatchers(
      {
        files: [{ from: "assets", to: "resources", filter: ["**/*.png"] }],
      } as any,
      "files",
      "/out",
      opts
    )
    expect(result).not.toBeNull()
    expect(result!.length).toBe(1)
    expect(result![0].from).toBe(path.resolve("/app", "assets"))
    expect(result![0].to).toBe(path.resolve("/out", "resources"))
  })

  test("adds !outDir/*-unpacked exclusion to the default matcher", ({ expect }) => {
    const result = getFileMatchers({ files: ["**/*"] } as any, "files", "/out", opts)
    expect(result![0].patterns.some(p => p.includes("dist/*-unpacked"))).toBe(true)
  })

  test("customBuildOptions.files merges into the default matcher", ({ expect }) => {
    const customOpts = { ...opts, customBuildOptions: { files: ["extra/**"] } as any }
    const result = getFileMatchers({} as any, "files", "/out", customOpts)
    expect(result).not.toBeNull()
    expect(result![0].patterns).toContain("extra/**")
  })

  test("extraDistFiles skips config[name] and only reads customBuildOptions", ({ expect }) => {
    const customOpts = { ...opts, customBuildOptions: { extraDistFiles: ["installer.nsis"] } as any }
    // config.extraDistFiles is ignored for extraDistFiles
    const result = getFileMatchers({ extraDistFiles: ["should-be-ignored.txt"] } as any, "extraDistFiles", "/out", customOpts)
    expect(result).not.toBeNull()
    expect(result![0].patterns).toContain("installer.nsis")
    expect(result![0].patterns).not.toContain("should-be-ignored.txt")
  })
})

// ---------------------------------------------------------------------------
// collectExplicitReincludes – which default exclusions the user opted back in
// ---------------------------------------------------------------------------

describe("collectExplicitReincludes", () => {
  test("broad patterns opt nothing in", ({ expect }) => {
    const { extensions, names } = collectExplicitReincludes(["**/*", "package.json", "dist/**/*"])
    expect(extensions.size).toBe(0)
    expect(names.size).toBe(0)
  })

  test("a basename ending in a default ext opts that ext in", ({ expect }) => {
    const { extensions } = collectExplicitReincludes(["**/*", "**/*.obj"])
    expect([...extensions]).toEqual(["obj"])
  })

  test("brace alternations opt each listed ext in", ({ expect }) => {
    const { extensions } = collectExplicitReincludes(["**/*", "assets/*.{obj,o}"])
    expect(extensions.has("obj")).toBe(true)
    expect(extensions.has("o")).toBe(true)
  })

  test("multi-dot extensions like d.ts are matched", ({ expect }) => {
    const { extensions } = collectExplicitReincludes(["**/*.d.ts"])
    expect(extensions.has("d.ts")).toBe(true)
  })

  test("a path segment equal to a default name opts that name in", ({ expect }) => {
    const { names } = collectExplicitReincludes(["**/*", "**/.github/**"])
    expect(names.has(".github")).toBe(true)
  })

  test("names with dots (lockfiles) are matched as whole segments", ({ expect }) => {
    const { names } = collectExplicitReincludes(["**/*", "**/yarn.lock"])
    expect(names.has("yarn.lock")).toBe(true)
  })

  test("negated patterns never opt anything in", ({ expect }) => {
    const { extensions, names } = collectExplicitReincludes(["!**/*.obj", "!**/.github/**"])
    expect(extensions.size).toBe(0)
    expect(names.size).toBe(0)
  })

  test("nested braces are expanded for opt-in detection", ({ expect }) => {
    const { extensions } = collectExplicitReincludes(["**/*.{obj,{a,o}}"])
    expect(extensions.has("obj")).toBe(true)
    expect(extensions.has("a")).toBe(true)
    expect(extensions.has("o")).toBe(true)

    const { names } = collectExplicitReincludes(["**/{.github,{.husky,.idea}}/**"])
    expect(names.has(".github")).toBe(true)
    expect(names.has(".husky")).toBe(true)
    expect(names.has(".idea")).toBe(true)
  })

  test("does not blow up on a pathological brace pattern (bounded expansion)", ({ expect }) => {
    // product of alternatives across these groups is 2**20; expansion must bail to a literal, not OOM
    const bomb = "**/" + "{a,b}".repeat(20) + ".js"
    const { extensions, names } = collectExplicitReincludes([bomb])
    expect(extensions.size).toBe(0)
    expect(names.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// getDefaultIgnoredPatterns – trailing default ignore globs appended to the matcher
// ---------------------------------------------------------------------------

describe("getDefaultIgnoredPatterns", () => {
  const extPatternOf = (patterns: Array<string>) => patterns.find(p => p.startsWith("!**/*.{"))!
  const namePatternOf = (patterns: Array<string>) => patterns.find(p => p.startsWith("!**/{"))!

  test("by default excludes obj and electron-builder.env, and appends pdb when includePdb is false", ({ expect }) => {
    const patterns = getDefaultIgnoredPatterns([], false)
    const extPattern = extPatternOf(patterns)
    expect(extPattern).toContain("obj")
    expect(extPattern).toContain("pdb")
    expect(namePatternOf(patterns)).toContain("electron-builder.env")
  })

  test("includePdb=true omits pdb from the extension glob", ({ expect }) => {
    expect(extPatternOf(getDefaultIgnoredPatterns([], true))).not.toContain("pdb")
  })

  test("an explicit **/*.obj re-include drops obj from the exclusion glob but keeps the others", ({ expect }) => {
    const extPattern = extPatternOf(getDefaultIgnoredPatterns(["**/*", "**/*.obj"], false))
    // obj as a {…} list member is gone, but `o` and `forge-meta` remain
    expect(extPattern.split(/[{,}]/)).not.toContain("obj")
    expect(extPattern).toContain("forge-meta")
    expect(extPattern).toContain("o,")
  })

  test("re-including .d.ts drops only d.ts", ({ expect }) => {
    const extPattern = extPatternOf(getDefaultIgnoredPatterns(["**/*.d.ts"], false))
    expect(extPattern.split(/[{,}]/)).not.toContain("d.ts")
    expect(extPattern).toContain("iml")
  })

  test("re-including a name drops it from the name glob but keeps the rest", ({ expect }) => {
    const namePattern = namePatternOf(getDefaultIgnoredPatterns(["**/.github/**"], false))
    expect(namePattern.split(/[{,}]/)).not.toContain(".github")
    expect(namePattern).toContain("electron-builder.env")
  })

  test("broad **/* alone keeps every default exclusion intact", ({ expect }) => {
    const patterns = getDefaultIgnoredPatterns(["**/*"], false)
    expect(extPatternOf(patterns)).toContain("obj")
    expect(namePatternOf(patterns)).toContain("electron-builder.env")
  })

  test("always appends the fixed config/editor ignores", ({ expect }) => {
    const patterns = getDefaultIgnoredPatterns(["**/*"], false)
    expect(patterns).toContain("!**/._*")
    expect(patterns).toContain("!**/electron-builder.{yaml,yml,json,json5,toml,ts}")
    expect(patterns).toContain("!.yarn{,/**/*}")
    expect(patterns).toContain("!.editorconfig")
    expect(patterns).toContain("!.yarnrc.yml")
  })

  test("the default (no opt-in) extension glob matches the historical hardcoded list", ({ expect }) => {
    const expected = `!**/*.{${[...DEFAULT_EXCLUDED_EXTENSIONS, "pdb"].join(",")}}`
    expect(extPatternOf(getDefaultIgnoredPatterns([], false))).toBe(expected)
  })

  test("the default (no opt-in) name glob matches the historical hardcoded list", ({ expect }) => {
    expect(namePatternOf(getDefaultIgnoredPatterns([], false))).toBe(`!**/{${DEFAULT_EXCLUDED_NAMES.join(",")}}`)
  })

  test("a lone surviving extension is emitted as a literal (single-member braces don't match in minimatch)", ({ expect }) => {
    // opt back in every default extension; only the implicit pdb should remain
    const optInAll = DEFAULT_EXCLUDED_EXTENSIONS.map(ext => `**/*.${ext}`)
    const patterns = getDefaultIgnoredPatterns(optInAll, false)
    expect(patterns).toContain("!**/*.pdb")
    expect(patterns.some(p => p.startsWith("!**/*.{"))).toBe(false)
  })

  test("a lone surviving name is emitted as a literal", ({ expect }) => {
    const optInAllButEnv = DEFAULT_EXCLUDED_NAMES.filter(n => n !== "electron-builder.env").map(n => `**/${n}`)
    const patterns = getDefaultIgnoredPatterns(optInAllButEnv, true)
    expect(patterns).toContain("!**/electron-builder.env")
    expect(patterns.some(p => p.startsWith("!**/{"))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getMainFileMatchers – end-to-end pattern assembly (issue #6126)
// ---------------------------------------------------------------------------

describe("getMainFileMatchers – default exclusions respect `files` re-includes", () => {
  function buildMatcherPatterns(files: Array<string>): Array<string> {
    const platformPackager = {
      projectDir: "/app",
      buildResourcesDir: "build",
      isPrepackedAppAsar: false,
      config: { files, includePdb: false },
      debugLogger: { isEnabled: false },
    } as any
    const matchers = getMainFileMatchers("/app", "/out", noMacro, {} as any, platformPackager, "/app/dist")
    return matchers[0].patterns
  }

  test("without an explicit include, .obj stays excluded", ({ expect }) => {
    const extPattern = buildMatcherPatterns(["**/*"]).find(p => p.startsWith("!**/*.{"))!
    expect(extPattern).toContain("obj")
  })

  test("with **/*.obj, the obj exclusion is dropped (issue #6126)", ({ expect }) => {
    const extPattern = buildMatcherPatterns(["**/*", "**/*.obj"]).find(p => p.startsWith("!**/*.{"))!
    expect(extPattern.split(/[{,}]/)).not.toContain("obj")
  })
})
