import { matchPublisherName } from "builder-util-runtime"
import { vi } from "vitest"

// The matcher electron-updater verifies downloaded updates with, shared with electron-builder's build-time check of the
// signed installer. It takes the parsed Get-AuthenticodeSignature output; subjects are in the format Windows reports them.
const SUBJECT = "CN=Acme Corp, O=Acme Corporation, L=San Francisco, S=California, C=US"

function signedBy(subject: string) {
  return { SignerCertificate: { Subject: subject } }
}

function match(publisherNames: Array<string>, subject = SUBJECT) {
  const logger = { warn: vi.fn() }
  return { matched: matchPublisherName(signedBy(subject), publisherNames, logger), warnings: logger.warn.mock.calls.map(it => it[0]) }
}

describe("matchPublisherName", () => {
  test("plain name matches the subject CN strictly, with a warning", ({ expect }) => {
    expect(match(["Acme Corp"])).toEqual({
      matched: true,
      warnings: ["Signature validated using only CN Acme Corp. Please add your full Distinguished Name (DN) to publisherNames configuration"],
    })
    expect(match(["acme corp"])).toEqual({ matched: false, warnings: [] })
    expect(match(["Acme"])).toEqual({ matched: false, warnings: [] })
  })

  test("DN matches when every configured RDN equals the subject's value, in any order, without a warning", ({ expect }) => {
    expect(match([SUBJECT])).toEqual({ matched: true, warnings: [] })
    expect(match(["C=US, S=California, CN=Acme Corp"])).toEqual({ matched: true, warnings: [] })
    expect(match(["CN=Acme Corp, O=Acme Corporation"])).toEqual({ matched: true, warnings: [] })
  })

  test("DN with a different value or a key the subject lacks does not match", ({ expect }) => {
    expect(match(["CN=Acme Corp, O=Other Org"]).matched).toBe(false)
    expect(match(["CN=Acme Corp, OU=Engineering"]).matched).toBe(false)
  })

  test("the state RDN is S, as Windows reports it — an OpenSSL-style ST does not match", ({ expect }) => {
    expect(match(["CN=Acme Corp, S=California"]).matched).toBe(true)
    expect(match(["CN=Acme Corp, ST=California"]).matched).toBe(false)
  })

  test("quoted subject values are compared unquoted", ({ expect }) => {
    const subject = 'CN=Acme Corp, O="Acme, Inc.", C=US'
    expect(match(['CN=Acme Corp, O="Acme, Inc."'], subject)).toEqual({ matched: true, warnings: [] })
    expect(match(["Acme Corp"], subject).matched).toBe(true)
  })

  test("names are tried in order and the first match wins", ({ expect }) => {
    expect(match(["Old Corp", "CN=Acme Corp, C=US", "Acme Corp"])).toEqual({ matched: true, warnings: [] })
    expect(match(["Acme Corp", "CN=Acme Corp, C=US"]).warnings).toHaveLength(1)
  })

  test("no configured name, or a subject without a CN, never matches by CN", ({ expect }) => {
    expect(match([]).matched).toBe(false)
    expect(match([""], "O=Acme Corporation, C=US").matched).toBe(false)
    expect(match(["Acme Corporation"], "O=Acme Corporation, C=US").matched).toBe(false)
  })

  test("throws for a signature without a signer certificate (electron-updater only calls it for a Valid signature)", ({ expect }) => {
    expect(() => matchPublisherName({ SignerCertificate: null }, ["Acme Corp"], { warn: vi.fn() })).toThrow(TypeError)
  })
})
