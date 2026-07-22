import { expect, test, describe } from "vitest"
import { DigestTransform, HttpExecutor } from "builder-util-runtime"
import { hashSensitiveValue, safeStringifyJson } from "builder-util-runtime/internal"
import { addSensitiveFieldPattern, addSensitiveRedirectHeader, detectSha512Encoding, isSensitiveFieldName } from "builder-util-runtime/src/httpExecutor"
import { createHash } from "crypto"
import { RequestOptions } from "http"
import { Readable, Writable } from "stream"
import { pipeline } from "stream/promises"

describe("HttpExecutor.prepareRedirectUrlOptions", () => {
  describe("basic functionality", () => {
    test("should configure new options from redirect URL", () => {
      const originalOptions: RequestOptions = {
        protocol: "https:",
        hostname: "api.github.com",
        port: "443",
        path: "/repos/owner/repo/releases/latest",
        headers: {
          "User-Agent": "test-agent",
        },
      }

      const redirectUrl = "https://api.github.com/repos/owner/repo/releases/12345"
      const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

      expect(result.protocol).toBe("https:")
      expect(result.hostname).toBe("api.github.com")
      expect(result.path).toBe("/repos/owner/repo/releases/12345")
      expect(result.headers?.["User-Agent"]).toBe("test-agent")
    })

    test("should handle relative redirect URLs", () => {
      const originalOptions: RequestOptions = {
        protocol: "https:",
        hostname: "api.github.com",
        port: "443",
        path: "/repos/owner/repo/releases/latest",
      }

      const redirectUrl = "/repos/owner/repo/releases/12345"
      const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

      expect(result.protocol).toBe("https:")
      expect(result.hostname).toBe("api.github.com")
      expect(result.path).toBe("/repos/owner/repo/releases/12345")
    })

    test("should handle absolute redirect URLs with different domains", () => {
      const originalOptions: RequestOptions = {
        protocol: "https:",
        hostname: "api.github.com",
        path: "/repos/owner/repo/releases/latest",
      }

      const redirectUrl = "https://objects.githubusercontent.com/github-production-release-asset-12345/asset.zip"
      const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

      expect(result.protocol).toBe("https:")
      expect(result.hostname).toBe("objects.githubusercontent.com")
      expect(result.path).toBe("/github-production-release-asset-12345/asset.zip")
    })
  })

  describe("authorization header handling", () => {
    test("should preserve authorization header for same-origin redirects", () => {
      const originalOptions: RequestOptions = {
        protocol: "https:",
        hostname: "api.github.com",
        path: "/repos/owner/repo/releases/latest",
        headers: {
          authorization: "Bearer token123",
        },
      }

      const redirectUrl = "https://api.github.com/repos/owner/repo/releases/12345"
      const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

      expect(result.headers?.authorization).toBe("Bearer token123")
    })

    test("should strip authorization header for cross-origin redirects", () => {
      const originalOptions: RequestOptions = {
        protocol: "https:",
        hostname: "api.github.com",
        path: "/repos/owner/repo/releases/latest",
        headers: {
          authorization: "Bearer token123",
        },
      }

      const redirectUrl = "https://objects.githubusercontent.com/asset.zip"
      const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

      expect(result.headers?.authorization).toBeUndefined()
    })

    test("should preserve other headers when stripping authorization", () => {
      const originalOptions: RequestOptions = {
        protocol: "https:",
        hostname: "api.github.com",
        path: "/repos/owner/repo/releases/latest",
        headers: {
          authorization: "Bearer token123",
          "User-Agent": "test-agent",
          Accept: "application/json",
        },
      }

      const redirectUrl = "https://objects.githubusercontent.com/asset.zip"
      const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

      expect(result.headers?.authorization).toBeUndefined()
      expect(result.headers?.["User-Agent"]).toBe("test-agent")
      expect(result.headers?.["Accept"]).toBe("application/json")
    })

    test("should handle missing authorization header gracefully", () => {
      const originalOptions: RequestOptions = {
        protocol: "https:",
        hostname: "api.github.com",
        path: "/repos/owner/repo/releases/latest",
        headers: {
          "User-Agent": "test-agent",
        },
      }

      const redirectUrl = "https://objects.githubusercontent.com/asset.zip"
      const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

      expect(result.headers?.["User-Agent"]).toBe("test-agent")
      expect(result.headers?.authorization).toBeUndefined()
    })

    test("should handle missing headers gracefully", () => {
      const originalOptions: RequestOptions = {
        protocol: "https:",
        hostname: "api.github.com",
        path: "/repos/owner/repo/releases/latest",
      }

      const redirectUrl = "https://objects.githubusercontent.com/asset.zip"
      const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

      expect(result.hostname).toBe("objects.githubusercontent.com")
    })
  })

  describe("cross-origin detection", () => {
    describe("hostname comparison", () => {
      test("should treat same hostname as same-origin", () => {
        const originalOptions: RequestOptions = {
          protocol: "https:",
          hostname: "api.github.com",
          headers: { authorization: "Bearer token123" },
        }

        const redirectUrl = "https://api.github.com/different/path"
        const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

        expect(result.headers?.authorization).toBe("Bearer token123")
      })

      test("should treat different hostname as cross-origin", () => {
        const originalOptions: RequestOptions = {
          protocol: "https:",
          hostname: "api.github.com",
          headers: { authorization: "Bearer token123" },
        }

        const redirectUrl = "https://objects.githubusercontent.com/asset.zip"
        const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

        expect(result.headers?.authorization).toBeUndefined()
      })

      test("should perform case-insensitive hostname comparison", () => {
        const originalOptions: RequestOptions = {
          protocol: "https:",
          hostname: "API.GitHub.COM",
          headers: { authorization: "Bearer token123" },
        }

        const redirectUrl = "https://api.github.com/different/path"
        const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

        expect(result.headers?.authorization).toBe("Bearer token123")
      })

      test("should treat case-different hostnames as same-origin", () => {
        const originalOptions: RequestOptions = {
          protocol: "https:",
          hostname: "api.github.com",
          headers: { authorization: "Bearer token123" },
        }

        const redirectUrl = "https://API.GITHUB.COM/different/path"
        const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

        expect(result.headers?.authorization).toBe("Bearer token123")
      })
    })

    describe("protocol comparison", () => {
      test("should treat same protocol as same-origin (with same hostname)", () => {
        const originalOptions: RequestOptions = {
          protocol: "https:",
          hostname: "example.com",
          headers: { authorization: "Bearer token123" },
        }

        const redirectUrl = "https://example.com/different/path"
        const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

        expect(result.headers?.authorization).toBe("Bearer token123")
      })

      test("should treat different protocol as cross-origin", () => {
        const originalOptions: RequestOptions = {
          protocol: "https:",
          hostname: "example.com",
          headers: { authorization: "Bearer token123" },
        }

        const redirectUrl = "http://example.com/different/path"
        const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

        expect(result.headers?.authorization).toBeUndefined()
      })

      test("should allow HTTP->HTTPS upgrade on standard ports", () => {
        const originalOptions: RequestOptions = {
          protocol: "http:",
          hostname: "example.com",
          port: "80",
          headers: { authorization: "Bearer token123" },
        }

        const redirectUrl = "https://example.com:443/secure/path"
        const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

        expect(result.headers?.authorization).toBe("Bearer token123")
      })

      test("should allow HTTP->HTTPS upgrade with implicit standard ports", () => {
        const originalOptions: RequestOptions = {
          protocol: "http:",
          hostname: "example.com",
          headers: { authorization: "Bearer token123" },
        }

        const redirectUrl = "https://example.com/secure/path"
        const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

        expect(result.headers?.authorization).toBe("Bearer token123")
      })

      test("should not allow HTTPS->HTTP downgrade", () => {
        const originalOptions: RequestOptions = {
          protocol: "https:",
          hostname: "example.com",
          headers: { authorization: "Bearer token123" },
        }

        const redirectUrl = "http://example.com/insecure/path"
        const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

        expect(result.headers?.authorization).toBeUndefined()
      })
    })

    describe("port comparison", () => {
      test("should treat same explicit ports as same-origin", () => {
        const originalOptions: RequestOptions = {
          protocol: "https:",
          hostname: "example.com",
          port: "8443",
          headers: { authorization: "Bearer token123" },
        }

        const redirectUrl = "https://example.com:8443/different/path"
        const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

        expect(result.headers?.authorization).toBe("Bearer token123")
      })

      test("should treat different ports as cross-origin", () => {
        const originalOptions: RequestOptions = {
          protocol: "https:",
          hostname: "example.com",
          port: "8443",
          headers: { authorization: "Bearer token123" },
        }

        const redirectUrl = "https://example.com:9443/different/path"
        const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

        expect(result.headers?.authorization).toBeUndefined()
      })

      test("should treat implicit default ports as equivalent to explicit", () => {
        const originalOptions: RequestOptions = {
          protocol: "https:",
          hostname: "example.com",
          port: "443",
          headers: { authorization: "Bearer token123" },
        }

        const redirectUrl = "https://example.com/different/path"
        const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

        expect(result.headers?.authorization).toBe("Bearer token123")
      })

      test("should treat implicit default port as equivalent to explicit (HTTP)", () => {
        const originalOptions: RequestOptions = {
          protocol: "http:",
          hostname: "example.com",
          port: "80",
          headers: { authorization: "Bearer token123" },
        }

        const redirectUrl = "http://example.com/different/path"
        const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

        expect(result.headers?.authorization).toBe("Bearer token123")
      })

      test("should treat explicit port as equivalent to implicit default", () => {
        const originalOptions: RequestOptions = {
          protocol: "https:",
          hostname: "example.com",
          headers: { authorization: "Bearer token123" },
        }

        const redirectUrl = "https://example.com:443/different/path"
        const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

        expect(result.headers?.authorization).toBe("Bearer token123")
      })

      test("should handle non-standard ports correctly", () => {
        const originalOptions: RequestOptions = {
          protocol: "https:",
          hostname: "example.com",
          port: "8080",
          headers: { authorization: "Bearer token123" },
        }

        const redirectUrl = "https://example.com:443/different/path"
        const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

        expect(result.headers?.authorization).toBeUndefined()
      })
    })
  })

  describe("real-world scenarios", () => {
    test("should handle GitHub API to GitHub assets redirect", () => {
      const originalOptions: RequestOptions = {
        protocol: "https:",
        hostname: "api.github.com",
        path: "/repos/owner/repo/releases/assets/12345",
        headers: { authorization: "token ghp_123456789" },
      }

      const redirectUrl = "https://objects.githubusercontent.com/github-production-release-asset-12345/asset.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256"
      const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

      expect(result.hostname).toBe("objects.githubusercontent.com")
      expect(result.headers?.authorization).toBeUndefined()
      expect(result.path).toContain("github-production-release-asset-12345")
    })

    test("should handle GitHub API to release-assets.githubusercontent.com redirect", () => {
      const originalOptions: RequestOptions = {
        protocol: "https:",
        hostname: "api.github.com",
        path: "/repos/owner/repo/releases/assets/12345",
        headers: { authorization: "Bearer token123" },
      }

      const redirectUrl = "https://release-assets.githubusercontent.com/asset.zip"
      const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

      expect(result.hostname).toBe("release-assets.githubusercontent.com")
      expect(result.headers?.authorization).toBeUndefined()
    })

    test("should handle Azure Blob Storage redirect", () => {
      const originalOptions: RequestOptions = {
        protocol: "https:",
        hostname: "releases.myapp.com",
        path: "/download/v1.0.0/app.zip",
        headers: { authorization: "Bearer token123" },
      }

      const redirectUrl = "https://myappstorage.blob.core.windows.net/releases/v1.0.0/app.zip?sv=2020-08-04&ss=b"
      const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

      expect(result.hostname).toBe("myappstorage.blob.core.windows.net")
      expect(result.headers?.authorization).toBeUndefined()
      expect(result.path).toContain("releases/v1.0.0/app.zip")
    })

    test("should handle AWS S3 redirect", () => {
      const originalOptions: RequestOptions = {
        protocol: "https:",
        hostname: "api.myapp.com",
        path: "/releases/latest/download",
        headers: { authorization: "Bearer token123" },
      }

      const redirectUrl = "https://mybucket.s3.amazonaws.com/releases/v1.0.0/app.zip?AWSAccessKeyId=AKIA123"
      const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

      expect(result.hostname).toBe("mybucket.s3.amazonaws.com")
      expect(result.headers?.authorization).toBeUndefined()
    })

    test("should preserve authorization for same-service redirects", () => {
      const originalOptions: RequestOptions = {
        protocol: "https:",
        hostname: "api.github.com",
        path: "/user",
        headers: { authorization: "token ghp_123456789" },
      }

      const redirectUrl = "https://api.github.com/user/12345"
      const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

      expect(result.hostname).toBe("api.github.com")
      expect(result.headers?.authorization).toBe("token ghp_123456789")
    })
  })

  describe("edge cases", () => {
    test("should handle URLs with query parameters", () => {
      const originalOptions: RequestOptions = {
        protocol: "https:",
        hostname: "api.example.com",
        path: "/endpoint?param=value",
        headers: { authorization: "Bearer token123" },
      }

      const redirectUrl = "https://cdn.example.com/asset.zip?token=abc&expires=123"
      const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

      expect(result.hostname).toBe("cdn.example.com")
      expect(result.path).toBe("/asset.zip?token=abc&expires=123")
      expect(result.headers?.authorization).toBeUndefined()
    })

    test("should handle URLs with fragments", () => {
      const originalOptions: RequestOptions = {
        protocol: "https:",
        hostname: "api.example.com",
        headers: { authorization: "Bearer token123" },
      }

      const redirectUrl = "https://api.example.com/endpoint#section"
      const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

      expect(result.hostname).toBe("api.example.com")
      expect(result.path).toBe("/endpoint")
      expect(result.headers?.authorization).toBe("Bearer token123")
    })

    test("should handle URLs with userinfo (should be ignored in comparison)", () => {
      const originalOptions: RequestOptions = {
        protocol: "https:",
        hostname: "example.com",
        headers: { authorization: "Bearer token123" },
      }

      const redirectUrl = "https://user:pass@example.com/secure/path"
      const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

      expect(result.hostname).toBe("example.com")
      expect(result.headers?.authorization).toBe("Bearer token123")
    })

    test("should handle IPv6 addresses", () => {
      const originalOptions: RequestOptions = {
        protocol: "https:",
        hostname: "[::1]",
        port: "8443",
        headers: { authorization: "Bearer token123" },
      }

      const redirectUrl = "https://[::1]:8443/different/path"
      const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

      expect(result.hostname).toBe("[::1]")
      expect(result.headers?.authorization).toBe("Bearer token123")
    })

    test("should handle empty path", () => {
      const originalOptions: RequestOptions = {
        protocol: "https:",
        hostname: "example.com",
        headers: { authorization: "Bearer token123" },
      }

      const redirectUrl = "https://example.com"
      const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

      expect(result.hostname).toBe("example.com")
      expect(result.path).toBe("/")
      expect(result.headers?.authorization).toBe("Bearer token123")
    })
  })
})

