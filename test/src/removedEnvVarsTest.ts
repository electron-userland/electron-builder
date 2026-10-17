import { log } from "builder-util"
import { assertNoRemovedEnvVars, checkRemovedEnvVars, resetRemovedEnvVarsCheck } from "app-builder-lib/internal"
import { REMOVED_ENV_VARS, warnOnRemovedEnvVars } from "app-builder-lib/src/util/removedEnvVars"
import { promises as fs } from "fs"
import * as path from "path"
import { describe, expect, test, vi } from "vitest"

/** Every variable v26 honored and v27 ignores, with the `toolsets` (or other) replacement it must name. */
const REMOVED: Array<[name: string, expectedInMessage: string]> = [
  ["APPIMAGE_TOOLS_PATH", "toolsets.appimage"],
  ["LINUX_TOOLS_MAC_PATH", "toolsets.linuxToolsMac"],
  ["CUSTOM_FPM_PATH", "toolsets.fpm"],
  ["USE_SYSTEM_FPM", "toolsets.fpm"],
  ["ELECTRON_BUILDER_NSIS_DIR", "toolsets.nsis"],
  ["ELECTRON_BUILDER_NSIS_RESOURCES_DIR", "toolsets.nsis"],
  ["ELECTRON_BUILDER_WINE_TOOLSET_DIR", "toolsets.wine"],
  ["USE_SYSTEM_WINE", "toolsets.wine"],
  ["USE_SYSTEM_SIGNCODE", "toolsets.winCodeSign"],
  ["USE_SYSTEM_OSSLSIGNCODE", "toolsets.winCodeSign"],
  ["SIGNTOOL_PATH", "toolsets.winCodeSign"],
  ["ELECTRON_BUILDER_7ZIP_PATH", "toolsets.sevenZip"],
  ["ELECTRON_BUILDER_ICONS_TOOLSET_DIR", "toolsets.icons"],
  ["CI_BUILD_TAG", "CI_COMMIT_TAG"],
  ["ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY", "ignoredProductionDependencies"],
]

describe("checkRemovedEnvVars", () => {
  test("an empty environment produces no message", () => {
    expect(checkRemovedEnvVars({})).toBeNull()
  })

  test("an unrelated variable produces no message", () => {
    expect(checkRemovedEnvVars({ ELECTRON_BUILDER_CACHE: "/tmp/cache", CI: "true" })).toBeNull()
  })

  test("an empty-string value is treated as unset — CI systems export blanks routinely", () => {
    expect(checkRemovedEnvVars({ USE_SYSTEM_WINE: "" })).toBeNull()
  })

  test.each(REMOVED)("%s names its replacement", (name, expected) => {
    const message = checkRemovedEnvVars({ [name]: "1" })
    expect(message).not.toBeNull()
    expect(message).toContain(name)
    expect(message).toContain(expected)
    expect(message).toContain("v27-breaking-changes")
  })

  test("every removed variable is reported at once, not just the first", () => {
    const env = Object.fromEntries(REMOVED.map(([name]) => [name, "1"]))
    const message = checkRemovedEnvVars(env)!
    expect(message).toContain(`${REMOVED.length} environment variables`)
    for (const [name] of REMOVED) {
      expect(message).toContain(name)
    }
  })

  test("a single variable uses the singular header", () => {
    expect(checkRemovedEnvVars({ USE_SYSTEM_WINE: "true" })).toContain("The environment variable USE_SYSTEM_WINE was removed")
  })
})

