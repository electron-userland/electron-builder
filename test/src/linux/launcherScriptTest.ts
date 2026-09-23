import { describe } from "vitest"
import { buildLauncherScript, shellQuote } from "app-builder-lib/src/targets/linux/launcherScript"

// Pure unit tests for the shared Linux launcher-entrypoint helper used by every Linux target.

describe("buildLauncherScript", () => {
  test('execs the command and always forwards "$@"', ({ expect }) => {
    const content = buildLauncherScript({ command: ['"$SNAP/app/foo"'] })
    expect(content).toBe('#!/bin/sh\nexec "$SNAP/app/foo" "$@"\n')
  })

  test("single-quotes args so embedded characters are passed literally", ({ expect }) => {
    // https://github.com/electron-userland/electron-builder/issues/9914
    const content = buildLauncherScript({ command: ['"/opt/MyApp/myapp"'], args: ['--js-flags="--max-old-space-size=12288"'] })
    expect(content).toBe(`#!/bin/sh\nexec "/opt/MyApp/myapp" '--js-flags="--max-old-space-size=12288"' "$@"\n`)
  })

  test("does not auto-quote the command tokens (shell vars stay expandable)", ({ expect }) => {
    const content = buildLauncherScript({ command: ['"$SNAP/desktop-init.sh"', '"$SNAP/app/foo"'], args: ["--no-sandbox"] })
    expect(content).toContain('exec "$SNAP/desktop-init.sh" "$SNAP/app/foo" \'--no-sandbox\' "$@"')
  })

  test("omits the args section entirely when there are none", ({ expect }) => {
    const content = buildLauncherScript({ command: ['"foo"'], args: [] })
    expect(content).toBe('#!/bin/sh\nexec "foo" "$@"\n')
  })

  test("honors a custom shebang and preamble", ({ expect }) => {
    const content = buildLauncherScript({ shebang: "#!/bin/bash -e", preamble: 'export TMPDIR="x"', command: ['"foo"'] })
    expect(content).toBe('#!/bin/bash -e\nexport TMPDIR="x"\nexec "foo" "$@"\n')
  })
})

describe("shellQuote", () => {
  test("wraps a plain arg in single quotes", ({ expect }) => {
    expect(shellQuote("--no-sandbox")).toBe("'--no-sandbox'")
  })

  test("escapes embedded single quotes", ({ expect }) => {
    expect(shellQuote("it's")).toBe("'it'\\''s'")
  })

  test("renders shell metacharacters literal", ({ expect }) => {
    expect(shellQuote("--flag=$(evil)")).toBe("'--flag=$(evil)'")
    expect(shellQuote("`id`")).toBe("'`id`'")
  })
})