describe("HttpExecutor.isCrossOriginRedirect", () => {
  const testCases: Array<{ name: string; url1: string; url2: string; expected: boolean }> = [
    {
      name: "should be false for same hostname, protocol, and port",
      url1: "https://example.com/path",
      url2: "https://example.com/other",
      expected: false,
    },
    {
      name: "should be true for different hostname",
      url1: "https://example.com/path",
      url2: "https://api.example.com/path",
      expected: true,
    },
    {
      name: "should be true for different protocol",
      url1: "https://example.com/path",
      url2: "http://example.com/path",
      expected: true,
    },
    {
      name: "should be true for different port",
      url1: "https://example.com:8080/path",
      url2: "https://example.com:9090/path",
      expected: true,
    },
    {
      name: "should be false for implicit vs explicit default port",
      url1: "https://example.com/path",
      url2: "https://example.com:443/path",
      expected: false,
    },
    {
      name: "should be false for case-insensitive hostname",
      url1: "https://EXAMPLE.com/path",
      url2: "https://example.com/path",
      expected: false,
    },
    {
      name: "SPECIAL CASE: should be false for http -> https upgrade with default ports",
      url1: "http://example.com/path",
      url2: "https://example.com/path",
      expected: false,
    },
    {
      name: "SPECIAL CASE: should be false for http -> https upgrade with explicit default ports",
      url1: "http://example.com:80/path",
      url2: "https://example.com:443/path",
      expected: false,
    },
    {
      name: "SPECIAL CASE: should be true for http -> https upgrade with non-default ports",
      url1: "http://example.com:8080/path",
      url2: "https://example.com:8443/path",
      expected: true,
    },
  ]

  for (const tc of testCases) {
    test(tc.name, () => {
      const url1 = new URL(tc.url1)
      const url2 = new URL(tc.url2)
      // @ts-ignore
      const result = HttpExecutor.isCrossOriginRedirect(url1, url2)
      expect(result).toBe(tc.expected)
    })
  }
})

