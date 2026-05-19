import { removePassword, filterSensitiveEnv } from "builder-util"
import { parseValidEnvVarUrl } from "builder-util/out/envUtil"
import { afterEach, vi } from "vitest"

const testValue = "secretValue"
const testQuoted = "secret with spaces"

const keys = ["--accessKey", "--secretKey", "-p", "-pass", "-String", "/p", "pass:"]

keys.forEach(key => {
  describe(`removePassword: ${key}`, () => {
    test("handles unquoted value (snapshot)", ({ expect }) => {
      const input = `${key} ${testValue}`
      const output = removePassword(input)

      expect(output).toMatchSnapshot()
    })

    test("handles double-quoted value (snapshot)", ({ expect }) => {
      const input = `${key} "${testQuoted}"`
      const output = removePassword(input)

      expect(output).toMatchSnapshot()
    })

    test("handles single-quoted value (snapshot)", ({ expect }) => {
      const input = `${key} '${testQuoted}'`
      const output = removePassword(input)

      expect(output).toMatchSnapshot()
    })

    if (key === "/p") {
      test("handles Mac host path without hashing (snapshot)", ({ expect }) => {
        const macPath = "\\\\Mac\\Host\\Users\\user"
        const input = `${key} ${macPath}`
        const output = removePassword(input)

        expect(output).toMatchSnapshot()
      })
    }
  })
})

describe("removePassword: /b … /c block", () => {
  test("handles /b … /c block (snapshot)", ({ expect }) => {
    const secret = "blockSecret"
    const input = `/b ${secret} /c`
    const output = removePassword(input)

    expect(output).toMatchSnapshot()
  })
})

describe("validateEnvVarUrl", () => {
  const VAR = "TEST_VALIDATE_URL_VAR"

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("returns null when env var is not set", ({ expect }) => {
    delete process.env[VAR]
    expect(parseValidEnvVarUrl(VAR)).toBeNull()
  })

  test("throws when value is not a valid URL", ({ expect }) => {
    vi.stubEnv(VAR, "not-a-url")
    expect(() => parseValidEnvVarUrl(VAR)).toThrow(`${VAR} is not a valid URL`)
  })

  test("throws when protocol is http (non-https)", ({ expect }) => {
    vi.stubEnv(VAR, "http://example.com/")
    expect(() => parseValidEnvVarUrl(VAR)).toThrow(`${VAR} must use https://`)
  })

  test("throws when protocol is file", ({ expect }) => {
    vi.stubEnv(VAR, "file:///etc/passwd")
    expect(() => parseValidEnvVarUrl(VAR)).toThrow(`${VAR} must use https://`)
  })

  test("returns the URL string for a valid https URL", ({ expect }) => {
    vi.stubEnv(VAR, "https://mirror.example.com/")
    expect(parseValidEnvVarUrl(VAR)).toBe("https://mirror.example.com/")
  })

  test("returns the URL string unchanged when it has a path and query", ({ expect }) => {
    vi.stubEnv(VAR, "https://mirror.example.com/path?q=1")
    expect(parseValidEnvVarUrl(VAR)).toBe("https://mirror.example.com/path?q=1")
  })
})

describe("removePassword: word boundary protection", () => {
  test("does not redact -path argument", ({ expect }) => {
    const input = "tool -path /some/dir"
    expect(removePassword(input)).toBe(input)
  })

  test("does not redact -pid argument", ({ expect }) => {
    const input = "tool -pid 1234"
    expect(removePassword(input)).toBe(input)
  })

  test("does not redact -StringLength argument", ({ expect }) => {
    const input = "tool -StringLength 10"
    expect(removePassword(input)).toBe(input)
  })

  test("does not redact a bare file path containing /p", ({ expect }) => {
    const input = "/path/to/file"
    expect(removePassword(input)).toBe(input)
  })

  test("redacts -passphrase argument", ({ expect }) => {
    const input = "tool -passphrase secret"
    expect(removePassword(input)).not.toContain("secret")
  })

  test("still redacts -p when it is a standalone flag", ({ expect }) => {
    const input = "tool -p secret"
    expect(removePassword(input)).not.toContain("secret")
  })

  test("still redacts /p when preceded by whitespace", ({ expect }) => {
    const input = "tool /p secret"
    expect(removePassword(input)).not.toContain("secret")
  })
})

describe("removePassword: case-insensitive flag matching", () => {
  const secret = "caseSecret"

  test("redacts -P (uppercase variant of -p)", ({ expect }) => {
    expect(removePassword(`-P ${secret}`)).not.toContain(secret)
  })

  test("redacts -PASS (uppercase variant of -pass)", ({ expect }) => {
    expect(removePassword(`-PASS ${secret}`)).not.toContain(secret)
  })

  test("redacts -STRING (uppercase variant of -String)", ({ expect }) => {
    expect(removePassword(`-STRING ${secret}`)).not.toContain(secret)
  })

  test("redacts --ACCESSKEY (uppercase variant of --accessKey)", ({ expect }) => {
    expect(removePassword(`--ACCESSKEY ${secret}`)).not.toContain(secret)
  })
})

