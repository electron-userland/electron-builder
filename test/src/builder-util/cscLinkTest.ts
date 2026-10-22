import { decodeCscLinkBase64, decodeStrictBase64, InvalidConfigurationError, loadCscLink } from "builder-util"

// deterministic bytes whose base64 uses the whole alphabet, '+' and '/' included; long enough (> 2048 chars) to be read as base64
const certificate = Buffer.from(Array.from({ length: 2000 }, (_, i) => (i * 131 + 7) % 256))
const certificateBase64 = certificate.toString("base64")

function wrap(value: string, width: number, eol = "\n"): string {
  return value.match(new RegExp(`.{1,${width}}`, "g"))!.join(eol) + eol
}

describe("decodeStrictBase64", () => {
  test("decodes canonical standard base64", ({ expect }) => {
    expect(decodeStrictBase64("QUJD")?.toString()).toBe("ABC")
    expect(decodeStrictBase64("QUI=")?.toString()).toBe("AB")
    expect(decodeStrictBase64("QQ==")?.toString()).toBe("A")
    expect(decodeStrictBase64(certificateBase64)).toEqual(certificate)
  })

  test("ignores whitespace: line wrapping, CRLF and a trailing newline", ({ expect }) => {
    expect(decodeStrictBase64(" QUJD\n")?.toString()).toBe("ABC")
    expect(decodeStrictBase64("QUJD\r\nREVG")?.toString()).toBe("ABCDEF")
    expect(decodeStrictBase64(wrap(certificateBase64, 76))).toEqual(certificate)
    expect(decodeStrictBase64(wrap(certificateBase64, 64, "\r\n"))).toEqual(certificate)
  })

  test("rejects everything Buffer.from would silently decode to garbage", ({ expect }) => {
    const rejected = [
      "",
      " \n\t",
      // unpadded, non-zero padding bits, `=` before the end (two encodings glued together)
      "QUJ",
      "QR==",
      "QQ==QUJD",
      // quoted, URL-safe, stray characters
      '"QUJD"',
      "'QUJD'",
      certificateBase64.replace(/\+/g, "-").replace(/\//g, "_"),
      "QU%JD",
      `${certificateBase64} # comment`,
      // a data: URI is the caller's business, not a base64 value
      "data:text/plain;base64,QUJD",
      "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIA==\n-----END PRIVATE KEY-----\n",
    ]
    for (const value of rejected) {
      expect(decodeStrictBase64(value), JSON.stringify(value)).toBeNull()
    }
  })
})

describe("decodeCscLinkBase64", () => {
  test("returns null for a value that is not read as base64 (a path)", ({ expect }) => {
    for (const link of ["/path/to/certificate.p12", "certs/certificate.p12", "~/certificate.p12", "file:///certificate.p12", "QUJD"]) {
      expect(decodeCscLinkBase64(link), link).toBeNull()
    }
  })

  test("decodes a long value, a value ending with `=` and a data: URI with parameters", ({ expect }) => {
    expect(decodeCscLinkBase64(certificateBase64)).toEqual(certificate)
    expect(decodeCscLinkBase64(wrap(certificateBase64, 76, "\r\n").trim())).toEqual(certificate)
    expect(decodeCscLinkBase64(Buffer.from("from-env").toString("base64"))?.toString()).toBe("from-env")
    expect(decodeCscLinkBase64(`data:application/x-pkcs12;name=certificate.p12;base64,${certificateBase64}`)).toEqual(certificate)
  })

  test("throws for a value read as base64 that is not valid base64, without showing the value", ({ expect }) => {
    const invalid = [
      `"${certificateBase64}"`,
      certificateBase64.replace(/\+/g, "-").replace(/\//g, "_"),
      `${certificateBase64}%`,
      certificateBase64.slice(0, -1),
      `-----BEGIN CERTIFICATE-----\r\n${wrap(certificateBase64, 64, "\r\n")}-----END CERTIFICATE-----`,
      "data:application/x-pkcs12;base64,not base64!",
      "/path/ending/with=",
    ]
    for (const link of invalid) {
      let error: Error | null = null
      try {
        decodeCscLinkBase64(link)
      } catch (e: any) {
        error = e
      }
      expect(error, link.substring(0, 40)).toBeInstanceOf(InvalidConfigurationError)
      expect(error!.message).toContain("is not valid standard base64 (the value is not shown)")
      expect(error!.message).not.toContain(certificateBase64.substring(100, 164))
    }
  })
})

describe("loadCscLink", () => {
  test("decodes a base64 value to text", async ({ expect }) => {
    await expect(loadCscLink(Buffer.from("store credentials").toString("base64"), undefined)).resolves.toBe("store credentials")
  })

  test("rejects an invalid base64 value with an InvalidConfigurationError", async ({ expect }) => {
    await expect(loadCscLink(`'${certificateBase64}'`, undefined)).rejects.toBeInstanceOf(InvalidConfigurationError)
  })
})