describe("HttpExecutor error handling", () => {
  test("should throw an error if hostname is missing and authorization header is present", () => {
    const originalOptions: RequestOptions = {
      protocol: "https:",
      path: "/some/path",
      headers: {
        authorization: "Bearer token123",
      },
    }
    const redirectUrl = "https://example.com/redirect"
    expect(() => HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)).toThrow("Missing hostname in request options")
  })
})

describe("sensitive header stripping", () => {
  const crossOriginRedirect = "https://cdn.example.com/asset.zip"
  const sameOriginRedirect = "https://gitlab.example.com/other/path"

  const baseOptions = (headers: Record<string, string>): RequestOptions => ({
    protocol: "https:",
    hostname: "gitlab.example.com",
    path: "/api/v4/projects/1/releases",
    headers,
  })

  test("should strip PRIVATE-TOKEN on cross-origin redirect", () => {
    const result = HttpExecutor.prepareRedirectUrlOptions(crossOriginRedirect, baseOptions({ "PRIVATE-TOKEN": "glpat-secret" }))
    expect(result.headers?.["PRIVATE-TOKEN"]).toBeUndefined()
  })

  test("should strip mixed-case Authorization on cross-origin redirect", () => {
    const result = HttpExecutor.prepareRedirectUrlOptions(crossOriginRedirect, baseOptions({ Authorization: "Bearer token123" }))
    expect(result.headers?.["Authorization"]).toBeUndefined()
    expect(result.headers?.["authorization"]).toBeUndefined()
  })

  test("should strip AUTHORIZATION (all-caps) on cross-origin redirect", () => {
    const result = HttpExecutor.prepareRedirectUrlOptions(crossOriginRedirect, baseOptions({ AUTHORIZATION: "Bearer token123" }))
    expect(result.headers?.["AUTHORIZATION"]).toBeUndefined()
  })

  test("should strip X-Api-Key on cross-origin redirect", () => {
    const result = HttpExecutor.prepareRedirectUrlOptions(crossOriginRedirect, baseOptions({ "X-Api-Key": "mykey" }))
    expect(result.headers?.["X-Api-Key"]).toBeUndefined()
  })

  test("should strip X-Auth-Token on cross-origin redirect", () => {
    const result = HttpExecutor.prepareRedirectUrlOptions(crossOriginRedirect, baseOptions({ "X-Auth-Token": "mytoken" }))
    expect(result.headers?.["X-Auth-Token"]).toBeUndefined()
  })

  test("should strip multiple sensitive headers in a single cross-origin redirect", () => {
    const result = HttpExecutor.prepareRedirectUrlOptions(
      crossOriginRedirect,
      baseOptions({
        "PRIVATE-TOKEN": "glpat-secret",
        Authorization: "Bearer token123",
        "X-Api-Key": "apikey",
        "User-Agent": "electron-builder",
        Accept: "application/json",
      })
    )
    expect(result.headers?.["PRIVATE-TOKEN"]).toBeUndefined()
    expect(result.headers?.["Authorization"]).toBeUndefined()
    expect(result.headers?.["X-Api-Key"]).toBeUndefined()
    // non-sensitive headers survive
    expect(result.headers?.["User-Agent"]).toBe("electron-builder")
    expect(result.headers?.["Accept"]).toBe("application/json")
  })

  test("should preserve PRIVATE-TOKEN on same-origin redirect", () => {
    const result = HttpExecutor.prepareRedirectUrlOptions(sameOriginRedirect, baseOptions({ "PRIVATE-TOKEN": "glpat-secret" }))
    expect(result.headers?.["PRIVATE-TOKEN"]).toBe("glpat-secret")
  })

  test("should preserve mixed-case Authorization on same-origin redirect", () => {
    const result = HttpExecutor.prepareRedirectUrlOptions(sameOriginRedirect, baseOptions({ Authorization: "Bearer token123" }))
    expect(result.headers?.["Authorization"]).toBe("Bearer token123")
  })

  test("should strip underscore variants on cross-origin redirect", () => {
    const result = HttpExecutor.prepareRedirectUrlOptions(
      crossOriginRedirect,
      baseOptions({
        PRIVATE_TOKEN: "glpat-secret",
        X_API_KEY: "mykey",
        X_Auth_Token: "mytoken",
        X_CSRF_TOKEN: "csrf",
      })
    )
    expect(result.headers?.["PRIVATE_TOKEN"]).toBeUndefined()
    expect(result.headers?.["X_API_KEY"]).toBeUndefined()
    expect(result.headers?.["X_Auth_Token"]).toBeUndefined()
    expect(result.headers?.["X_CSRF_TOKEN"]).toBeUndefined()
  })
})