describe("removePassword: pass: colon-separator style", () => {
  test("redacts pass:value with no space (OpenSSL style)", ({ expect }) => {
    // -pass is NOT in the input, so the pass: pattern handles it directly
    const output = removePassword("enc pass:topsecret --other")
    expect(output).not.toContain("topsecret")
    expect(output).toContain("pass:")
    expect(output).toContain("(sha256 hash)")
  })

  test("redacts pass: value with space", ({ expect }) => {
    const output = removePassword("pass: spaced")
    expect(output).not.toContain("spaced")
    expect(output).toContain("(sha256 hash)")
  })
})

const SHA256_HASH_RE = /^[a-f0-9]{64} \(sha256 hash\)$/

describe("filterSensitiveEnv", () => {
  test("redacts values for keys containing KEY", ({ expect }) => {
    const result = filterSensitiveEnv({ MY_API_KEY: "abc123" })
    expect(result.MY_API_KEY).toMatch(SHA256_HASH_RE)
  })

  test("redacts values for keys containing TOKEN", ({ expect }) => {
    const result = filterSensitiveEnv({ GITHUB_TOKEN: "ghp_secret" })
    expect(result.GITHUB_TOKEN).toMatch(SHA256_HASH_RE)
  })

  test("redacts values for keys containing SECRET", ({ expect }) => {
    const result = filterSensitiveEnv({ AWS_SECRET_ACCESS_KEY: "secret" })
    expect(result.AWS_SECRET_ACCESS_KEY).toMatch(SHA256_HASH_RE)
  })

  test("redacts values for keys containing PASSWORD", ({ expect }) => {
    const result = filterSensitiveEnv({ DB_PASSWORD: "hunter2" })
    expect(result.DB_PASSWORD).toMatch(SHA256_HASH_RE)
  })

  test("is case-insensitive on the key name", ({ expect }) => {
    const result = filterSensitiveEnv({ api_key: "secret", Auth_Token: "tok" })
    expect(result.api_key).toMatch(SHA256_HASH_RE)
    expect(result.Auth_Token).toMatch(SHA256_HASH_RE)
  })

  test("does not redact values for non-sensitive keys", ({ expect }) => {
    const result = filterSensitiveEnv({ NODE_ENV: "production", PATH: "/usr/bin" })
    expect(result.NODE_ENV).toBe("production")
    expect(result.PATH).toBe("/usr/bin")
  })

  test("replaces the entire value, not just the sensitive substring within it", ({ expect }) => {
    // The value itself contains 'password' — only the key triggers redaction.
    // The entire value must be replaced with a sha256 hash, not "thisismy<hash>".
    const result = filterSensitiveEnv({ DB_PASSWORD: "thisismypassword" })
    expect(result.DB_PASSWORD).toMatch(SHA256_HASH_RE)
  })

  test("handles a mixed env object, redacting only sensitive keys", ({ expect }) => {
    const result = filterSensitiveEnv({
      HOME: "/home/user",
      GITHUB_TOKEN: "tok",
      NODE_ENV: "test",
      MY_API_KEY: "key123",
    })
    expect(result.HOME).toBe("/home/user")
    expect(result.NODE_ENV).toBe("test")
    expect(result.GITHUB_TOKEN).toMatch(SHA256_HASH_RE)
    expect(result.MY_API_KEY).toMatch(SHA256_HASH_RE)
  })

  test("redacts values for keys containing CSC (code-signing certificate vars)", ({ expect }) => {
    const result = filterSensitiveEnv({ CSC_LINK: "https://example.com/cert.p12" })
    expect(result.CSC_LINK).toMatch(SHA256_HASH_RE)
  })

  test("redacts values for WIN_CSC_LINK", ({ expect }) => {
    const result = filterSensitiveEnv({ WIN_CSC_LINK: "/path/to/cert.pfx" })
    expect(result.WIN_CSC_LINK).toMatch(SHA256_HASH_RE)
  })

  test("redacts values for keys containing CREDENTIAL", ({ expect }) => {
    const result = filterSensitiveEnv({ DB_CREDENTIAL: "s3cr3t" })
    expect(result.DB_CREDENTIAL).toMatch(SHA256_HASH_RE)
  })

  test("does not redact unrelated LINK or CSC-free vars", ({ expect }) => {
    const result = filterSensitiveEnv({ GITHUB_LINK: "https://github.com", ELECTRON_CACHE: "/tmp" })
    expect(result.GITHUB_LINK).toBe("https://github.com")
    expect(result.ELECTRON_CACHE).toBe("/tmp")
  })
})

describe("removePassword: multiple keys in one string", () => {
  test("handles two keys unquoted (snapshot)", ({ expect }) => {
    const input = `--accessKey key1 --secretKey key2`
    const output = removePassword(input)

    expect(output).toMatchSnapshot()
  })

  test("handles mixed quoted and unquoted keys (snapshot)", ({ expect }) => {
    const input = `-p 'quoted secret' -pass unquoted`
    const output = removePassword(input)

    expect(output).toMatchSnapshot()
  })

  test("handles several keys and /b … /c block (snapshot)", ({ expect }) => {
    const input = `pass: val1 --accessKey "val two" /b blockpass /c`
    const output = removePassword(input)

    expect(output).toMatchSnapshot()
  })
})
