import { isValidPublisherNameDn, matchPublisherName, PUBLISHER_NAME_REQUIRED_DN_ATTRIBUTES } from "builder-util-runtime"

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
  test("requires a DN with both CN and O", ({ expect }) => {
    expect(PUBLISHER_NAME_REQUIRED_DN_ATTRIBUTES).toEqual(["CN", "O"])
    expect(isValidPublisherNameDn("CN=Acme Corp, O=Acme Corporation")).toBe(true)
    expect(isValidPublisherNameDn("C=US, O=Acme Corporation, CN=Acme Corp")).toBe(true)
    expect(isValidPublisherNameDn(SUBJECT)).toBe(true)
    expect(isValidPublisherNameDn('CN=Acme Corp, O="Acme, Inc."')).toBe(true)
  })

  test("rejects a bare name, a DN with the CN only or the O only, and empty values", ({ expect }) => {
    expect(isValidPublisherNameDn("Acme Corp")).toBe(false)
    expect(isValidPublisherNameDn("Acme, Inc")).toBe(false)
    expect(isValidPublisherNameDn("CN=Acme Corp")).toBe(false)
    expect(isValidPublisherNameDn("O=Acme Corporation, C=US")).toBe(false)
    expect(isValidPublisherNameDn("CN=Acme Corp, O=")).toBe(false)
    expect(isValidPublisherNameDn("")).toBe(false)
    // attribute names are the ones Windows reports, which are upper case
    expect(isValidPublisherNameDn("cn=Acme Corp, o=Acme Corporation")).toBe(false)
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

  test("a DN with the CN only never matches", ({ expect }) => {
    expect(match(["CN=Acme Corp"])).toBe(false)
    expect(match(["CN=Acme Corp, C=US"])).toBe(false)
  })

  test("a CN + O DN matches when every configured RDN equals the subject's value, in any order", ({ expect }) => {
    expect(match([SUBJECT])).toBe(true)
    expect(match(["C=US, S=California, O=Acme Corporation, CN=Acme Corp"])).toBe(true)
    expect(match(["CN=Acme Corp, O=Acme Corporation"])).toBe(true)
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
    expect(match(["Old Corp", "CN=Acme Corp", "CN=Acme Corp, O=Acme Corporation, C=US"])).toBe(true)
    expect(match(["CN=Old Corp, O=Old Org", "Acme Corp", "CN=Acme Corp"])).toBe(false)
  })

  test("no configured name, or a subject without the O, never matches", ({ expect }) => {
    expect(match([])).toBe(false)
    expect(match([""], "O=Acme Corporation, C=US")).toBe(false)
    expect(match(["CN=Acme Corp, O=Acme Corporation"], "CN=Acme Corp, C=US")).toBe(false)
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