describe("safeStringifyJson field redaction", () => {
  test("strips token variants", () => {
    const data = { token: "x", TOKEN: "x", access_token: "x", ACCESS_TOKEN: "x", refreshToken: "x" }
    const parsed = JSON.parse(safeStringifyJson(data))
    for (const key of Object.keys(data)) {
      expect(parsed[key]).toBe(hashSensitiveValue("x"))
    }
  })

  test("strips password variants", () => {
    const data = { password: "x", PASSWORD: "x", db_password: "x", userPassword: "x" }
    const parsed = JSON.parse(safeStringifyJson(data))
    for (const key of Object.keys(data)) {
      expect(parsed[key]).toBe(hashSensitiveValue("x"))
    }
  })

  test("strips secret variants", () => {
    const data = { secret: "x", SECRET: "x", clientSecret: "x", SECRET_KEY: "x" }
    const parsed = JSON.parse(safeStringifyJson(data))
    for (const key of Object.keys(data)) {
      expect(parsed[key]).toBe(hashSensitiveValue("x"))
    }
  })

  test("strips key-suffix variants", () => {
    const data = { apiKey: "x", secretKey: "x", accessKey: "x", privateKey: "x", publicKey: "x", ACCESS_KEY: "x", private_key: "x" }
    const parsed = JSON.parse(safeStringifyJson(data))
    for (const key of Object.keys(data)) {
      expect(parsed[key]).toBe(hashSensitiveValue("x"))
    }
  })

  test("strips credential variants", () => {
    const data = { credential: "x", credentials: "x", CREDENTIAL: "x" }
    const parsed = JSON.parse(safeStringifyJson(data))
    for (const key of Object.keys(data)) {
      expect(parsed[key]).toBe(hashSensitiveValue("x"))
    }
  })

  test("strips authorization variants", () => {
    const data = { authorization: "x", Authorization: "x", AUTHORIZATION: "x" }
    const parsed = JSON.parse(safeStringifyJson(data))
    for (const key of Object.keys(data)) {
      expect(parsed[key]).toBe(hashSensitiveValue("x"))
    }
  })

  test("strips auth variants", () => {
    const data = { auth: "x", authToken: "x", AUTH: "x", oauth: "x", authCode: "x" }
    const parsed = JSON.parse(safeStringifyJson(data))
    for (const key of Object.keys(data)) {
      expect(parsed[key]).toBe(hashSensitiveValue("x"))
    }
  })

  test("does not strip non-sensitive fields", () => {
    const data = { name: "myapp", url: "https://example.com", provider: "github", version: "1.0.0", channel: "latest" }
    const parsed = JSON.parse(safeStringifyJson(data))
    expect(parsed).toEqual(data)
  })

  test("skippedNames still overrides non-sensitive fields", () => {
    const data = { name: "myapp", url: "https://example.com" }
    const parsed = JSON.parse(safeStringifyJson(data, new Set(["name"])))
    expect(parsed.name).toBe(hashSensitiveValue("myapp"))
    expect(parsed.url).toBe("https://example.com")
  })
})

