import { describe } from "vitest"
import { buildSnapCommandLauncherScript, shellQuote } from "app-builder-lib/out/targets/snap/snapCommand.js"

// Pure unit tests for the snap launcher-script helpers shared by the snap cores.
// Full snap build flows are exercised by snapcraftTest.ts.

describe.sequential("snapCommand helpers", () => {
  describe("buildSnapCommandLauncherScript", () => {
    test("execs the app binary under $SNAP/app with forwarded args", ({ expect }) => {
      const content = buildSnapCommandLauncherScript({ execName: "sep", args: [] })
      expect(content).toContain("#!/bin/sh")
      expect(content).toContain('exec "$SNAP/app/sep"')
      expect(content.trimEnd().endsWith('"$@"')).toBe(true)
    })

    test("single-quotes embedded args so forbidden characters are passed literally", ({ expect }) => {
      const content = buildSnapCommandLauncherScript({ execName: "sep", args: ['--js-flags="--max-old-space-size=4096"', "--ozone-platform=x11"] })
      expect(content).toContain(shellQuote('--js-flags="--max-old-space-size=4096"'))
      expect(content).toContain(shellQuote("--ozone-platform=x11"))
    })

    test("rejects executable names that are unsafe to embed in a shell script", ({ expect }) => {
      expect(() => buildSnapCommandLauncherScript({ execName: "app$evil", args: [] })).toThrow(/not safe in shell scripts/)
      expect(() => buildSnapCommandLauncherScript({ execName: "app`id`", args: [] })).toThrow(/not safe in shell scripts/)
      expect(() => buildSnapCommandLauncherScript({ execName: 'app"name', args: [] })).toThrow(/not safe in shell scripts/)
    })
  })

  describe("shellQuote", () => {
    test("wraps a simple arg in single quotes", ({ expect }) => {
      expect(shellQuote("--no-sandbox")).toBe("'--no-sandbox'")
    })

    test("escapes embedded single quotes", ({ expect }) => {
      expect(shellQuote("it's")).toBe("'it'\\''s'")
    })

    test("neutralizes shell metacharacters", ({ expect }) => {
      expect(shellQuote("--flag=$(evil)")).toBe("'--flag=$(evil)'")
      expect(shellQuote("`id`")).toBe("'`id`'")
    })
  })
})
