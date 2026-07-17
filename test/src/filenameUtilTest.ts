import { getCompleteExtname, sanitizeFileName } from "builder-util/internal"

// [inputFilename, expectedExtname]
const tests = [
  ["Foo-v1.exe.blockmap", ".exe.blockmap"],
  ["Foo-1.0.0.dmg.blockmap", ".dmg.blockmap"],
  ["Foo-v1.0.0.exe.blockmap", ".exe.blockmap"],
  ["Foo-1.0.0-mac.zip.blockmap", ".zip.blockmap"],
  ["Foo-1.0.0.exe", ".exe"],
  ["foo-1.0.0.exe", ".exe"],
  ["foo.bar-1.0.0.dmg", ".dmg"],
  ["Foo-2.0.0.rc1.dmg", ".dmg"],
  ["Foo-1.0.0-mac.dmg", ".dmg"],
  ["Foo-v1.0.0.zip", ".zip"],
  ["Foo-1.0.0.tar.gz", ".tar.gz"],
  ["Foo-1.0.0.tar.7z", ".tar.7z"],
  ["Foo-1.0.0.7z", ".7z"],
  ["Foo-1.0.0.test.7z", ".7z"],
  ["Foo-1.0.0.tar.xz", ".tar.xz"],
  ["Foo-1.0.0.tar.lz", ".tar.lz"],
  ["Foo-1.0.0.tar.bz2", ".tar.bz2"],
  ["Foo.v2.tar.bz2", ".tar.bz2"],
  ["Foo-v1.0.0.tar.bz2", ".tar.bz2"],
  ["Application.test.dmg", ".dmg"],
  ["Program.1.0.0.beta1.exe", ".exe"],
  ["application.dmg", ".dmg"],
  ["latest.yml", ".yml"],
  [".gitignore", ""],
  [".config.yml", ".yml"],
  ["code.h", ".h"],
]

describe("getCompleteExtname", () => {
  for (const [filename, expected] of tests) {
    test(`get complete extname for ${filename}`, ({ expect }) => {
      const extname = getCompleteExtname(filename)

      expect(extname).toBe(expected)
    })
  }
})

describe("sanitizeFileName", () => {
  test("passes a normal name through unchanged", ({ expect }) => {
    expect(sanitizeFileName("My App")).toBe("My App")
  })

  // Composed (NFC) Unicode must be preserved as-is — it must not be decomposed to NFD, otherwise the
  // on-disk macOS bundle/helper names diverge from CFBundleName.
  test("preserves composed (NFC) Unicode and does not normalize to NFD", ({ expect }) => {
    const nfc = "Tést" // "Tést" with a single composed code point
    const result = sanitizeFileName(nfc)
    expect(result).toBe(nfc)
    expect(result).toBe(result.normalize("NFC"))
    expect(result).not.toBe(nfc.normalize("NFD"))
  })

  test("preserves the sharp-s character (no canonical decomposition)", ({ expect }) => {
    expect(sanitizeFileName("Test App ßW")).toBe("Test App ßW")
  })

  test("strips path separators", ({ expect }) => {
    expect(sanitizeFileName("a/b\\c")).toBe("abc")
  })
})