describe("addSensitiveRedirectHeader / addSensitiveFieldPattern", () => {
  test("addSensitiveRedirectHeader causes custom header to be stripped on cross-origin redirect", () => {
    addSensitiveRedirectHeader("X-Zz-Test-Custom-Auth")

    const originalOptions: RequestOptions = {
      protocol: "https:",
      hostname: "api.example.com",
      path: "/endpoint",
      headers: { "X-Zz-Test-Custom-Auth": "secret-value", "User-Agent": "test" },
    }
    const result = HttpExecutor.prepareRedirectUrlOptions("https://cdn.other.com/asset.zip", originalOptions)

    expect(result.headers?.["X-Zz-Test-Custom-Auth"]).toBeUndefined()
    expect(result.headers?.["User-Agent"]).toBe("test")
  })

  test("addSensitiveFieldPattern causes matching fields to be redacted by safeStringifyJson", () => {
    addSensitiveFieldPattern("zzTestCustomCred")

    const data = { zzTestCustomCredToken: "secret", name: "safe" }
    const parsed = JSON.parse(safeStringifyJson(data))

    expect(parsed.zzTestCustomCredToken).toBe(hashSensitiveValue("secret"))
    expect(parsed.name).toBe("safe")
  })
})

describe("isSensitiveFieldName", () => {
  test("returns true for sensitive field names", () => {
    expect(isSensitiveFieldName("token")).toBe(true)
    expect(isSensitiveFieldName("AUTH")).toBe(true)
    expect(isSensitiveFieldName("auth_token")).toBe(true)
    expect(isSensitiveFieldName("apiKey")).toBe(true)
    expect(isSensitiveFieldName("SECRET_KEY")).toBe(true)
    expect(isSensitiveFieldName("GH_TOKEN")).toBe(true)
    expect(isSensitiveFieldName("AWS_SECRET_ACCESS_KEY")).toBe(true)
  })

  test("returns false for non-sensitive field names", () => {
    expect(isSensitiveFieldName("name")).toBe(false)
    expect(isSensitiveFieldName("url")).toBe(false)
    expect(isSensitiveFieldName("version")).toBe(false)
    expect(isSensitiveFieldName("channel")).toBe(false)
    expect(isSensitiveFieldName("provider")).toBe(false)
  })
})

