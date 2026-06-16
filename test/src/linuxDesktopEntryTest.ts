import { buildExecArgs } from "app-builder-lib/src/targets/LinuxTargetHelper"

describe("buildExecArgs", () => {
  test("passes a quoted arg through verbatim (no outer wrapping, no escaping)", ({ expect }) => {
    // https://github.com/electron-userland/electron-builder/issues/9914
    const arg = '--js-flags="--max-old-space-size=12288"'
    expect(buildExecArgs([arg])).toBe(arg)
  })

  test("joins multiple args with a single space", ({ expect }) => {
    expect(buildExecArgs(["--first", "--second=value"])).toBe("--first --second=value")
  })

  test("does not auto-quote args containing spaces", ({ expect }) => {
    expect(buildExecArgs(["--foo=a b"])).toBe("--foo=a b")
  })

  test("leaves field codes untouched", ({ expect }) => {
    expect(buildExecArgs(["%U"])).toBe("%U")
  })

  test("strips carriage-return / newline so the Exec key stays a single line", ({ expect }) => {
    expect(buildExecArgs(["a\nExec=evil"])).toBe("aExec=evil")
    expect(buildExecArgs(["a\r\nb"])).toBe("ab")
  })

  test("returns an empty string for no args", ({ expect }) => {
    expect(buildExecArgs([])).toBe("")
  })
})
