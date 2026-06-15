import { describe } from "vitest"
import { buildSnapCommandLauncherScript, isSnapCommandSafe, resolveSnapCommand, shellQuote } from "app-builder-lib/src/targets/linux/snap/snapCommand"

// Pure unit tests for the snap command-resolution helpers shared by the snap cores.
// Full snap build flows are exercised by snapcraftTest.ts.

describe.sequential("snapCommand helpers", () => {
  describe("isSnapCommandSafe", () => {
    test("accepts the allowed snapd character set", ({ expect }) => {
      expect(isSnapCommandSafe("app/sep")).toBe(true)
      expect(isSnapCommandSafe("app/sep --no-sandbox")).toBe(true)
      expect(isSnapCommandSafe("app/my-app.bin --disable-gpu --foo:bar #1 $VAR")).toBe(true)
    })

    test("rejects '=' and quotes", ({ expect }) => {
      expect(isSnapCommandSafe("app/sep --ozone-platform=x11")).toBe(false)
      expect(isSnapCommandSafe('app/sep --js-flags="--max-old-space-size=4096"')).toBe(false)
      expect(isSnapCommandSafe("app/sep --flag='value'")).toBe(false)
    })
  })

  describe("resolveSnapCommand", () => {
    test("keeps the command inline when no args are given", ({ expect }) => {
      expect(resolveSnapCommand({ execName: "sep", args: [], launcherScriptName: "command.sh" })).toEqual({
        command: "app/sep",
        launcherArgs: null,
      })
    })

    test("keeps the command inline when args are safe", ({ expect }) => {
      expect(resolveSnapCommand({ execName: "sep", args: ["--no-sandbox", "--disable-gpu"], launcherScriptName: "command.sh" })).toEqual({
        command: "app/sep --no-sandbox --disable-gpu",
        launcherArgs: null,
      })
    })

    test("redirects to the launcher when args contain forbidden characters", ({ expect }) => {
      const args = ["--ozone-platform=x11", "--no-sandbox"]
      expect(resolveSnapCommand({ execName: "sep", args, launcherScriptName: "command.sh" })).toEqual({
        command: "command.sh",
        launcherArgs: args,
      })
    })

    test("redirects to the launcher when the executable name itself is unsafe", ({ expect }) => {
      expect(resolveSnapCommand({ execName: "my=app", args: [], launcherScriptName: "command.sh" })).toEqual({
        command: "command.sh",
        launcherArgs: [],
      })
    })
  })

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
