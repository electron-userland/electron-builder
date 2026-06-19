import { NsisScriptGenerator, nsisEscapeString, ProgIdMaker } from "app-builder-lib/internal"

// A valid lowercase UUID, used as the default app GUID in most cases below.
const GUID = "50e065bc-3134-11e6-9bab-38c9862bdaf3"

// Microsoft ProgID rules (https://learn.microsoft.com/windows/win32/com/-progid--key):
//   - at most 39 characters,
//   - only alphanumeric characters plus a single separating period,
//   - must not start with a digit.
const VALID_PROG_ID = /^[A-Za-z][A-Za-z0-9]*\.[A-Za-z0-9]+$/

function assertSpecCompliant(expect: any, progId: string) {
  expect(progId.length).toBeLessThanOrEqual(39)
  expect(progId).toMatch(VALID_PROG_ID)
  // exactly one period
  expect(progId.split(".")).toHaveLength(2)
  // no spaces or other punctuation
  expect(progId).not.toMatch(/[^A-Za-z0-9.]/)
  // never starts with a digit
  expect(progId).not.toMatch(/^\d/)
}

// remove a single leading dot, mirroring platformPackager.normalizeExt
const normalizeExt = (ext: string) => (ext.startsWith(".") ? ext.substring(1) : ext)

describe("ProgIdMaker.progId — Microsoft spec compliance", () => {
  const productFilenames = [
    "My Great Editor", // typical
    "7-Zip", // sanitizes to "7Zip" (too short → GUID fallback)
    "7-Zip Archiver Pro", // numeric-leading but long enough → App prefix
    "A", // far too short → GUID fallback
    "AB.CD", // sanitizes to "ABCD" (too short)
    "日本語ソフト", // all non-ASCII → empty → GUID fallback
    "***", // all punctuation → empty → GUID fallback
    "Über Editor 2000", // unicode + digits + spaces
    "lowercaseonly",
  ]
  const namesOrExts = ["txt", ".md", "My Text File", "7z", "", "ファイル", "a.b.c"]

  for (const productFilename of productFilenames) {
    for (const nameOrExt of namesOrExts) {
      test(`product="${productFilename}" nameOrExt="${nameOrExt}" is spec-compliant`, ({ expect }) => {
        const progId = new ProgIdMaker(GUID, productFilename).progId(normalizeExt(nameOrExt))
        assertSpecCompliant(expect, progId)
      })
    }
  }

  test("never produces an empty program segment (leading period)", ({ expect }) => {
    // even when both the product filename and the GUID sanitize to nothing usable
    const progId = new ProgIdMaker("***", "***").progId("txt")
    expect(progId.startsWith(".")).toBe(false)
    assertSpecCompliant(expect, progId)
  })

  test("numeric-leading product names are prefixed with App so the ProgID never starts with a digit", ({ expect }) => {
    const progId = new ProgIdMaker(GUID, "7-Zip Archiver Pro").progId("zip")
    expect(progId.startsWith("App")).toBe(true)
    assertSpecCompliant(expect, progId)
  })

  test("empty nameOrExt does not throw and stays compliant", ({ expect }) => {
    const progId = new ProgIdMaker(GUID, "My Great Editor").progId("")
    assertSpecCompliant(expect, progId)
  })
})

describe("ProgIdMaker.progId — determinism (install/uninstall symmetry)", () => {
  test("repeated calls on the same instance are identical", ({ expect }) => {
    const maker = new ProgIdMaker(GUID, "My Great Editor")
    expect(maker.progId("txt")).toBe(maker.progId("txt"))
  })

  test("two independent instances with the same inputs produce identical ProgIDs", ({ expect }) => {
    // The installer (register) and uninstaller (unregister) build separate ProgIdMaker instances
    // from the same appGuid + productFilename; they MUST agree or uninstall orphans registry keys.
    const register = new ProgIdMaker(GUID, "My Great Editor")
    const unregister = new ProgIdMaker(GUID, "My Great Editor")
    for (const nameOrExt of ["txt", "md", "My Text File", "7z"]) {
      expect(register.progId(nameOrExt)).toBe(unregister.progId(nameOrExt))
    }
  })
})

describe("ProgIdMaker.progId — uniqueness", () => {
  test("different extensions within the same app yield different ProgIDs", ({ expect }) => {
    const maker = new ProgIdMaker(GUID, "My Great Editor")
    expect(maker.progId("txt")).not.toBe(maker.progId("md"))
  })

  test("different apps (different GUID) yield different ProgIDs for the same extension", ({ expect }) => {
    const a = new ProgIdMaker("11111111-1111-1111-1111-111111111111", "My Great Editor")
    const b = new ProgIdMaker("22222222-2222-2222-2222-222222222222", "My Great Editor")
    expect(a.progId("txt")).not.toBe(b.progId("txt"))
  })

  test("different product names yield different ProgIDs", ({ expect }) => {
    const a = new ProgIdMaker(GUID, "Editor One").progId("txt")
    const b = new ProgIdMaker(GUID, "Editor Two").progId("txt")
    expect(a).not.toBe(b)
  })
})