describe("assertNoRemovedEnvVars", () => {
  test("throws for a removed variable and only checks once per process", () => {
    resetRemovedEnvVarsCheck()
    const previous = process.env.USE_SYSTEM_WINE
    process.env.USE_SYSTEM_WINE = "true"
    try {
      expect(() => assertNoRemovedEnvVars()).toThrow(/USE_SYSTEM_WINE/)
      // Already checked — a second call is a no-op so one build does not fail repeatedly.
      expect(() => assertNoRemovedEnvVars()).not.toThrow()
    } finally {
      if (previous == null) {
        delete process.env.USE_SYSTEM_WINE
      } else {
        process.env.USE_SYSTEM_WINE = previous
      }
      resetRemovedEnvVarsCheck()
    }
  })

  test("does not throw for a clean environment", () => {
    resetRemovedEnvVarsCheck()
    expect(() => assertNoRemovedEnvVars()).not.toThrow()
  })
})

describe("repo hygiene", () => {
  // A removed variable set by our own CI or test fixtures would fail every build that reads it.
  test("this repository does not set any removed variable", async () => {
    const roots = ["test/src", ".github/workflows", "docker"]
    const offenders: string[] = []
    const walk = async (dir: string): Promise<string[]> => {
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
      const files: string[] = []
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        files.push(...(entry.isDirectory() ? await walk(full) : [full]))
      }
      return files
    }
    for (const root of roots) {
      for (const file of await walk(root)) {
        // Skip this file — its own fixtures name every removed variable by design.
        if (!/\.(ts|js|yml|yaml|sh)$/.test(file) || file.endsWith("removedEnvVarsTest.ts")) {
          continue
        }
        const text = await fs.readFile(file, "utf8")
        for (const [name] of REMOVED) {
          // Assignment or export, not a mention in a comment.
          if (new RegExp(`(^|\\s|;)(export\\s+)?${name}\\s*[:=]`, "m").test(text)) {
            offenders.push(`${file}: ${name}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe("warnOnRemovedEnvVars", () => {
  test("warns exactly once for each removed env var, tagged with its name and v27 remediation", () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => log)
    try {
      for (const { name } of REMOVED_ENV_VARS) {
        warn.mockClear()
        warnOnRemovedEnvVars({ [name]: "some-value" })
        expect(warn, name).toHaveBeenCalledTimes(1)
        const [data, message] = warn.mock.calls[0]
        expect((data as any).envVar).toBe(name)
        expect(message).toMatch(/removed in electron-builder v27/)
      }
    } finally {
      warn.mockRestore()
    }
  })

  test("emits one warning per removed var when several are set", () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => log)
    try {
      warnOnRemovedEnvVars({ USE_SYSTEM_WINE: "true", CI_BUILD_TAG: "v1.0.0", SIGNTOOL_PATH: "/opt/signtool" })
      expect(warn).toHaveBeenCalledTimes(3)
      const warned = warn.mock.calls.map(([data]) => (data as any).envVar)
      expect(warned).toEqual(expect.arrayContaining(["USE_SYSTEM_WINE", "CI_BUILD_TAG", "SIGNTOOL_PATH"]))
    } finally {
      warn.mockRestore()
    }
  })

  test("does not warn for internal/test-only vars that are intentionally excluded", () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => log)
    try {
      warnOnRemovedEnvVars({ JEST_WORKER_ID: "1", TEST_SET_BABEL_PRESET: "true", npm_lifecycle_event: "release" })
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  test("does not warn for the replacement variable names", () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => log)
    try {
      warnOnRemovedEnvVars({ ELECTRON_BUILDER_DANGEROUSLY_ALLOW_HTTP: "true", CI_COMMIT_TAG: "v1.0.0" })
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  test("does not warn when no removed var is set", () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => log)
    try {
      warnOnRemovedEnvVars({ PATH: "/usr/bin", HOME: "/home/user" })
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  test("reads process.env by default", () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => log)
    process.env.CI_BUILD_TAG = "v1.0.0"
    try {
      warnOnRemovedEnvVars()
      expect(warn).toHaveBeenCalledTimes(1)
      expect((warn.mock.calls[0][0] as any).envVar).toBe("CI_BUILD_TAG")
    } finally {
      delete process.env.CI_BUILD_TAG
      warn.mockRestore()
    }
  })
})
