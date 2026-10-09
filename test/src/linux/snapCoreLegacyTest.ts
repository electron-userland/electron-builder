import { describe } from "vitest"
import { assertTemplateSnapCompressionSupported, buildCommandShContent, shellQuote } from "app-builder-lib/src/targets/linux/snap/coreLegacy"
import { InvalidConfigurationError } from "builder-util"

// Pure unit tests for module-level helpers exported from coreLegacy.ts.
// Full snap build flows are exercised by snapTest.ts.

describe("snapCoreLegacy helpers", { concurrent: false }, () => {
  describe("buildCommandShContent", () => {
    test("template build: desktop scripts sourced from $SNAP root", ({ expect }) => {
      const content = buildCommandShContent({ isTemplate: true, executableName: "myapp", extraAppArgs: [] })
      expect(content).toContain('"$SNAP/desktop-init.sh"')
      expect(content).toContain('"$SNAP/desktop-common.sh"')
      expect(content).toContain('"$SNAP/desktop-gnome-specific.sh"')
    })

    test("template build: executable has no app/ prefix", ({ expect }) => {
      const content = buildCommandShContent({ isTemplate: true, executableName: "myapp", extraAppArgs: [] })
      expect(content).toContain('"$SNAP/myapp"')
      expect(content).not.toContain('"$SNAP/app/myapp"')
    })

    test("no-template build: desktop scripts sourced from $SNAP root (dump plugin stages scripts/ to snap root)", ({ expect }) => {
      // The snapcraft.yaml launch-scripts part uses `plugin: dump, source: scripts` which
      // dumps stageDir/scripts/ contents directly into the snap root — so $SNAP/desktop-*.sh
      // is the correct path even for no-template builds.
      const content = buildCommandShContent({ isTemplate: false, executableName: "myapp", extraAppArgs: [] })
      expect(content).toContain('"$SNAP/desktop-init.sh"')
      expect(content).toContain('"$SNAP/desktop-common.sh"')
      expect(content).toContain('"$SNAP/desktop-gnome-specific.sh"')
    })

    test("no-template build: desktop scripts are NOT referenced with a scripts/ prefix", ({ expect }) => {
      // The scripts/ subdir is an intermediate staging dir; the dump plugin flattens it to snap root.
      const content = buildCommandShContent({ isTemplate: false, executableName: "myapp", extraAppArgs: [] })
      expect(content).not.toContain('"$SNAP/scripts/desktop-init.sh"')
      expect(content).not.toContain('"$SNAP/scripts/desktop-common.sh"')
      expect(content).not.toContain('"$SNAP/scripts/desktop-gnome-specific.sh"')
    })

    test("no-template build: executable has app/ prefix", ({ expect }) => {
      const content = buildCommandShContent({ isTemplate: false, executableName: "myapp", extraAppArgs: [] })
      expect(content).toContain('"$SNAP/app/myapp"')
    })

    test("extraAppArgs are shell-quoted and appended", ({ expect }) => {
      const content = buildCommandShContent({ isTemplate: true, executableName: "myapp", extraAppArgs: ["--no-sandbox", "--flag=it's"] })
      expect(content).toContain("'--no-sandbox'")
      expect(content).toContain("'--flag=it'\\''s'")
    })

    test("trailing $@ is always appended to forward snap args", ({ expect }) => {
      const content = buildCommandShContent({ isTemplate: true, executableName: "myapp", extraAppArgs: [] })
      expect(content).toMatch(/"\$@"\s*$/)
    })

    test("shebang is present", ({ expect }) => {
      const content = buildCommandShContent({ isTemplate: true, executableName: "myapp", extraAppArgs: [] })
      expect(content).toMatch(/^#!\/bin\/bash/)
    })

    test("executableName with shell-safe chars is accepted", ({ expect }) => {
      expect(() => buildCommandShContent({ isTemplate: true, executableName: "my-app_v2.0", extraAppArgs: [] })).not.toThrow()
    })

    test("executableName containing $ throws InvalidConfigurationError", ({ expect }) => {
      expect(() => buildCommandShContent({ isTemplate: true, executableName: "app$evil", extraAppArgs: [] })).toThrow(/not safe in shell scripts/)
    })

    test("executableName containing backtick throws", ({ expect }) => {
      expect(() => buildCommandShContent({ isTemplate: true, executableName: "app`id`", extraAppArgs: [] })).toThrow(/not safe in shell scripts/)
    })

    test("executableName containing double-quote throws", ({ expect }) => {
      expect(() => buildCommandShContent({ isTemplate: true, executableName: 'app"name', extraAppArgs: [] })).toThrow(/not safe in shell scripts/)
    })

    test("executableName containing backslash throws", ({ expect }) => {
      expect(() => buildCommandShContent({ isTemplate: true, executableName: "app\\evil", extraAppArgs: [] })).toThrow(/not safe in shell scripts/)
    })
  })

  describe("shellQuote", () => {
    test("wraps a plain argument in single quotes", ({ expect }) => {
      expect(shellQuote("--no-sandbox")).toBe("'--no-sandbox'")
    })

    test("wraps an argument containing spaces so it is treated as one word", ({ expect }) => {
      expect(shellQuote("hello world")).toBe("'hello world'")
    })

    test("escapes embedded single quotes using the '\\'' sequence", ({ expect }) => {
      expect(shellQuote("it's")).toBe("'it'\\''s'")
    })

    test("multiple embedded single quotes are each escaped independently", ({ expect }) => {
      expect(shellQuote("a'b'c")).toBe("'a'\\''b'\\''c'")
    })

    test("dollar signs are rendered literal (no variable expansion risk)", ({ expect }) => {
      // Inside single quotes the shell treats $ as literal
      expect(shellQuote("--flag=$(evil)")).toBe("'--flag=$(evil)'")
    })

    test("backticks are rendered literal inside single quotes", ({ expect }) => {
      expect(shellQuote("`id`")).toBe("'`id`'")
    })

    test("empty string produces empty single-quoted string", ({ expect }) => {
      expect(shellQuote("")).toBe("''")
    })

    test("flag=value with embedded single quote escapes correctly", ({ expect }) => {
      // Input: --title=app's → single-quote in value is escaped as '\''
      expect(shellQuote("--title=app's")).toBe("'--title=app'\\''s'")
    })
  })

  describe("assertTemplateSnapCompressionSupported", () => {
    test('lzo with toolsets.appimage "0.0.0" throws InvalidConfigurationError naming the fix', ({ expect }) => {
      const call = () => assertTemplateSnapCompressionSupported("0.0.0", "lzo")
      expect(call).toThrow(InvalidConfigurationError)
      expect(call).toThrow(/toolsets\.appimage "0\.0\.0"/)
      expect(call).toThrow(/Set toolsets\.appimage to "latest"/)
    })

    test('xz with toolsets.appimage "0.0.0" is accepted', ({ expect }) => {
      expect(() => assertTemplateSnapCompressionSupported("0.0.0", "xz")).not.toThrow()
    })

    test.for([
      ["unset", undefined],
      ["latest", "latest"],
      ["1.0.3", "1.0.3"],
      ["1.1.0", "1.1.0"],
    ] as const)("lzo with toolsets.appimage %s is accepted", ([_label, toolset], { expect }) => {
      expect(() => assertTemplateSnapCompressionSupported(toolset, "lzo")).not.toThrow()
    })

    test("lzo with a custom toolsets.appimage bundle is accepted", ({ expect }) => {
      expect(() => assertTemplateSnapCompressionSupported({ url: "file:///custom/appimage", checksum: "abc" }, "lzo")).not.toThrow()
    })
  })
})
