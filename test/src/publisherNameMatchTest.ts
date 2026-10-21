import { isValidPublisherNameDn, matchPublisherName } from "builder-util-runtime"

// The matcher electron-updater verifies downloaded updates with, shared with electron-builder's build-time check of the
// signed installer. It takes the parsed Get-AuthenticodeSignature output; subjects are in the format Windows reports them.
const SUBJECT = "CN=Acme Corp, O=Acme Corporation, L=San Francisco, S=California, C=US"

function signedBy(subject: string) {
  return { SignerCertificate: { Subject: subject } }
}

function match(publisherNames: Array<string>, subject = SUBJECT): boolean {
  return matchPublisherName(signedBy(subject), publisherNames)
}

describe("isValidPublisherNameDn", () => {
  test("accepts any distinguished name: one or more attribute=value pairs", ({ expect }) => {
    expect(isValidPublisherNameDn("CN=Acme Corp")).toBe(true)
    expect(isValidPublisherNameDn("O=Acme Corporation, C=US")).toBe(true)
    expect(isValidPublisherNameDn("CN=Acme Corp, O=Acme Corporation")).toBe(true)
    expect(isValidPublisherNameDn("C=US, O=Acme Corporation, CN=Acme Corp")).toBe(true)
    expect(isValidPublisherNameDn(SUBJECT)).toBe(true)
    expect(isValidPublisherNameDn('CN=Acme Corp, O="Acme, Inc."')).toBe(true)
    expect(isValidPublisherNameDn("E=dev@example.com, CN=Acme Corp, SERIALNUMBER=12345, OID.2.5.4.15=Private Organization")).toBe(true)
    // the attribute names are not checked: a lower-case one is DN format, it just never matches a subject as Windows reports it
    expect(isValidPublisherNameDn("cn=Acme Corp")).toBe(true)
  })

  test("rejects a bare name, an empty string, and an empty attribute name or value", ({ expect }) => {
    expect(isValidPublisherNameDn("Acme Corp")).toBe(false)
    expect(isValidPublisherNameDn("Acme, Inc")).toBe(false)
    expect(isValidPublisherNameDn("")).toBe(false)
    expect(isValidPublisherNameDn("   ")).toBe(false)
    expect(isValidPublisherNameDn("CN=")).toBe(false)
    expect(isValidPublisherNameDn("CN=Acme Corp, O=")).toBe(false)
    expect(isValidPublisherNameDn('CN=Acme Corp, O=""')).toBe(false)
    expect(isValidPublisherNameDn("=Acme Corp")).toBe(false)
  })

  test("never throws for a value that is not a string", ({ expect }) => {
    for (const value of [null, undefined, 42, {}, ["CN=Acme Corp, O=Acme Corporation"], Symbol("x")]) {
      expect(isValidPublisherNameDn(value)).toBe(false)
    }
  })
})

describe("matchPublisherName", () => {
  test("a bare name never matches, not even the subject CN", ({ expect }) => {
    expect(match(["Acme Corp"])).toBe(false)
    expect(match(["acme corp"])).toBe(false)
  })

  test("a DN with the CN only matches by the CN", ({ expect }) => {
    expect(match(["CN=Acme Corp"])).toBe(true)
    expect(match(["CN=Acme Corp, C=US"])).toBe(true)
    expect(match(["CN=Other Corp"])).toBe(false)
    // values and attribute names are compared strictly
    expect(match(["CN=acme corp"])).toBe(false)
    expect(match(["cn=Acme Corp"])).toBe(false)
  })

  test("a DN matches when every configured RDN equals the subject's value, in any order", ({ expect }) => {
    expect(match([SUBJECT])).toBe(true)
    expect(match(["C=US, S=California, O=Acme Corporation, CN=Acme Corp"])).toBe(true)
    expect(match(["CN=Acme Corp, O=Acme Corporation"])).toBe(true)
    expect(match(["O=Acme Corporation, C=US"])).toBe(true)
  })

  test("DN with a different value or a key the subject lacks does not match", ({ expect }) => {
    expect(match(["CN=Acme Corp, O=Other Org"])).toBe(false)
    expect(match(["CN=Other Corp, O=Acme Corporation"])).toBe(false)
    expect(match(["CN=Acme Corp, O=Acme Corporation, OU=Engineering"])).toBe(false)
  })

  test("the state RDN is S, as Windows reports it — an OpenSSL-style ST does not match", ({ expect }) => {
    expect(match(["CN=Acme Corp, O=Acme Corporation, S=California"])).toBe(true)
    expect(match(["CN=Acme Corp, O=Acme Corporation, ST=California"])).toBe(false)
  })

  test("quoted subject values are compared unquoted", ({ expect }) => {
    const subject = 'CN=Acme Corp, O="Acme, Inc.", C=US'
    expect(match(['CN=Acme Corp, O="Acme, Inc."'], subject)).toBe(true)
    expect(match(["Acme Corp"], subject)).toBe(false)
  })

  test("passes when any configured name matches (certificate rotation); invalid entries are skipped", ({ expect }) => {
    expect(match(["Old Corp", "CN=Acme Corp, O=Acme Corporation, C=US"])).toBe(true)
    expect(match(["CN=Old Corp, O=Old Org", "Acme Corp", "CN=Acme Corp, O="])).toBe(false)
  })

  test("no configured name never matches; a DN never matches a subject that lacks one of its attributes", ({ expect }) => {
    expect(match([])).toBe(false)
    expect(match([""], "O=Acme Corporation, C=US")).toBe(false)
    expect(match(["CN=Acme Corp, O=Acme Corporation"], "CN=Acme Corp, C=US")).toBe(false)
    expect(match(["CN=Acme Corp"], "O=Acme Corporation, C=US")).toBe(false)
  })

  test("an entry that is not a string never matches and does not throw", ({ expect }) => {
    // app-update.yml is YAML: a hand-edited publisherName may hold anything
    const names: Array<any> = [42, null, { CN: "Acme Corp" }, "CN=Acme Corp, O=Acme Corporation"]
    expect(match(names)).toBe(true)
    expect(match(names.slice(0, 3))).toBe(false)
  })

  test("throws for a signature without a signer certificate subject (electron-updater only calls it for a Valid signature)", ({ expect }) => {
    expect(() => matchPublisherName({ SignerCertificate: null }, ["CN=Acme Corp, O=Acme Corporation"])).toThrow(TypeError)
    expect(() => matchPublisherName({}, ["CN=Acme Corp, O=Acme Corporation"])).toThrow(TypeError)
    expect(() => matchPublisherName({ SignerCertificate: { Subject: 42 } }, ["CN=Acme Corp, O=Acme Corporation"])).toThrow(TypeError)
  })
})
