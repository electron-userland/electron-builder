import { isDistinguishedName, matchPublisherName } from "builder-util-runtime"

// The matcher electron-updater verifies downloaded updates with, shared with electron-builder's build-time check of the
// signed installer. It takes the parsed Get-AuthenticodeSignature output; subjects are in the format Windows reports them.
const SUBJECT = "CN=Acme Corp, O=Acme Corporation, L=San Francisco, S=California, C=US"

function signedBy(subject: string) {
  return { SignerCertificate: { Subject: subject } }
}

function match(publisherNames: Array<string>, subject = SUBJECT) {
  return matchPublisherName(signedBy(subject), publisherNames)
}

describe("matchPublisherName", () => {
  test("a bare common name never matches, not even the subject's CN", ({ expect }) => {
    expect(match(["Acme Corp"])).toBe(false)
    expect(match(["acme corp"])).toBe(false)
    expect(match(["Acme"])).toBe(false)
  })

  test("DN matches when every configured RDN equals the subject's value, in any order", ({ expect }) => {
    expect(match([SUBJECT])).toBe(true)
    expect(match(["C=US, S=California, CN=Acme Corp"])).toBe(true)
    expect(match(["CN=Acme Corp, O=Acme Corporation"])).toBe(true)
    expect(match(["CN=Acme Corp"])).toBe(true)
  })

  test("DN with a different value or a key the subject lacks does not match", ({ expect }) => {
    expect(match(["CN=Acme Corp, O=Other Org"])).toBe(false)
    expect(match(["CN=Acme Corp, OU=Engineering"])).toBe(false)
    expect(match(["CN=acme corp"])).toBe(false)
  })

  test("the state RDN is S, as Windows reports it — an OpenSSL-style ST does not match", ({ expect }) => {
    expect(match(["CN=Acme Corp, S=California"])).toBe(true)
    expect(match(["CN=Acme Corp, ST=California"])).toBe(false)
  })

  test("quoted subject values are compared unquoted", ({ expect }) => {
    const subject = 'CN=Acme Corp, O="Acme, Inc.", C=US'
    expect(match(['CN=Acme Corp, O="Acme, Inc."'], subject)).toBe(true)
    expect(match(["Acme Corp"], subject)).toBe(false)
  })

  test("any matching DN in the list matches (certificate rotation); bare names in the list are ignored", ({ expect }) => {
    expect(match(["Old Corp", "CN=Old Corp, O=Old Org", "CN=Acme Corp, C=US"])).toBe(true)
    expect(match(["Acme Corp", "CN=Old Corp, O=Old Org"])).toBe(false)
  })

  test("no configured name, or an empty one, never matches", ({ expect }) => {
    expect(match([])).toBe(false)
    expect(match([""], "O=Acme Corporation, C=US")).toBe(false)
  })

  test("throws for a signature without a signer certificate (electron-updater only calls it for a Valid signature)", ({ expect }) => {
    expect(() => matchPublisherName({ SignerCertificate: null }, ["CN=Acme Corp"])).toThrow(TypeError)
  })
})

describe("isDistinguishedName", () => {
  test("a name with at least one KEY=value attribute is a DN, a bare name is not", ({ expect }) => {
    expect(isDistinguishedName("CN=Acme Corp, O=Acme Corporation, C=US")).toBe(true)
    expect(isDistinguishedName("CN=Acme Corp")).toBe(true)
    expect(isDistinguishedName('CN="Acme, Inc."')).toBe(true)
    expect(isDistinguishedName("Acme Corp")).toBe(false)
    expect(isDistinguishedName("Acme, Inc.")).toBe(false)
    expect(isDistinguishedName("")).toBe(false)
  })
})
