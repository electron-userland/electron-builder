import { NsisScriptGenerator, nsisEscapeString } from "app-builder-lib/src/targets/nsis/nsisScriptGenerator"

describe("NsisScriptGenerator.file", () => {
  test("preserves $INSTDIR variable in output name without escaping", ({ expect }) => {
    const gen = new NsisScriptGenerator()
    gen.file("$INSTDIR\\resources\\icon.ico", "C:\\build\\icon.ico")
    expect(gen.build()).toContain(`File "/oname=$INSTDIR\\resources\\icon.ico" "C:\\build\\icon.ico"`)
  })

  test("omits /oname when outputName is null", ({ expect }) => {
    const gen = new NsisScriptGenerator()
    gen.file(null, "C:\\build\\icon.ico")
    expect(gen.build()).toBe(`File "C:\\build\\icon.ico"\n`)
  })
})

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

  test("preserves ${...} variable references unchanged", ({ expect }) => {
    expect(nsisEscapeString("${INSTDIR}\\resources\\icon.ico")).toBe("${INSTDIR}\\resources\\icon.ico")
  })

  test("escapes bare $ but leaves ${...} references intact", ({ expect }) => {
    expect(nsisEscapeString("${INSTDIR}\\price $9.99")).toBe("${INSTDIR}\\price $$9.99")
  })
})
