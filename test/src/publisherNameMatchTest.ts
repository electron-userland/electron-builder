import { matchPublisherName } from "builder-util-runtime"

// The matcher shared by electron-updater (update signature verification) and electron-builder (build-time check of
// the signed installer and of the signing certificate). Subjects are in the format Windows reports them.
const SUBJECT = "CN=Acme Corp, O=Acme Corporation, L=San Francisco, S=California, C=US"

describe("matchPublisherName", () => {
  test("plain name matches the subject CN strictly", ({ expect }) => {
    expect(matchPublisherName(["Acme Corp"], SUBJECT)).toEqual({ publisherName: "Acme Corp", kind: "cn" })
    expect(matchPublisherName(["acme corp"], SUBJECT)).toBeNull()
    expect(matchPublisherName(["Acme"], SUBJECT)).toBeNull()
  })

  test("DN matches when every configured RDN equals the subject's value, in any order", ({ expect }) => {
    expect(matchPublisherName([SUBJECT], SUBJECT)).toEqual({ publisherName: SUBJECT, kind: "dn" })
    expect(matchPublisherName(["C=US, S=California, CN=Acme Corp"], SUBJECT)?.kind).toBe("dn")
    expect(matchPublisherName(["CN=Acme Corp, O=Acme Corporation"], SUBJECT)?.kind).toBe("dn")
  })

  test("DN with a different value or a key the subject lacks does not match", ({ expect }) => {
    expect(matchPublisherName(["CN=Acme Corp, O=Other Org"], SUBJECT)).toBeNull()
    expect(matchPublisherName(["CN=Acme Corp, OU=Engineering"], SUBJECT)).toBeNull()
  })

  test("the state RDN is S, as Windows reports it — an OpenSSL-style ST does not match", ({ expect }) => {
    expect(matchPublisherName(["CN=Acme Corp, S=California"], SUBJECT)).not.toBeNull()
    expect(matchPublisherName(["CN=Acme Corp, ST=California"], SUBJECT)).toBeNull()
  })

  test("quoted subject values are compared unquoted", ({ expect }) => {
    const subject = 'CN=Acme Corp, O="Acme, Inc.", C=US'
    expect(matchPublisherName(['CN=Acme Corp, O="Acme, Inc."'], subject)?.kind).toBe("dn")
    expect(matchPublisherName(["Acme Corp"], subject)?.kind).toBe("cn")
  })

  test("the first matching name wins, so a DN listed first matches without the CN-only fallback", ({ expect }) => {
    expect(matchPublisherName(["Old Corp", "CN=Acme Corp, C=US", "Acme Corp"], SUBJECT)).toEqual({ publisherName: "CN=Acme Corp, C=US", kind: "dn" })
    expect(matchPublisherName(["Acme Corp", "CN=Acme Corp, C=US"], SUBJECT)).toEqual({ publisherName: "Acme Corp", kind: "cn" })
  })

  test("no configured name, or a subject without a CN, never matches by CN", ({ expect }) => {
    expect(matchPublisherName([], SUBJECT)).toBeNull()
    expect(matchPublisherName([""], "O=Acme Corporation, C=US")).toBeNull()
    expect(matchPublisherName(["Acme Corporation"], "O=Acme Corporation, C=US")).toBeNull()
  })
})
