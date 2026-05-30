import { nsisEscapeString } from "app-builder-lib/src/targets/nsis/nsisScriptGenerator"

describe("nsisEscapeString", () => {
  test("leaves plain strings unchanged", ({ expect }) => {
    expect(nsisEscapeString("Hello World")).toBe("Hello World")
  })

  test("replaces LF newline with space", ({ expect }) => {
    expect(nsisEscapeString("line1\nline2")).toBe("line1 line2")
  })

  test("replaces CRLF newline with space", ({ expect }) => {
    expect(nsisEscapeString("line1\r\nline2")).toBe("line1 line2")
  })

  test("replaces standalone CR with space", ({ expect }) => {
    expect(nsisEscapeString("line1\rline2")).toBe("line1 line2")
  })

  test("escapes dollar sign to prevent variable expansion", ({ expect }) => {
    expect(nsisEscapeString("price $9.99")).toBe("price $$9.99")
  })

  test("escapes double quote", ({ expect }) => {
    expect(nsisEscapeString('say "hello"')).toBe('say $\\"hello$\\"')
  })

  test("handles combined special characters", ({ expect }) => {
    expect(nsisEscapeString('Copyright © 2024 "Acme" $Corp\r\nAll rights reserved')).toBe('Copyright © 2024 $\\"Acme$\\" $$Corp All rights reserved')
  })
})