describe("detectSha512Encoding", () => {
  const payload = Buffer.from("update-payload")
  const hexSha512 = createHash("sha512").update(payload).digest("hex")
  const base64Sha512 = createHash("sha512").update(payload).digest("base64")

  const devNull = () =>
    new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
    })

  test("128-hex-character value is detected as legacy hex", () => {
    expect(hexSha512).toHaveLength(128)
    expect(detectSha512Encoding(hexSha512)).toBe("hex")
  })

  test("base64-encoded value is detected as base64", () => {
    expect(base64Sha512).toHaveLength(88)
    expect(detectSha512Encoding(base64Sha512)).toBe("base64")
  })

  test("DigestTransform validates a legacy hex-encoded expected sha512", async () => {
    const transform = new DigestTransform(hexSha512, "sha512", detectSha512Encoding(hexSha512))
    await pipeline(Readable.from([payload]), transform, devNull())
    expect(transform.actual).toBe(hexSha512)
  })

  test("DigestTransform validates a base64-encoded expected sha512", async () => {
    const transform = new DigestTransform(base64Sha512, "sha512", detectSha512Encoding(base64Sha512))
    await pipeline(Readable.from([payload]), transform, devNull())
    expect(transform.actual).toBe(base64Sha512)
  })

  test("a wrong expected value fails closed with ERR_CHECKSUM_MISMATCH", async () => {
    const wrong = createHash("sha512").update("other-payload").digest("base64")
    const transform = new DigestTransform(wrong, "sha512", detectSha512Encoding(wrong))
    await expect(pipeline(Readable.from([payload]), transform, devNull())).rejects.toThrow(/checksum mismatch/)
  })
})
