import { resolveToolsetVersion } from "app-builder-lib/src/toolsets/version"

describe("resolveToolsetVersion", () => {
  test("'latest' resolves to the newest version", ({ expect }) => {
    expect(resolveToolsetVersion("latest", "1.3.0")).toBe("1.3.0")
  })

  test("null resolves to the newest version", ({ expect }) => {
    expect(resolveToolsetVersion(null, "1.3.0")).toBe("1.3.0")
  })

  test("undefined resolves to the newest version", ({ expect }) => {
    expect(resolveToolsetVersion(undefined, "1.3.0")).toBe("1.3.0")
  })

  test("an explicit version is passed through unchanged", ({ expect }) => {
    expect(resolveToolsetVersion("0.0.0", "1.3.0")).toBe("0.0.0")
    expect(resolveToolsetVersion("1.0.1", "1.0.1")).toBe("1.0.1")
  })

  test("the legacy '0.0.0' pin is never coerced to the newest version", ({ expect }) => {
    expect(resolveToolsetVersion<"0.0.0" | "1.1.0">("0.0.0", "1.1.0")).toBe("0.0.0")
  })
})