describe("ProgIdMaker — GUID normalization", () => {
  test("a non-UUID guid string is accepted and produces a compliant ProgID", ({ expect }) => {
    const progId = new ProgIdMaker("my-custom-guid", "Acme Tool").progId("acme")
    assertSpecCompliant(expect, progId)
  })

  test("uppercase and lowercase forms of the same UUID produce identical ProgIDs", ({ expect }) => {
    const lower = new ProgIdMaker("50e065bc-3134-11e6-9bab-38c9862bdaf3", "My Great Editor")
    const upper = new ProgIdMaker("50E065BC-3134-11E6-9BAB-38C9862BDAF3", "My Great Editor")
    expect(upper.progId("txt")).toBe(lower.progId("txt"))
    assertSpecCompliant(expect, upper.progId("txt"))
  })

  test("distinct uppercase GUIDs differing only in hex letters stay distinct", ({ expect }) => {
    // Guards against UUID.parse collapsing uppercase hex letters to a single corrupt namespace.
    const a = new ProgIdMaker("12AB34CD-0000-1000-8000-000000000000", "MyEditor").progId("txt")
    const b = new ProgIdMaker("12FF34EE-0000-1000-8000-000000000000", "MyEditor").progId("txt")
    expect(a).not.toBe(b)
  })
})

describe("ProgIdMaker.progId — format regression (golden)", () => {
  // Lock the exact output so a future refactor cannot silently change ProgIDs (which would orphan
  // registry keys on upgrade for already-installed apps).
  test("typical app", ({ expect }) => {
    expect(new ProgIdMaker(GUID, "My Great Editor").progId("txt")).toBe("MyGreatEditor.txt018aa8d2547350da9984d7")
  })

  test("non-UUID guid", ({ expect }) => {
    expect(new ProgIdMaker("my-custom-guid", "Acme Tool").progId("acme")).toBe("AcmeTool.acme8a5fae61779b5fe881af4f57bd")
  })

  test("short product name falls back to App + GUID program segment", ({ expect }) => {
    expect(new ProgIdMaker(GUID, "7-Zip").progId("zip")).toBe("App50e065bc313411e6.zip6fea2117e8495b04")
  })
})

describe("file-association generation flow", () => {
  // Mirrors NsisTarget.computeScriptAndSignUninstaller: the register and unregister passes each build
  // their own ProgIdMaker from the same appGuid + productFilename and must emit matching ProgIDs.
  const productFilename = "My Great Editor"
  const associations: Array<{ ext: string; name?: string; description?: string }> = [
    { ext: ".txt", name: "My Text File", description: "Plain text" },
    { ext: "md" }, // no explicit name → ProgID derives from the extension
  ]

  test("APP_ASSOCIATE and APP_UNASSOCIATE reference the same, compliant ProgID per association", ({ expect }) => {
    const registerMaker = new ProgIdMaker(GUID, productFilename)
    const unregisterMaker = new ProgIdMaker(GUID, productFilename)

    const register = new NsisScriptGenerator()
    const unregister = new NsisScriptGenerator()

    for (const item of associations) {
      const ext = normalizeExt(item.ext)
      const nameOrExt = item.name || ext

      const registerProgId = registerMaker.progId(nameOrExt)
      const unregisterProgId = unregisterMaker.progId(nameOrExt)
      expect(registerProgId).toBe(unregisterProgId)
      assertSpecCompliant(expect, registerProgId)

      register.insertMacro("APP_ASSOCIATE", `"${nsisEscapeString(ext)}" "${registerProgId}" "${nsisEscapeString(item.description || "")}" "$appExe,0" "Open" "$appExe"`)
      unregister.insertMacro("APP_UNASSOCIATE", `"${nsisEscapeString(ext)}" "${unregisterProgId}"`)
    }

    const registerScript = register.build()
    const unregisterScript = unregister.build()
    // every ProgID emitted on register is removed on unregister
    for (const item of associations) {
      const progId = registerMaker.progId(item.name || normalizeExt(item.ext))
      expect(registerScript).toContain(`"${progId}"`)
      expect(unregisterScript).toContain(`"${progId}"`)
    }
  })

  test("a backtick in the association description cannot break out of the macro argument", ({ expect }) => {
    // FileAssociation.nsh wraps the description in a backtick-delimited string; an un-escaped
    // backtick would terminate it early and fail the build.
    const description = "weird ` name"
    // the bare backtick is replaced with the NSIS escape $\` so it can no longer close the string
    expect(nsisEscapeString(description)).toBe("weird $\\` name")
  })
})
