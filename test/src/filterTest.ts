import { FilterStats, InvalidConfigurationError, log } from "builder-util"
import type { PlatformSpecificBuildOptions } from "app-builder-lib"
import {
  collectExplicitReincludes,
  DEFAULT_EXCLUDED_EXTENSIONS,
  DEFAULT_EXCLUDED_NAMES,
  FileMatcher,
  getDefaultIgnoredPatterns,
  getFileMatchers,
  GetFileMatchersOptions,
  getMainFileMatchers,
  getReincludedDefaultExclusions,
  resolveFileSetDestination,
} from "app-builder-lib/internal"
import { readFileSync } from "fs"
import * as path from "path"
import { vi } from "vitest"
import { resolveExcludedExtensions } from "../../packages/app-builder-lib/src/fileMatcher"

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
    "!**/*.{iml,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,slnx,suo,xproj,cc,d.ts,mk,a,o,obj,forge-meta,pdb}",
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

describe("getFileMatchers – string patterns in config.fileOptions.files", () => {
  const opts: GetFileMatchersOptions = {
    macroExpander: noMacro,
    customBuildOptions: {},
    globalOutDir: "/app/dist",
    defaultSrc: "/app",
  }

  test("returns null when config has no files and no customBuildOptions.files", ({ expect }) => {
    const result = getFileMatchers({}, "files", "/out", opts)
    expect(result).toBeNull()
  })

  test("string pattern creates a single default matcher", ({ expect }) => {
    const result = getFileMatchers({ fileOptions: { files: "src/**" } }, "files", "/out", opts)
    expect(result).not.toBeNull()
    expect(result!.length).toBe(1)
    expect(result![0].patterns).toContain("src/**")
  })

  test("array of strings all go into the default matcher", ({ expect }) => {
    const result = getFileMatchers({ fileOptions: { files: ["src/**", "!src/__tests__/**"] } }, "files", "/out", opts)
    expect(result).not.toBeNull()
    expect(result![0].patterns).toContain("src/**")
    expect(result![0].patterns).toContain("!src/__tests__/**")
  })

  test("object pattern with from/to creates a separate FileMatcher", ({ expect }) => {
    const result = getFileMatchers(
      {
        fileOptions: { files: [{ from: "assets", to: "resources", filter: ["**/*.png"] }] },
      },
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
    const result = getFileMatchers({ fileOptions: { files: ["**/*"] } }, "files", "/out", opts)
    expect(result![0].patterns.some(p => p.includes("dist/*-unpacked"))).toBe(true)
  })

  test("customBuildOptions.fileOptions.files merges into the default matcher", ({ expect }) => {
    const customOpts = { ...opts, customBuildOptions: { fileOptions: { files: ["extra/**"] } } as any }
    const result = getFileMatchers({}, "files", "/out", customOpts)
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

describe("getFileMatchers – extraFiles/extraResources `to` destination validation", () => {
  // mirrors a real macOS layout: outDir/dist contains the .app, extraResources default
  // destination is Contents/Resources inside the .app
  const outDir = path.resolve("/project/dist")
  const contentsDir = path.join(outDir, "mac", "Test.app", "Contents")
  const resourcesDir = path.join(contentsDir, "Resources")

  const opts: GetFileMatchersOptions = {
    macroExpander: noMacro,
    customBuildOptions: {},
    globalOutDir: outDir,
    defaultSrc: path.resolve("/project"),
  }

  test("absolute `to` throws InvalidConfigurationError", ({ expect }) => {
    expect(() => getFileMatchers({ fileOptions: { extraFiles: [{ from: "build/x.xml", to: "/usr/share/metainfo/x.xml" }] } } as any, "extraFiles", contentsDir, opts)).toThrowError(
      /is absolute.*fpm/s
    )
  })

  test("Windows drive-letter `to` throws even on a non-Windows build machine", ({ expect }) => {
    expect(() => getFileMatchers({ fileOptions: { extraFiles: [{ from: "build", to: "C:\\Program Files\\App" }] } } as any, "extraFiles", contentsDir, opts)).toThrowError(
      /is absolute/
    )
  })

  test("UNC `to` throws", ({ expect }) => {
    expect(() => getFileMatchers({ fileOptions: { extraFiles: [{ from: "build", to: "\\\\server\\share\\dir" }] } } as any, "extraFiles", contentsDir, opts)).toThrowError(
      /is absolute/
    )
  })

  test("relative `to` escaping the build output directory throws", ({ expect }) => {
    expect(() =>
      getFileMatchers({ fileOptions: { extraResources: [{ from: "build/x.xml", to: "../../../../../usr/share/metainfo/x.xml" }] } } as any, "extraResources", resourcesDir, opts)
    ).toThrowError(/outside the build output directory/)
  })

  test("backslash-written parent hops that escape are also caught", ({ expect }) => {
    expect(() => getFileMatchers({ fileOptions: { extraFiles: [{ from: "build", to: "..\\..\\..\\..\\usr\\share" }] } } as any, "extraFiles", contentsDir, opts)).toThrowError(
      /outside the build output directory/
    )
  })

  test("normal relative `to` still works", ({ expect }) => {
    const result = getFileMatchers({ fileOptions: { extraResources: [{ from: "assets", to: "bin" }] } }, "extraResources", resourcesDir, opts)
    expect(result).not.toBeNull()
    expect(result![0].to).toBe(path.join(resourcesDir, "bin"))
  })

  test("legitimate `../` hop that stays inside the package still works", ({ expect }) => {
    // e.g. macOS: extraResources with to: "../Frameworks" targets Contents/Frameworks inside the .app
    const result = getFileMatchers({ fileOptions: { extraResources: [{ from: "native", to: "../Frameworks" }] } }, "extraResources", resourcesDir, opts)
    expect(result).not.toBeNull()
    expect(result![0].to).toBe(path.join(contentsDir, "Frameworks"))
  })

  test("omitted `to` is not validated and keeps the default destination", ({ expect }) => {
    const result = getFileMatchers({ fileOptions: { extraFiles: [{ from: "build", filter: "*.dll" }] } }, "extraFiles", contentsDir, opts)
    expect(result).not.toBeNull()
    expect(result![0].to).toBe(contentsDir)
  })

  test("`files` FileSet `to` is not subject to the containment check", ({ expect }) => {
    // `files` destinations participate in asar-relative math; existing behavior is preserved
    const result = getFileMatchers({ fileOptions: { files: [{ from: "assets", to: "resources" }] } }, "files", "/out", opts)
    expect(result).not.toBeNull()
    expect(result![0].to).toBe(path.resolve("/out", "resources"))
  })
})

describe("resolveFileSetDestination – per-branch behavior", () => {
  const outDir = path.resolve("/project/dist")
  const contentsDir = path.join(outDir, "mac", "Test.app", "Contents")
  const resourcesDir = path.join(contentsDir, "Resources")

  test("null/undefined `to` falls back to the default destination without validation", ({ expect }) => {
    expect(resolveFileSetDestination("extraFiles", null, contentsDir, outDir)).toBe(contentsDir)
    expect(resolveFileSetDestination("extraResources", undefined, resourcesDir, outDir)).toBe(resourcesDir)
    expect(resolveFileSetDestination("files", null, "/out", outDir)).toBe("/out")
  })

  test("`files` set is exempt from validation and plainly resolves against the default destination", ({ expect }) => {
    expect(resolveFileSetDestination("files", "resources", "/out", outDir)).toBe(path.resolve("/out", "resources"))
    // even values that would throw for validated sets are resolved as-is for `files`
    expect(resolveFileSetDestination("files", "../elsewhere", "/out", outDir)).toBe(path.resolve("/out", "../elsewhere"))
  })

  test("relative `to` on a validated set resolves inside the default destination", ({ expect }) => {
    expect(resolveFileSetDestination("extraResources", "bin", resourcesDir, outDir)).toBe(path.join(resourcesDir, "bin"))
  })

  test("`../` hop that stays inside the build output directory is valid", ({ expect }) => {
    expect(resolveFileSetDestination("extraResources", "../Frameworks", resourcesDir, outDir)).toBe(path.join(contentsDir, "Frameworks"))
  })

  test("absolute `to` on a validated set throws (POSIX, drive-letter, UNC)", ({ expect }) => {
    expect(() => resolveFileSetDestination("extraFiles", "/usr/share/metainfo/x.xml", contentsDir, outDir)).toThrowError(/is absolute.*fpm/s)
    expect(() => resolveFileSetDestination("extraFiles", "C:\\Program Files\\App", contentsDir, outDir)).toThrowError(/is absolute/)
    expect(() => resolveFileSetDestination("extraDistFiles", "\\\\server\\share\\dir", outDir, outDir)).toThrowError(/is absolute/)
  })

  test("relative `to` escaping the build output directory throws", ({ expect }) => {
    expect(() => resolveFileSetDestination("extraResources", "../../../../../usr/share", resourcesDir, outDir)).toThrowError(/outside the build output directory/)
    expect(() => resolveFileSetDestination("extraFiles", "..\\..\\..\\..\\usr\\share", contentsDir, outDir)).toThrowError(/outside the build output directory/)
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

  test("a basename names only the longest excluded extension it ends with", ({ expect }) => {
    const excluded = [...DEFAULT_EXCLUDED_EXTENSIONS, "ts"]
    expect([...collectExplicitReincludes(["**/*", "types/*.d.ts"], excluded).extensions]).toEqual(["d.ts"])
    expect([...collectExplicitReincludes(["**/*", "src/*.ts"], excluded).extensions]).toEqual(["ts"])
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
  // the patterns between the extension glob and the fixed ignores: none, the matcher's filter lets the files a `files` entry names through
  const reincludesOf = (patterns: Array<string>) => patterns.slice(patterns.findIndex(p => p.startsWith("!**/*.")) + 1, patterns.indexOf("!**/._*"))

  test("by default excludes obj, pdb and electron-builder.env", ({ expect }) => {
    const patterns = getDefaultIgnoredPatterns([])
    const extPattern = extPatternOf(patterns)
    expect(extPattern).toContain("obj")
    expect(extPattern).toContain("pdb")
    expect(namePatternOf(patterns)).toContain("electron-builder.env")
  })

  test('the resolved list for ["default", "!pdb"] (formerly includePdb: true) omits pdb from the extension glob', ({ expect }) => {
    const extPattern = extPatternOf(getDefaultIgnoredPatterns([], resolveExcludedExtensions({ fileOptions: { excludedExts: ["default", "!pdb"] } }, null)))
    expect(extPattern.split(/[{,}]/)).not.toContain("pdb")
    expect(extPattern).toBe(`!**/*.{${DEFAULT_EXCLUDED_EXTENSIONS.filter(ext => ext !== "pdb").join(",")}}`)
  })

  test("an explicit **/*.obj re-include keeps obj in the exclusion glob", ({ expect }) => {
    const patterns = getDefaultIgnoredPatterns(["**/*", "**/*.obj"])
    expect(extPatternOf(patterns)).toBe(`!**/*.{${DEFAULT_EXCLUDED_EXTENSIONS.join(",")}}`)
    expect(reincludesOf(patterns)).toEqual([])
  })

  test("an explicit **/*.pdb re-include keeps pdb, now a default exclusion, in the glob and is reported", ({ expect }) => {
    const patterns = getDefaultIgnoredPatterns(["**/*", "**/*.pdb"])
    expect(extPatternOf(patterns).split(/[{,}]/)).toContain("pdb")
    expect(reincludesOf(patterns)).toEqual([])
    expect([...collectExplicitReincludes(["**/*.pdb"]).extensions]).toEqual(["pdb"])
    expect(getReincludedDefaultExclusions(["**/*", "**/*.pdb"])).toEqual(["*.pdb"])
  })

  test("an extension added by fileOptions.excludedExts is excluded and can be re-included by a files glob", ({ expect }) => {
    const excluded = resolveExcludedExtensions({ fileOptions: { excludedExts: ["default", "map"] } }, null)
    expect(extPatternOf(getDefaultIgnoredPatterns(["**/*"], excluded)).split(/[{,}]/)).toContain("map")
    const patterns = getDefaultIgnoredPatterns(["**/*", "**/*.map"], excluded)
    expect(extPatternOf(patterns).split(/[{,}]/)).toContain("map")
    expect(reincludesOf(patterns)).toEqual([])
    expect(getReincludedDefaultExclusions(["**/*", "**/*.map"], excluded)).toEqual(["*.map"])
  })

  test("a files glob for an extension that is not excluded is not reported as a re-include", ({ expect }) => {
    const excluded = resolveExcludedExtensions({ fileOptions: { excludedExts: ["default", "!pdb"] } }, null)
    expect(collectExplicitReincludes(["**/*.pdb"], excluded).extensions.size).toBe(0)
    expect(getReincludedDefaultExclusions(["**/*", "**/*.pdb"], excluded)).toEqual([])
  })

  test("an empty excluded-extension list emits no extension glob at all", ({ expect }) => {
    const patterns = getDefaultIgnoredPatterns(["**/*"], [])
    expect(patterns.some(p => p.startsWith("!**/*."))).toBe(false)
    // the name and fixed ignores are unaffected
    expect(namePatternOf(patterns)).toBe(`!**/{${DEFAULT_EXCLUDED_NAMES.join(",")}}`)
    expect(patterns).toContain("!**/._*")
  })

  test("re-including .d.ts keeps d.ts in the glob", ({ expect }) => {
    const patterns = getDefaultIgnoredPatterns(["**/*.d.ts"])
    expect(extPatternOf(patterns).split(/[{,}]/)).toContain("d.ts")
    expect(reincludesOf(patterns)).toEqual([])
  })

  test("re-including a name drops it from the name glob but keeps the rest", ({ expect }) => {
    const namePattern = namePatternOf(getDefaultIgnoredPatterns(["**/.github/**"]))
    expect(namePattern.split(/[{,}]/)).not.toContain(".github")
    expect(namePattern).toContain("electron-builder.env")
  })

  test("broad **/* alone keeps every default exclusion intact", ({ expect }) => {
    const patterns = getDefaultIgnoredPatterns(["**/*"])
    expect(extPatternOf(patterns)).toContain("obj")
    expect(namePatternOf(patterns)).toContain("electron-builder.env")
  })

  test("always appends the fixed config/editor ignores", ({ expect }) => {
    const patterns = getDefaultIgnoredPatterns(["**/*"])
    expect(patterns).toContain("!**/._*")
    expect(patterns).toContain("!**/electron-builder.{yaml,yml,json,json5,toml,ts}")
    expect(patterns).toContain("!.yarn{,/**/*}")
    expect(patterns).toContain("!.editorconfig")
    expect(patterns).toContain("!.yarnrc.yml")
  })

  test("the default (no opt-in) extension glob matches the historical hardcoded list", ({ expect }) => {
    // the list before `fileOptions.excludedExts`, to which `includePdb: false` (the default) appended pdb last
    const historical = ["iml", "hprof", "orig", "pyc", "pyo", "rbc", "swp", "csproj", "sln", "slnx", "suo", "xproj", "cc", "d.ts", "mk", "a", "o", "obj", "forge-meta"]
    expect(DEFAULT_EXCLUDED_EXTENSIONS).toEqual([...historical, "pdb"])
    const expected = `!**/*.{${[...historical, "pdb"].join(",")}}`
    expect(extPatternOf(getDefaultIgnoredPatterns([]))).toBe(expected)
    expect(extPatternOf(getDefaultIgnoredPatterns([], DEFAULT_EXCLUDED_EXTENSIONS))).toBe(expected)
    // an unset fileOptions.excludedExts resolves to the same glob
    expect(extPatternOf(getDefaultIgnoredPatterns([], resolveExcludedExtensions({}, null)))).toBe(expected)
  })

  test("the excludedExts docs table lists every default extension, in order", ({ expect }) => {
    // scheme.json carries the FilesBuildOptions.excludedExts JSDoc as the description
    const scheme = JSON.parse(readFileSync(path.join(import.meta.dirname, "../../packages/app-builder-lib/scheme.json"), "utf8"))
    const description: string = scheme.definitions.FilesBuildOptions.properties.excludedExts.description
    expect([...description.matchAll(/^\| `\.([^`]+)` \|/gm)].map(it => it[1])).toEqual(DEFAULT_EXCLUDED_EXTENSIONS)
  })

  test("the default (no opt-in) name glob matches the historical hardcoded list", ({ expect }) => {
    expect(namePatternOf(getDefaultIgnoredPatterns([]))).toBe(`!**/{${DEFAULT_EXCLUDED_NAMES.join(",")}}`)
  })

  test("a lone excluded extension stays a literal when re-included (single-member braces don't match in minimatch)", ({ expect }) => {
    const patterns = getDefaultIgnoredPatterns(["**/*", "**/*.map"], ["map"])
    expect(patterns.slice(0, 2)).toEqual(["!**/*.map", "!**/._*"])
    expect(patterns.some(p => p.startsWith("!**/*.{"))).toBe(false)
  })

  test("a single-extension list is emitted as a literal", ({ expect }) => {
    const patterns = getDefaultIgnoredPatterns(["**/*"], resolveExcludedExtensions({ fileOptions: { excludedExts: ["map"] } }, null))
    expect(patterns).toContain("!**/*.map")
    expect(patterns.some(p => p.startsWith("!**/*.{"))).toBe(false)
  })

  test("a lone surviving name is emitted as a literal", ({ expect }) => {
    const optInAllButEnv = DEFAULT_EXCLUDED_NAMES.filter(n => n !== "electron-builder.env").map(n => `**/${n}`)
    const patterns = getDefaultIgnoredPatterns(optInAllButEnv)
    expect(patterns).toContain("!**/electron-builder.env")
    expect(patterns.some(p => p.startsWith("!**/{"))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resolveExcludedExtensions – the fileOptions.excludedExts build option
// ---------------------------------------------------------------------------

describe("resolveExcludedExtensions", () => {
  const withoutPdb = DEFAULT_EXCLUDED_EXTENSIONS.filter(ext => ext !== "pdb")
  const resolve = (excludedExts: Array<string> | null | undefined, platformExcludedExts?: Array<string> | null) =>
    resolveExcludedExtensions({ fileOptions: { excludedExts } }, platformExcludedExts === undefined ? null : { fileOptions: { excludedExts: platformExcludedExts } })

  test("unset or null is the default list", ({ expect }) => {
    expect(resolveExcludedExtensions({}, null)).toEqual(DEFAULT_EXCLUDED_EXTENSIONS)
    expect(resolveExcludedExtensions({ fileOptions: null }, undefined)).toEqual(DEFAULT_EXCLUDED_EXTENSIONS)
    expect(resolve(undefined)).toEqual(DEFAULT_EXCLUDED_EXTENSIONS)
    expect(resolve(null)).toEqual(DEFAULT_EXCLUDED_EXTENSIONS)
  })

  test('"default" expands to the default list, which includes pdb', ({ expect }) => {
    expect(resolve(["default"])).toEqual(DEFAULT_EXCLUDED_EXTENSIONS)
    expect(resolve(["default"])).toContain("pdb")
  })

  test("an empty list excludes no extension", ({ expect }) => {
    expect(resolve([])).toEqual([])
  })

  test('a list without "default" replaces the defaults', ({ expect }) => {
    expect(resolve(["map"])).toEqual(["map"])
  })

  test('a list with "default" extends the defaults', ({ expect }) => {
    expect(resolve(["default", "map"])).toEqual([...DEFAULT_EXCLUDED_EXTENSIONS, "map"])
  })

  test('"!ext" removes ext from the defaults', ({ expect }) => {
    expect(resolve(["default", "!pdb"])).toEqual(withoutPdb)
  })

  test('"!ext" removes ext regardless of its position', ({ expect }) => {
    expect(resolve(["!pdb", "default"])).toEqual(withoutPdb)
    expect(resolve(["map", "!map", "default"])).toEqual(DEFAULT_EXCLUDED_EXTENSIONS)
  })

  test("a single leading dot is stripped, also after !", ({ expect }) => {
    expect(resolve([".map"])).toEqual(["map"])
    expect(resolve(["default", "!.pdb"])).toEqual(withoutPdb)
  })

  test("multi-dot extensions are accepted", ({ expect }) => {
    expect(resolve(["tar.gz", ".d.ts"])).toEqual(["tar.gz", "d.ts"])
  })

  test("duplicates are removed", ({ expect }) => {
    expect(resolve(["map", ".map", "map"])).toEqual(["map"])
    expect(resolve(["default", "pdb", "obj"])).toEqual(DEFAULT_EXCLUDED_EXTENSIONS)
  })

  test('"!default" is a configuration error', ({ expect }) => {
    expect(() => resolve(["!default"])).toThrow(InvalidConfigurationError)
    expect(() => resolve(["map", "!default"])).toThrow(/"!default" in `fileOptions.excludedExts` is not supported/)
  })

  test.for(["*.map", "a/b", "{a,b}", "", "!", "!*.pdb", "..", "map.", "m ap"])("%j is not an extension and is a configuration error", (entry, { expect }) => {
    expect(() => resolve(["default", entry])).toThrow(InvalidConfigurationError)
    expect(() => resolve(["default", entry])).toThrow(`"${entry}" in \`fileOptions.excludedExts\` is not a file extension`)
  })

  // validateConfiguration reports it, naming the section (see legacyConfigGuardTest)
  test('resolving does not warn about a "!ext" that removes nothing', ({ expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => log)
    try {
      expect(resolve(["obj", "!noop-a"])).toEqual(["obj"])
      expect(resolve(["map", "!noop-a"])).toEqual(["map"])
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  // a list without "default" replaces the defaults, so removals alone would remove from nothing and exclude no extension at all
  test.for<[Array<string> | string, string]>([
    [["!pdb"], '["default","!pdb"]'],
    [["!pdb", "!obj"], '["default","!pdb","!obj"]'],
    ["!pdb", '["default","!pdb"]'],
    [["!.pdb"], '["default","!pdb"]'],
  ])('a list of removals only (%j) is a configuration error suggesting to list "default"', ([excludedExts, suggestion], { expect }) => {
    for (const run of [
      () => resolveExcludedExtensions({ fileOptions: { excludedExts } }, null),
      // a platform value replaces the root value, so it must not be only removals either
      () => resolveExcludedExtensions({ fileOptions: { excludedExts: ["default"] } }, { fileOptions: { excludedExts } }),
    ]) {
      expect(run).toThrow(InvalidConfigurationError)
      expect(run).toThrow(`\`fileOptions.excludedExts\` ${JSON.stringify(excludedExts)} only removes extensions, so it would exclude no extension at all`)
      expect(run).toThrow(`e.g. ${suggestion}.`)
    }
  })

  test('an empty list, or removals with an added extension, is not "removals only"', ({ expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => log)
    try {
      expect(resolve([])).toEqual([])
      expect(resolve(["default"], [])).toEqual([])
      expect(resolve(["map", "!pdb"])).toEqual(["map"])
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  test('a "!ext" that removes an extension does not warn', ({ expect }) => {
    log.resetLimits("excluded-exts-removal:noop-b")
    const warn = vi.spyOn(log, "warn").mockImplementation(() => log)
    try {
      expect(resolve(["noop-b", "!noop-b"])).toEqual([])
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  test("a platform value replaces the root value", ({ expect }) => {
    expect(resolve(["default"], ["map"])).toEqual(["map"])
    expect(resolve(["default", "!pdb"], ["default"])).toEqual(DEFAULT_EXCLUDED_EXTENSIONS)
    expect(resolve(["default"], [])).toEqual([])
  })

  test("a null platform value, or a platform without fileOptions, falls back to the root value", ({ expect }) => {
    expect(resolve(["map"], null)).toEqual(["map"])
    expect(resolveExcludedExtensions({ fileOptions: { excludedExts: ["map"] } }, { fileOptions: null })).toEqual(["map"])
    expect(resolveExcludedExtensions({ fileOptions: { excludedExts: ["map"] } }, {})).toEqual(["map"])
    expect(resolveExcludedExtensions({}, { fileOptions: { excludedExts: null } })).toEqual(DEFAULT_EXCLUDED_EXTENSIONS)
  })

  // e.g. `-c.fileOptions.excludedExts=default` on the command line
  test.for<[string, ReadonlyArray<string>]>([
    ["default", DEFAULT_EXCLUDED_EXTENSIONS],
    ["map", ["map"]],
    [".pdb", ["pdb"]],
  ])("a single string %j resolves like a one-element list", ([entry, expected], { expect }) => {
    expect(resolveExcludedExtensions({ fileOptions: { excludedExts: entry } }, null)).toEqual(expected)
    expect(resolveExcludedExtensions({ fileOptions: { excludedExts: entry } }, null)).toEqual(resolve([entry]))
    // a platform string replaces the root list
    expect(resolveExcludedExtensions({ fileOptions: { excludedExts: ["default"] } }, { fileOptions: { excludedExts: entry } })).toEqual(expected)
  })
})

// ---------------------------------------------------------------------------
// getMainFileMatchers – end-to-end pattern assembly (issue #6126)
// ---------------------------------------------------------------------------

describe("getMainFileMatchers – default exclusions respect `files` re-includes", () => {
  // Use path.resolve so appDir matches FileMatcher.from after the constructor normalizes path
  // separators (on Windows a literal "/app" becomes "\app", and getMainFileMatchers early-returns
  // unless matcher.from === appDir).
  const appDir = path.resolve("/app")
  function buildMainMatcher(files: Array<string>, excludedExts?: Array<string> | null, platformSpecificBuildOptions: PlatformSpecificBuildOptions = {}): FileMatcher {
    const platformPackager = {
      projectDir: appDir,
      buildResourcesDir: "build",
      isPrepackedAppAsar: false,
      config: { fileOptions: { files, excludedExts } },
      debugLogger: { isEnabled: false },
    } as any
    const matchers = getMainFileMatchers(appDir, path.resolve("/out"), noMacro, platformSpecificBuildOptions, platformPackager, path.join(appDir, "dist"))
    return matchers[0]
  }

  function buildMatcherPatterns(files: Array<string>, excludedExts?: Array<string> | null, platformSpecificBuildOptions: PlatformSpecificBuildOptions = {}): Array<string> {
    return buildMainMatcher(files, excludedExts, platformSpecificBuildOptions).patterns
  }

  // whether the main matcher packages a path relative to the app dir
  function buildIsIncluded(files: Array<string>, excludedExts?: Array<string> | null): (file: string, isDirectory?: boolean) => boolean {
    const filter = buildMainMatcher(files, excludedExts).createFilter()
    return (file, isDirectory = false) => filter(path.join(appDir, file), isDirectory ? dirStat() : fileStat())
  }

  test("without an explicit include, .obj and .pdb stay excluded", ({ expect }) => {
    const extPattern = buildMatcherPatterns(["**/*"]).find(p => p.startsWith("!**/*.{"))!
    expect(extPattern).toBe(`!**/*.{${DEFAULT_EXCLUDED_EXTENSIONS.join(",")}}`)
    expect(extPattern.split(/[{,}]/)).toContain("obj")
    expect(extPattern.split(/[{,}]/)).toContain("pdb")
  })

  test('root fileOptions.excludedExts ["default", "!pdb"] drops pdb from the extension glob', ({ expect }) => {
    const extPattern = buildMatcherPatterns(["**/*"], ["default", "!pdb"]).find(p => p.startsWith("!**/*.{"))!
    expect(extPattern.split(/[{,}]/)).not.toContain("pdb")
    expect(extPattern.split(/[{,}]/)).toContain("obj")
  })

  test("a platform fileOptions.excludedExts replaces the root one", ({ expect }) => {
    const patterns = buildMatcherPatterns(["**/*"], ["default", "!pdb"], { fileOptions: { excludedExts: ["map"] } })
    expect(patterns).toContain("!**/*.map")
    expect(patterns.some(p => p.startsWith("!**/*.{"))).toBe(false)

    const extPattern = buildMatcherPatterns(["**/*"], ["default", "!pdb"], { fileOptions: { excludedExts: ["default"] } }).find(p => p.startsWith("!**/*.{"))!
    expect(extPattern.split(/[{,}]/)).toContain("pdb")
  })

  test("fileOptions.excludedExts [] emits no extension glob", ({ expect }) => {
    const patterns = buildMatcherPatterns(["**/*"], [])
    expect(patterns.some(p => p.startsWith("!**/*."))).toBe(false)
    expect(patterns.some(p => p.startsWith("!**/{"))).toBe(true)
  })

  test("an invalid fileOptions.excludedExts entry fails the matcher assembly", ({ expect }) => {
    expect(() => buildMatcherPatterns(["**/*"], ["default", "*.map"])).toThrow(InvalidConfigurationError)
  })

  test("a fileOptions.excludedExts of removals only fails the matcher assembly, also from a platform section", ({ expect }) => {
    expect(() => buildMatcherPatterns(["**/*"], ["!pdb"])).toThrow(InvalidConfigurationError)
    expect(() => buildMatcherPatterns(["**/*"], ["default"], { fileOptions: { excludedExts: ["!pdb"] } })).toThrow(InvalidConfigurationError)
    expect(() => buildMatcherPatterns(["**/*"], ["default"], { fileOptions: { excludedExts: "!pdb" } })).toThrow(/only removes extensions/)
  })

  test("with **/*.obj, the obj exclusion stays and the matcher records the files entry that names obj (issue #6126)", ({ expect }) => {
    const matcher = buildMainMatcher(["**/*", "**/*.obj"])
    const glob = `!**/*.{${DEFAULT_EXCLUDED_EXTENSIONS.join(",")}}`
    expect(matcher.patterns[matcher.patterns.indexOf(glob) + 1]).toBe("!**/._*")
    expect(matcher.extensionReincludes?.glob).toBe(glob)
    expect([...matcher.extensionReincludes!.namedBy]).toEqual([["obj", ["**/*.obj"]]])
  })

  test("only the brace alternatives that name an excluded extension, under the longest one, and only user entries are recorded", ({ expect }) => {
    const namedBy = buildMainMatcher(["**/*", "src/**", "native/{**/*,addon.pdb}", "**/*.d.ts", "!models/secret.obj"], ["default", "ts", "json"]).extensionReincludes?.namedBy
    expect(namedBy == null ? null : [...namedBy]).toEqual([
      ["pdb", ["native/addon.pdb"]],
      ["d.ts", ["**/*.d.ts"]],
    ])
    // the injected package.json is not a files entry
    expect(buildMainMatcher(["**/*"], ["default", "json"]).extensionReincludes).toBeNull()
    expect(buildIsIncluded(["**/*"], ["default", "json"])("package.json")).toBe(false)
    expect([...buildMainMatcher(["**/*", "package.json"], ["default", "json"]).extensionReincludes!.namedBy]).toEqual([["json", ["package.json"]]])
  })

  test("files without an excluded extension are included exactly as without re-includes", ({ expect }) => {
    // a broad positive after an exclusion still re-includes the files it matches
    const isIncluded = buildIsIncluded(["**/*", "**/*.pdb", "build/runtime/**/*"])
    expect(isIncluded("build/runtime/helper.js")).toBe(true)
    // named by `**/*.pdb`, and the other patterns include it
    expect(isIncluded("build/runtime/helper.pdb")).toBe(true)
    // named by no files entry
    expect(isIncluded("build/runtime/helper.obj")).toBe(false)
    expect(isIncluded("main.pdb")).toBe(true)
    expect(buildIsIncluded(["**/*.d.ts", "**/*", "!src/**", "src/main/**"])("src/main/index.js")).toBe(true)
    expect(buildIsIncluded(["**/*.obj", "!src/**", "src/**/*.js"])("src/main/index.js")).toBe(true)
  })

  test("a directory named with an excluded extension stays excluded", ({ expect }) => {
    const isIncluded = buildIsIncluded(["**/*", "**/*.obj", "**/*.d.ts"])
    expect(isIncluded("assets/foo.pdb", true)).toBe(false)
    expect(isIncluded("assets/sym.obj", true)).toBe(false)
    expect(isIncluded("assets", true)).toBe(true)
  })

  test("a brace alternative without an excluded extension re-includes nothing", ({ expect }) => {
    const isIncluded = buildIsIncluded(["**/*", "native/{**/*,addon.pdb}"])
    expect(isIncluded("native/addon.pdb")).toBe(true)
    expect(isIncluded("native/x.obj")).toBe(false)
    expect(isIncluded("native/sub/deep.obj")).toBe(false)
    expect(isIncluded("native/x.js")).toBe(true)
  })

  test("a files negation with the same text as the extension glob still excludes a named file", ({ expect }) => {
    const isIncluded = buildIsIncluded(["native/addon.pdb", "**/*", "!**/*.pdb"], ["pdb"])
    expect(isIncluded("native/addon.pdb")).toBe(false)
    expect(isIncluded("native/addon.node")).toBe(true)
  })

  test("a pattern with braces left in its directory part after expansion still re-includes the file it names", ({ expect }) => {
    // 81 alternatives, more than expandBraces expands: minimatch expands them
    const isIncluded = buildIsIncluded(["**/*", "{a,b,c,d,e,f,g,h,i}/{a,b,c,d,e,f,g,h,i}/x.obj"])
    expect(isIncluded("a/a/x.obj")).toBe(true)
    expect(isIncluded("a/a/y.obj")).toBe(false)
    // an unbalanced brace is literal
    expect(buildIsIncluded(["**/*", "foo{/x.obj"])("foo{/x.obj")).toBe(true)
  })

  test("a basename with braces left after expansion, or a literal brace, still re-includes the files it names", ({ expect }) => {
    // 65 alternatives in the basename, more than expandBraces expands: minimatch expands them
    const alternatives = ["x", ...Array.from({ length: 64 }, (_, i) => `n${i}`)]
    const isIncluded = buildIsIncluded(["**/*", `q/{${alternatives.join(",")}}.obj`])
    expect(isIncluded("q/x.obj")).toBe(true)
    expect(isIncluded("q/other.obj")).toBe(false)
    expect(buildIsIncluded(["**/*", "native/x}.obj"])("native/x}.obj")).toBe(true)
    expect(getReincludedDefaultExclusions(["**/*", "native/x}.obj"])).toEqual(["*.obj"])
  })

  test("a files entry naming a shorter excluded extension does not re-include a longer one", ({ expect }) => {
    const isIncluded = buildIsIncluded(["**/*", "**/*.ts"], ["default", "ts"])
    expect(isIncluded("src/a.ts")).toBe(true)
    expect(isIncluded("types/index.d.ts")).toBe(false)
  })

  test("a files entry naming one .pdb file packages only that .pdb file", ({ expect }) => {
    const isIncluded = buildIsIncluded(["**/*", "native/addon.pdb"])
    expect(isIncluded("native/addon.pdb")).toBe(true)
    expect(isIncluded("native/other.pdb")).toBe(false)
    expect(isIncluded("vendor/secret.pdb")).toBe(false)
    expect(isIncluded("native/addon.node")).toBe(true)
    expect(isIncluded("package.json")).toBe(true)
  })

  test("a files entry naming one .obj file packages only that .obj file, not every .obj", ({ expect }) => {
    const isIncluded = buildIsIncluded(["**/*", "models/a.obj"])
    expect(isIncluded("models/a.obj")).toBe(true)
    expect(isIncluded("models/b.obj")).toBe(false)
  })

  test("**/*.obj packages every .obj except in node_modules, the build resources and the output directory", ({ expect }) => {
    const isIncluded = buildIsIncluded(["**/*", "**/*.obj"])
    for (const file of ["a.obj", "models/a.obj", "assets/deep/b.obj"]) {
      expect(isIncluded(file), file).toBe(true)
    }
    for (const file of ["dist/x.obj", "dist/linux-unpacked/x.obj", "build/x.obj", "pkg/node_modules/dep/y.obj"]) {
      expect(isIncluded(file), file).toBe(false)
    }
    expect(isIncluded("main.js")).toBe(true)
    expect(isIncluded("models/a.pdb")).toBe(false)
  })

  test("an extension added by fileOptions.excludedExts is re-included only for the file a files entry names", ({ expect }) => {
    const isIncluded = buildIsIncluded(["**/*", "certs/public.pem"], ["default", "pem", "key"])
    expect(isIncluded("certs/public.pem")).toBe(true)
    expect(isIncluded("certs/private.pem")).toBe(false)
    expect(isIncluded("certs/private.key")).toBe(false)
  })

  test("re-including *.d.ts with ts excluded keeps every other .ts excluded and warns for *.d.ts only", ({ expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => log)
    try {
      const isIncluded = buildIsIncluded(["**/*", "**/*.d.ts"], ["default", "ts"])
      expect(isIncluded("types/index.d.ts")).toBe(true)
      expect(isIncluded("src/secret.ts")).toBe(false)
      expect(warn).toHaveBeenCalledTimes(1)
      expect((warn.mock.calls[0][0] as any).files).toBe("*.d.ts")
    } finally {
      warn.mockRestore()
    }
  })

  test("a files negation after a re-include still applies", ({ expect }) => {
    const isIncluded = buildIsIncluded(["**/*", "**/*.obj", "!models/secret.obj"])
    expect(isIncluded("models/a.obj")).toBe(true)
    expect(isIncluded("models/secret.obj")).toBe(false)
  })

  test("a single-file files entry after a re-include still overrides an exclusion before it", ({ expect }) => {
    const isIncluded = buildIsIncluded(["**/*", "**/*.obj", "build/icon.png"])
    expect(isIncluded("build", true)).toBe(true)
    expect(isIncluded("build/icon.png")).toBe(true)
    expect(isIncluded("build/other.png")).toBe(false)
    expect(isIncluded("build/x.obj")).toBe(false)

    const isIncludedDocs = buildIsIncluded(["**/*", "**/*.obj", "!docs/**", "docs/README.md"])
    expect(isIncludedDocs("docs/README.md")).toBe(true)
    expect(isIncludedDocs("docs/other.md")).toBe(false)
    expect(isIncludedDocs("docs/model.obj")).toBe(false)
  })

  test("a re-included default name is still re-included everywhere", ({ expect }) => {
    const isIncluded = buildIsIncluded(["**/*", "**/*.obj", "**/.github/**"])
    expect(isIncluded(".github/workflows/ci.yml")).toBe(true)
    expect(isIncluded("sub/.github/x.yml")).toBe(true)
    expect(isIncluded(".github", true)).toBe(true)
    expect(isIncluded(".git", true)).toBe(false)
  })

  test("warns once when a default-excluded file is re-included", ({ expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => log)
    try {
      buildMatcherPatterns(["**/*", "**/*.obj", "**/.github/**"])
      expect(warn).toHaveBeenCalledTimes(1)
      const [data, message] = warn.mock.calls[0]
      expect((data as any).files).toContain("*.obj")
      expect((data as any).files).toContain(".github")
      expect(message).toMatch(/excluded by default/)
    } finally {
      warn.mockRestore()
    }
  })

  test("does not warn when no default-excluded file is re-included", ({ expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => log)
    try {
      buildMatcherPatterns(["**/*", "src/**/*.js"])
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  test("warns for a **/*.pdb re-include by default, but not when fileOptions.excludedExts no longer excludes pdb", ({ expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => log)
    try {
      buildMatcherPatterns(["**/*", "**/*.pdb"])
      expect(warn).toHaveBeenCalledTimes(1)
      expect((warn.mock.calls[0][0] as any).files).toBe("*.pdb")

      warn.mockClear()
      buildMatcherPatterns(["**/*", "**/*.pdb"], ["default", "!pdb"])
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

// ---------------------------------------------------------------------------
// getReincludedDefaultExclusions – which default exclusions a config opts back in
// ---------------------------------------------------------------------------

describe("getReincludedDefaultExclusions", () => {
  test("formats re-included extensions as *.ext and names verbatim", ({ expect }) => {
    const result = getReincludedDefaultExclusions(["**/*", "**/*.obj", "**/.github/**", "**/yarn.lock"])
    expect(result).toContain("*.obj")
    expect(result).toContain(".github")
    expect(result).toContain("yarn.lock")
  })

  test("is empty when nothing default-excluded is re-included", ({ expect }) => {
    expect(getReincludedDefaultExclusions(["**/*", "src/**", "assets/*.png"])).toEqual([])
  })

  test("ignores negated patterns", ({ expect }) => {
    expect(getReincludedDefaultExclusions(["!**/*.obj", "!**/.github/**"])).toEqual([])
  })
})
