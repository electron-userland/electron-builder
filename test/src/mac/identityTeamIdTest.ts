import { parseIdentityTeamId } from "app-builder-lib/src/targets/mac/MacTargetHelper.js"

// @electron/osx-sign's pattern, which parseIdentityTeamId must agree with (on short names, where it is fast)
const OSX_SIGN_PATTERN = /^.+\((.+?)\)\s*$/

describe("parseIdentityTeamId", () => {
  test("takes the Team ID of an identity name", ({ expect }) => {
    expect(parseIdentityTeamId("Developer ID Application: Foo Inc (ABCDE12345)")).toBe("ABCDE12345")
    expect(parseIdentityTeamId("Apple Development: Jane (Doe) (ABCDE12345) \t")).toBe("ABCDE12345")
    expect(parseIdentityTeamId("Developer ID Application: Foo Inc")).toBeNull()
    expect(parseIdentityTeamId("(ABCDE12345)")).toBeNull()
  })

  test("agrees with @electron/osx-sign's pattern", ({ expect }) => {
    const alphabet = ["a", "(", ")", " ", "\n", "x"]
    // every name of up to 6 characters over the alphabet
    let names = [""]
    for (let length = 1; length <= 6; length++) {
      names = names.flatMap(name => alphabet.map(it => name + it))
      for (const name of names) {
        expect(parseIdentityTeamId(name), JSON.stringify(name)).toBe(OSX_SIGN_PATTERN.exec(name)?.[1] ?? null)
      }
    }
  })

  test("runs in linear time on a name with many parentheses", ({ expect }) => {
    // the input that makes the pattern backtrack polynomially (CodeQL js/polynomial-redos)
    const name = `a(${"a(a".repeat(100_000)}`
    const start = process.hrtime.bigint()
    expect(parseIdentityTeamId(name)).toBeNull()
    expect(parseIdentityTeamId(`${name})`)).toBe("a")
    expect(Number(process.hrtime.bigint() - start) / 1e6).toBeLessThan(500)
  })
})
