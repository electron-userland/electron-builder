import { expect } from "vitest"
import { assertSafeHelperName, getAvailableHelperSuffixes, type AvailableHelpers } from "app-builder-lib/internal"

describe("electronMacUtils", () => {
  describe("assertSafeHelperName", () => {
    const accepted = [
      "MyApp",
      "My App",
      "Test App ßW", // sharp-s, has no NFD decomposition
      "Café", // accented, NFC form must be preserved
      "电子应用", // CJK
      "App (Beta) - 2.0",
      "", // empty has no separators; emptiness is validated elsewhere
    ]
    test.each(accepted)("accepts %j", name => {
      expect(() => assertSafeHelperName(name, "productName")).not.toThrow()
    })

    const NUL = String.fromCharCode(0)
    // Anything filename sanitization would alter must be rejected, not just path separators.
    const rejected = ["a/b", "/abs/path", "../escape", "a\\b", "C:\\Windows", "Foo:Bar", "Star*", 'Quote"', "Trailing.", "Trailing ", `a${NUL}b`]
    test.each(rejected)("rejects %j", name => {
      expect(() => assertSafeHelperName(name, "productName")).toThrow(/is not a valid macOS app bundle name/)
    })

    test("error message includes the field name and the offending value", () => {
      expect(() => assertSafeHelperName("foo/bar", "executableName")).toThrow(/executableName "foo\/bar"/)
    })
  })

  describe("getAvailableHelperSuffixes", () => {
    test("always includes the base ' Helper' suffix", () => {
      expect(getAvailableHelperSuffixes({})).toEqual([" Helper"])
    })

    test("includes every variant in deterministic order when all are present", () => {
      const all: Required<AvailableHelpers> = { EH: true, NP: true, Renderer: true, Plugin: true, GPU: true }
      expect(getAvailableHelperSuffixes(all)).toEqual([" Helper", " Helper EH", " Helper NP", " Helper (Renderer)", " Helper (Plugin)", " Helper (GPU)"])
    })

    test("modern Electron variants (no EH/NP)", () => {
      expect(getAvailableHelperSuffixes({ Renderer: true, Plugin: true, GPU: true })).toEqual([" Helper", " Helper (Renderer)", " Helper (Plugin)", " Helper (GPU)"])
    })

    const single: [keyof AvailableHelpers, string][] = [
      ["EH", " Helper EH"],
      ["NP", " Helper NP"],
      ["Renderer", " Helper (Renderer)"],
      ["Plugin", " Helper (Plugin)"],
      ["GPU", " Helper (GPU)"],
    ]
    test.each(single)("present:%s adds %j after the base", (key, suffix) => {
      expect(getAvailableHelperSuffixes({ [key]: true })).toEqual([" Helper", suffix])
    })

    test("ignores falsy flags", () => {
      expect(getAvailableHelperSuffixes({ EH: false, GPU: undefined })).toEqual([" Helper"])
    })
  })
})
