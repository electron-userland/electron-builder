import { FilterStats } from "builder-util"
import { FileMatcher, getFileMatchers, GetFileMatchersOptions } from "app-builder-lib/internal"
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
