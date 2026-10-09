import { log } from "builder-util"
import { REMOVED_ENV_VARS, warnOnRemovedEnvVars } from "app-builder-lib/src/util/removedEnvVars"
import { describe, expect, test, vi } from "vitest"

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
