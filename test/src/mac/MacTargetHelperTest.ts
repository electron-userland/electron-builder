import { expect } from "vitest"
import { MacTargetHelper } from "app-builder-lib/out/mac/MacTargetHelper"

describe("MacTargetHelper", () => {
  describe("getCertificateTypes", () => {
    const cases: [boolean, boolean, string[]][] = [
      [true, false, ["Apple Distribution", "3rd Party Mac Developer Application"]],
      [true, true, ["Mac Developer", "Apple Development"]],
      [false, false, ["Developer ID Application"]],
      [false, true, ["Mac Developer", "Developer ID Application"]],
    ]

    test.each(cases)("isMas=%s isDevelopment=%s", (isMas, isDevelopment, expected) => {
      expect(MacTargetHelper.getCertificateTypes(isMas, isDevelopment)).toEqual(expected)
    })
  })
})
