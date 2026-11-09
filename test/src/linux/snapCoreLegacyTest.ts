import { execFileSync } from "child_process"
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

    const snapLibDirs = "$SNAP/lib:$SNAP/usr/lib:$SNAP/lib/x86_64-linux-gnu:$SNAP/usr/lib/x86_64-linux-gnu"
    // The command.sh lines both LD_LIBRARY_PATH branches share to drop empty entries from `_ld_library_path` and export it.
    const exportWithoutEmptyEntries =
      'while [[ $_ld_library_path == *::* ]]; do _ld_library_path="${_ld_library_path//::/:}"; done\n' +
      '_ld_library_path="${_ld_library_path#:}"\n' +
      '_ld_library_path="${_ld_library_path%:}"\n' +
      'if [[ -n $_ld_library_path ]]; then export LD_LIBRARY_PATH="$_ld_library_path"; else unset LD_LIBRARY_PATH; fi\n' +
      "unset _ld_library_path"
    const ldLibraryPathPreamble = `_ld_library_path=":$SNAP_LIBRARY_PATH:${snapLibDirs}:$LD_LIBRARY_PATH:${snapLibDirs}:"\n${exportWithoutEmptyEntries}`

    // Runs the command.sh preamble (everything between the shebang and `exec`) in `bash -e` after `snapdExpansion`, and
    // prints LD_LIBRARY_PATH and the configured carrier afterwards ("<unset>" when unset).
    function runPreamble(opts: { libraryArchTriplet?: string; useConfiguredLibraryPath?: boolean }, snapdExpansion: string, env: Record<string, string>) {
      const content = buildCommandShContent({ isTemplate: true, executableName: "myapp", extraAppArgs: [], ...opts })
      const preamble = content.slice(content.indexOf("\n") + 1, content.indexOf("\nexec "))
      const script = `${snapdExpansion}\n${preamble}\nprintf '%s\\n%s' "\${LD_LIBRARY_PATH-<unset>}" "\${ELECTRON_BUILDER_SNAP_LD_LIBRARY_PATH-<unset>}"`
      const [ldLibraryPath, carrier] = execFileSync("bash", ["-e", "-c", script], { env: { PATH: process.env.PATH, SNAP: "/snap/myapp/1", ...env }, encoding: "utf8" }).split("\n")
      return { ldLibraryPath, carrier }
    }

    test("default LD_LIBRARY_PATH: command.sh builds it from SNAP_LIBRARY_PATH, the snap's dirs and the caller's value before the app starts", ({ expect }) => {
      const content = buildCommandShContent({ isTemplate: true, executableName: "myapp", extraAppArgs: [], libraryArchTriplet: "x86_64-linux-gnu" })
      expect(content).toContain(`\n${ldLibraryPathPreamble}\n`)
      // set before the desktop scripts and the app start
      expect(content.indexOf("export LD_LIBRARY_PATH=")).toBeLessThan(content.indexOf("exec "))
    })

    const expansionCases: Array<[string, Record<string, string>, string]> = [
      ["both set", { SNAP_LIBRARY_PATH: "/gl", LD_LIBRARY_PATH: "/caller" }, "/gl:{dirs}:/caller:{dirs}"],
      ["both unset", {}, "{dirs}:{dirs}"],
      ["both empty", { SNAP_LIBRARY_PATH: "", LD_LIBRARY_PATH: "" }, "{dirs}:{dirs}"],
      ["SNAP_LIBRARY_PATH unset, caller set", { LD_LIBRARY_PATH: "/caller" }, "{dirs}:/caller:{dirs}"],
      ["SNAP_LIBRARY_PATH set, caller unset", { SNAP_LIBRARY_PATH: "/gl" }, "/gl:{dirs}:{dirs}"],
      ["caller value with a leading colon", { LD_LIBRARY_PATH: ":/opt/x/lib" }, "{dirs}:/opt/x/lib:{dirs}"],
      ["caller value with a trailing colon", { LD_LIBRARY_PATH: "/opt/x/lib:" }, "{dirs}:/opt/x/lib:{dirs}"],
      ["caller value with a doubled colon", { LD_LIBRARY_PATH: "/a::/b" }, "{dirs}:/a:/b:{dirs}"],
      ["caller value of only colons", { LD_LIBRARY_PATH: "::" }, "{dirs}:{dirs}"],
      ["SNAP_LIBRARY_PATH with a trailing colon", { SNAP_LIBRARY_PATH: "/gl:", LD_LIBRARY_PATH: "/caller" }, "/gl:{dirs}:/caller:{dirs}"],
    ]
    for (const [label, env, expected] of expansionCases) {
      test.ifNotWindows(`default LD_LIBRARY_PATH expands without empty entries in bash: ${label}`, ({ expect }) => {
        const { ldLibraryPath } = runPreamble({ libraryArchTriplet: "x86_64-linux-gnu" }, "", env)
        const dirs = "/snap/myapp/1/lib:/snap/myapp/1/usr/lib:/snap/myapp/1/lib/x86_64-linux-gnu:/snap/myapp/1/usr/lib/x86_64-linux-gnu"
        expect(ldLibraryPath).toBe(expected.replaceAll("{dirs}", dirs))
        expect(ldLibraryPath.split(":")).not.toContain("")
      })
    }

    test("no-template legacy build: full command.sh sets LD_LIBRARY_PATH and launches app/<executable>", ({ expect }) => {
      const content = buildCommandShContent({ isTemplate: false, executableName: "myapp", extraAppArgs: ["--no-sandbox"], libraryArchTriplet: "x86_64-linux-gnu" })
      expect(content).toBe(
        "#!/bin/bash -e\n" +
          '_ld_library_path=":$SNAP_LIBRARY_PATH:$SNAP/lib:$SNAP/usr/lib:$SNAP/lib/x86_64-linux-gnu:$SNAP/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH:$SNAP/lib:$SNAP/usr/lib:$SNAP/lib/x86_64-linux-gnu:$SNAP/usr/lib/x86_64-linux-gnu:"\n' +
          'while [[ $_ld_library_path == *::* ]]; do _ld_library_path="${_ld_library_path//::/:}"; done\n' +
          '_ld_library_path="${_ld_library_path#:}"\n' +
          '_ld_library_path="${_ld_library_path%:}"\n' +
          'if [[ -n $_ld_library_path ]]; then export LD_LIBRARY_PATH="$_ld_library_path"; else unset LD_LIBRARY_PATH; fi\n' +
          "unset _ld_library_path\n" +
          `exec "$SNAP/desktop-init.sh" "$SNAP/desktop-common.sh" "$SNAP/desktop-gnome-specific.sh" "$SNAP/app/myapp" '--no-sandbox' "$@"\n`
      )
    })

    test("classic confinement (no arch triplet): full command.sh has no LD_LIBRARY_PATH preamble", ({ expect }) => {
      // createDescriptor sets neither the triplet nor useConfiguredLibraryPath for classic confinement
      const content = buildCommandShContent({ isTemplate: true, executableName: "myapp", extraAppArgs: [], libraryArchTriplet: null, useConfiguredLibraryPath: false })
      expect(content).toBe(`#!/bin/bash -e\nexec "$SNAP/desktop-init.sh" "$SNAP/desktop-common.sh" "$SNAP/desktop-gnome-specific.sh" "$SNAP/myapp" "$@"\n`)
    })

    test("configured LD_LIBRARY_PATH: full command.sh exports it from the snap.yaml carrier without empty entries", ({ expect }) => {
      const content = buildCommandShContent({ isTemplate: true, executableName: "myapp", extraAppArgs: [], useConfiguredLibraryPath: true })
      expect(content).toBe(
        "#!/bin/bash -e\n" +
          '_ld_library_path=":$ELECTRON_BUILDER_SNAP_LD_LIBRARY_PATH:"\n' +
          "unset ELECTRON_BUILDER_SNAP_LD_LIBRARY_PATH\n" +
          `${exportWithoutEmptyEntries}\n` +
          `exec "$SNAP/desktop-init.sh" "$SNAP/desktop-common.sh" "$SNAP/desktop-gnome-specific.sh" "$SNAP/myapp" "$@"\n`
      )
    })

    // `snapdExpansion` stands in for snapd expanding the snap.yaml carrier (plain `$VAR` expansion, an unset variable becomes "").
    function runConfiguredPreamble(snapdExpansion: string, env: Record<string, string>) {
      return runPreamble({ useConfiguredLibraryPath: true }, snapdExpansion, env)
    }

    const callerCases: Array<[string, Record<string, string>, string]> = [
      ["set", { LD_LIBRARY_PATH: "/caller" }, "/snap/myapp/1/custom:/caller"],
      ["unset", {}, "/snap/myapp/1/custom"],
      ["empty", { LD_LIBRARY_PATH: "" }, "/snap/myapp/1/custom"],
    ]
    for (const reference of ["$LD_LIBRARY_PATH", "${LD_LIBRARY_PATH}"]) {
      for (const [label, env, expected] of callerCases) {
        test.ifNotWindows(`configured "$SNAP/custom:${reference}" with the caller's value ${label} expands without empty entries in bash`, ({ expect }) => {
          const { ldLibraryPath, carrier } = runConfiguredPreamble(`export ELECTRON_BUILDER_SNAP_LD_LIBRARY_PATH="$SNAP/custom:${reference}"`, env)
          expect(ldLibraryPath).toBe(expected)
          expect(ldLibraryPath.split(":")).not.toContain("")
          expect(carrier).toBe("<unset>")
        })
      }
    }

    const expandedCases: Array<[string, string, string]> = [
      ["leading empty entry", ":/a", "/a"],
      ["empty entries in the middle", "/a::/b:::/c", "/a:/b:/c"],
      ["entries with spaces and glob characters are kept as-is", "/a b:*:/c?", "/a b:*:/c?"],
      ["only empty entries", ":::", "<unset>"],
      ["empty value", "", "<unset>"],
    ]
    for (const [label, expanded, expected] of expandedCases) {
      test.ifNotWindows(`configured LD_LIBRARY_PATH replaces the caller's value without empty entries in bash: ${label}`, ({ expect }) => {
        const { ldLibraryPath } = runConfiguredPreamble("", { LD_LIBRARY_PATH: "/caller", ELECTRON_BUILDER_SNAP_LD_LIBRARY_PATH: expanded })
        expect(ldLibraryPath).toBe(expected)
      })
    }

    test.ifNotWindows("configured LD_LIBRARY_PATH: a missing carrier leaves LD_LIBRARY_PATH unset in bash", ({ expect }) => {
      expect(runConfiguredPreamble("", { LD_LIBRARY_PATH: "/caller" }).ldLibraryPath).toBe("<unset>")
    })

    test("the default LD_LIBRARY_PATH takes precedence over a configured one", ({ expect }) => {
      const content = buildCommandShContent({
        isTemplate: true,
        executableName: "myapp",
        extraAppArgs: [],
        libraryArchTriplet: "x86_64-linux-gnu",
        useConfiguredLibraryPath: true,
      })
      expect(content).toContain(`\n${ldLibraryPathPreamble}\n`)
      expect(content).not.toContain("ELECTRON_BUILDER_SNAP_LD_LIBRARY_PATH")
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
