import { expect, test, describe } from "vitest"
import { CancellationToken, DigestTransform, HttpError, HttpExecutor } from "builder-util-runtime"
import { hashSensitiveValue, REDACTED_VALUE, safeStringifyJson } from "builder-util-runtime/internal"
import { addSensitiveFieldPattern, addSensitiveRedirectHeader, detectSha512Encoding, isSensitiveFieldName } from "builder-util-runtime/src/httpExecutor"
import { createHash } from "crypto"
import { EventEmitter } from "events"
import { RequestOptions } from "http"
import { Readable, Writable } from "stream"
import { pipeline } from "stream/promises"
import * as http from "http"

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

    // ElectronHttpExecutor.createRequest moves a `Host` header to `host`, which Electron's net prefers over `hostname`
    for (const [label, redirectUrl, hostname] of [
      ["another host", "https://bucket.example.net/app.exe?X-Amz-Signature=abc", "bucket.example.net"],
      ["the same host", "/files/app.exe", "feed.example.com"],
    ] as const) {
      test(`a redirect to ${label} is sent to the redirect target, not to the original \`host\``, () => {
        const originalOptions: RequestOptions = {
          protocol: "https:",
          hostname: "feed.example.com",
          host: "my-bucket.s3.amazonaws.com",
          path: "/updates/app.exe",
          headers: { authorization: "Bearer secret" },
        }

        const result = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, originalOptions)

        expect(result).not.toHaveProperty("host")
        expect(result.hostname).toBe(hostname)
        // the original options are not changed
        expect(originalOptions.host).toBe("my-bucket.s3.amazonaws.com")
      })
    }
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

describe("HttpExecutor.removeCrossOriginSensitiveHeaders", () => {
  const feedUrl = new URL("https://feed.example.com/updates/")
  const credentialHeaders = () => ({
    Authorization: "Bearer token123",
    "PRIVATE-TOKEN": "glpat-secret",
    "X-Api-Key": "apikey",
    Cookie: "session=1",
    "User-Agent": "electron-builder",
    accept: "*/*",
  })

  test("strips the sensitive headers for another origin, keeps the rest", () => {
    const result = HttpExecutor.removeCrossOriginSensitiveHeaders(credentialHeaders(), feedUrl, new URL("https://cdn.example.net/app.exe"))
    expect(result).toEqual({ "User-Agent": "electron-builder", accept: "*/*" })
  })

  test("returns the same headers for a same-origin URL", () => {
    const headers = credentialHeaders()
    expect(HttpExecutor.removeCrossOriginSensitiveHeaders(headers, feedUrl, new URL("https://feed.example.com/other/app.exe"))).toBe(headers)
  })

  test("does not mutate its input", () => {
    const headers = credentialHeaders()
    HttpExecutor.removeCrossOriginSensitiveHeaders(headers, feedUrl, new URL("https://cdn.example.net/app.exe"))
    expect(headers).toEqual(credentialHeaders())
  })

  test("another port on the same host is cross-origin", () => {
    const result = HttpExecutor.removeCrossOriginSensitiveHeaders(credentialHeaders(), feedUrl, new URL("https://feed.example.com:8443/app.exe"))
    expect(result.Authorization).toBeUndefined()
  })

  test("https → http on the same host is cross-origin", () => {
    const result = HttpExecutor.removeCrossOriginSensitiveHeaders(credentialHeaders(), feedUrl, new URL("http://feed.example.com/updates/app.exe"))
    expect(result.Authorization).toBeUndefined()
    expect(result["PRIVATE-TOKEN"]).toBeUndefined()
  })

  test("http → https upgrade on the same host keeps them (same rule as a redirect)", () => {
    const headers = credentialHeaders()
    expect(HttpExecutor.removeCrossOriginSensitiveHeaders(headers, new URL("http://feed.example.com/updates/"), new URL("https://feed.example.com/updates/app.exe"))).toBe(headers)
  })

  test("a __proto__ key in the headers does not change the prototype of the result", () => {
    const headers = JSON.parse(`{"__proto__": {"Authorization": "Bearer token123"}, "accept": "*/*"}`)
    const result = HttpExecutor.removeCrossOriginSensitiveHeaders(headers, feedUrl, new URL("https://cdn.example.net/app.exe"))
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(result.Authorization).toBeUndefined()
    expect(result).toEqual({ accept: "*/*" })
  })
})

describe("HttpExecutor.sensitiveHeaderNames", () => {
  test("names the headers stripped on a cross-origin redirect, whatever their spelling", ({ expect }) => {
    const headers = { Authorization: "Bearer t", private_token: "p", "X-Api-Key": "k", "User-Agent": "electron-builder", accept: "*/*" }
    expect(HttpExecutor.sensitiveHeaderNames(headers)).toEqual(["Authorization", "private_token", "X-Api-Key"])
  })

  test("ignores a sensitive header without a value", ({ expect }) => {
    expect(HttpExecutor.sensitiveHeaderNames({ authorization: undefined, accept: "*/*" })).toEqual([])
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

  // a fingerprint is costly to compute, and the data can come from a server (an error response body or its headers)
  test("computes at most 16 fingerprints per call and logs the other sensitive values as <redacted>", () => {
    const data = Array.from({ length: 1000 }, (_, i) => ({ key: `v${i}`, secretKey: { nested: true }, name: `n${i}` }))
    const parsed = JSON.parse(safeStringifyJson(data))

    expect(parsed.slice(0, 16).map((it: any) => it.key)).toEqual(data.slice(0, 16).map(it => hashSensitiveValue(it.key)))
    expect(parsed.slice(16).every((it: any) => it.key === REDACTED_VALUE)).toBe(true)
    expect(parsed.every((it: any, i: number) => it.secretKey === "<stripped sensitive data>" && it.name === `n${i}`)).toBe(true)

    // the limit is per call
    expect(JSON.parse(safeStringifyJson({ token: "x" })).token).toBe(hashSensitiveValue("x"))
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

describe("HttpExecutor redirect limit", () => {
  // A minimal executor whose fake request always responds with a 302 back to the same URL — an infinite
  // redirect loop. Before the redirect-counter fix the counter was never advanced (doApiRequest/doDownload
  // recursed with an unchanged / post-incremented value), so this looped forever; it must now terminate
  // with the max-redirect error after `maxRedirects` hops.
  class LoopingExecutor extends HttpExecutor<any> {
    requestCount = 0

    createRequest(_options: RequestOptions, callback: (response: any) => void): any {
      this.requestCount++
      const response = {
        statusCode: 302,
        statusMessage: "Found",
        headers: { location: "https://example.com/loop" },
        on() {},
        resume() {},
        setEncoding() {},
      }
      // synchronous is fine at depth ~maxRedirects; exercises the recursion path directly
      callback(response)
      return { on() {}, end() {}, abort() {} }
    }

    // expose the protected doDownload for testing
    runDownload(callback: (error: Error | null) => void): void {
      this.doDownload(
        { protocol: "https:", hostname: "example.com", path: "/start" },
        { responseHandler: null, onCancel: () => {}, callback, options: {} as any, destination: null },
        0
      )
    }
  }

  test("doDownload terminates with a max-redirect error instead of looping forever", () => {
    const executor = new LoopingExecutor()
    let error: Error | null = null
    executor.runDownload(e => {
      error = e
    })
    expect(error).toBeInstanceOf(Error)
    expect(error!.message).toMatch(/Too many redirects/)
    // guard is `redirectCount < maxRedirects`: maxRedirects recursions + the initial request
    expect(executor.requestCount).toBe(executor["maxRedirects"] + 1)
  })

  test("doApiRequest rejects with a max-redirect error instead of looping forever", async () => {
    const executor = new LoopingExecutor()
    await expect(executor.doApiRequest({ protocol: "https:", hostname: "example.com", path: "/start" }, new CancellationToken(), request => request.end())).rejects.toThrow(
      /Too many redirects/
    )
    // Same limit as doDownload: maxRedirects recursions + the initial request
    expect(executor.requestCount).toBe(executor["maxRedirects"] + 1)
  })
})

// A real request through Node's http module, by default through its keep-alive global agent
class NodeExecutor extends HttpExecutor<http.ClientRequest> {
  createRequest(options: RequestOptions, callback: (response: http.IncomingMessage) => void): http.ClientRequest {
    return http.request(options, callback)
  }

  runDownload(url: URL, timeout: number, callback: (error: Error | null) => void, agent?: http.Agent): void {
    this.doDownload(
      { protocol: url.protocol, hostname: url.hostname, port: url.port, path: url.pathname, timeout, agent },
      {
        responseHandler: (response, done) => {
          response.resume()
          response.on("end", () => done(null))
        },
        onCancel: () => {},
        callback,
        options: { cancellationToken: new CancellationToken() },
        destination: null,
      },
      0
    )
  }
}

describe("HttpExecutor download Location handling", () => {
  // Answers every request synchronously with `statusCode` and a Location to `location`; like http.request, createRequest throws for a
  // protocol other than http(s). Without the guard, that throw escaped from the response listener (an uncaught exception).
  class LocationExecutor extends HttpExecutor<any> {
    requestCount = 0

    constructor(
      private readonly statusCode: number,
      private readonly location: string,
      // when set, what createRequest throws for the request of a redirect
      private readonly thrownOnRedirect: unknown = null
    ) {
      super()
    }

    createRequest(options: RequestOptions, callback: (response: any) => void): any {
      if (options.protocol !== "http:" && options.protocol !== "https:") {
        throw new TypeError(`Protocol "${options.protocol}" not supported. Expected "http:"`)
      }
      if (this.requestCount > 0 && this.thrownOnRedirect != null) {
        // oxlint-disable-next-line typescript/only-throw-error -- the test needs a non-Error throw
        throw this.thrownOnRedirect
      }
      this.requestCount++
      callback({ statusCode: this.statusCode, statusMessage: "", headers: { location: this.location }, on() {}, resume() {}, setEncoding() {} })
      return { on() {}, end() {}, abort() {} }
    }

    runDownload(callback: (error: Error | null) => void): void {
      this.doDownload(
        { protocol: "https:", hostname: "example.com", path: "/start" },
        { responseHandler: (_response, done) => done(null), onCancel: () => {}, callback, options: {} as any, destination: null },
        0
      )
    }
  }

  for (const [label, location, message] of [
    ["to a protocol other than http(s)", "ftp://example.com/x", 'Cannot follow the redirect to the "ftp:" protocol'],
    ["that is not a valid URL", "http://exa mple.com/x", "Invalid URL"],
  ] as const) {
    test(`doDownload fails, rather than throws, on a redirect ${label}`, () => {
      const executor = new LocationExecutor(302, location)
      const errors: Array<Error | null> = []
      expect(() => executor.runDownload(e => errors.push(e))).not.toThrow()
      expect(errors).toHaveLength(1)
      expect(errors[0]).toBeInstanceOf(Error)
      expect(errors[0]!.message).toContain(message)
      expect(executor.requestCount).toBe(1)
    })
  }

  test("doDownload fails with an Error when following a redirect throws something else", () => {
    const executor = new LocationExecutor(302, "https://example.com/next", "not an Error")
    const errors: Array<Error | null> = []
    expect(() => executor.runDownload(e => errors.push(e))).not.toThrow()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(errors[0]?.message).toBe("Cannot follow the redirect: not an Error")
    expect(executor.requestCount).toBe(1)
  })

  // A real request through Node's keep-alive agent: a redirect's body that is not read keeps its socket busy, and the socket's timeout
  // then calls back a second time, after the download has settled
  for (const [label, location, error] of [
    ["is followed", "/target", null],
    ["cannot be followed", "ftp://example.com/x", 'Cannot follow the redirect to the "ftp:" protocol'],
  ] as const) {
    test(`doDownload calls back once when a redirect ${label}`, async () => {
      const TIMEOUT = 200
      const server = http.createServer((request, response) => {
        if (request.url === "/start") {
          response.writeHead(302, { Location: location, "Content-Length": 5 })
          response.end("moved")
        } else {
          response.end("body")
        }
      })
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
      try {
        const address = server.address()
        if (address == null || typeof address === "string") {
          throw new Error("server has no port")
        }
        const results: Array<string | null> = []
        await new Promise<void>(resolve => {
          new NodeExecutor().runDownload(new URL(`http://127.0.0.1:${address.port}/start`), TIMEOUT, e => {
            results.push(e == null ? null : e.message)
            resolve()
          })
        })
        // nothing to wait for but the request's timeout passing without a second call
        await new Promise(resolve => setTimeout(resolve, TIMEOUT * 4))
        expect(results).toEqual([error])
      } finally {
        server.closeAllConnections()
        await new Promise(resolve => server.close(resolve))
      }
    })
  }

  // the redirect's drained socket goes back to the agent, which sets its own idle timeout on it while the target is still streaming
  test("doDownload is not failed by the agent's idle timeout on the redirect's socket", async () => {
    const AGENT_TIMEOUT = 100
    const server = http.createServer((request, response) => {
      if (request.url === "/start") {
        response.writeHead(302, { Location: "/target", "Content-Length": 5 })
        response.end("moved")
      } else {
        response.writeHead(200, { "Content-Length": 8 })
        response.write("body")
        setTimeout(() => response.end("done"), AGENT_TIMEOUT * 4)
      }
    })
    const agent = new http.Agent({ keepAlive: true, timeout: AGENT_TIMEOUT })
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
    try {
      const address = server.address()
      if (address == null || typeof address === "string") {
        throw new Error("server has no port")
      }
      const results: Array<string | null> = []
      await new Promise<void>(resolve => {
        new NodeExecutor().runDownload(
          new URL(`http://127.0.0.1:${address.port}/start`),
          5000,
          e => {
            results.push(e == null ? null : e.message)
            resolve()
          },
          agent
        )
      })
      await new Promise(resolve => setTimeout(resolve, AGENT_TIMEOUT * 2))
      expect(results).toEqual([null])
    } finally {
      agent.destroy()
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
    }
  })

  test("doDownload ignores a Location on a response that is not a redirect", () => {
    const executor = new LocationExecutor(200, "ftp://example.com/x")
    const errors: Array<Error | null> = []
    executor.runDownload(e => errors.push(e))
    expect(errors).toEqual([null])
    expect(executor.requestCount).toBe(1)
  })
})

describe("HttpExecutor error response redaction", () => {
  // Answers the request with `statusCode`, `headers` and `body`. The error message of a response of 400 or more logs its headers and
  // a JSON body with sensitive values replaced by fingerprints.
  class ErrorExecutor extends HttpExecutor<any> {
    constructor(
      private readonly statusCode: number,
      private readonly headers: Record<string, string>,
      private readonly body: string
    ) {
      super()
    }

    createRequest(_options: RequestOptions, callback: (response: any) => void): any {
      const response = Object.assign(new EventEmitter(), { statusCode: this.statusCode, statusMessage: "", headers: this.headers, setEncoding() {} })
      return Object.assign(new EventEmitter(), {
        abort() {},
        end: () => {
          callback(response)
          response.emit("data", this.body)
          response.emit("end")
        },
      })
    }
  }

  const FINGERPRINTS = /[a-f0-9]{32} \(redacted fingerprint\)/g

  function requestError(executor: ErrorExecutor): Promise<any> {
    return executor.request({ protocol: "https:", hostname: "example.com", path: "/latest.yml" }).catch(e => e)
  }

  test("a JSON error body with many sensitive values fails the request without fingerprinting each of them", async () => {
    const body = JSON.stringify(Array.from({ length: 2000 }, (_, i) => ({ key: `v${i}` })))
    const error = await requestError(new ErrorExecutor(500, { "content-type": "application/json" }, body))

    expect(error).toBeInstanceOf(HttpError)
    expect(error.statusCode).toBe(500)
    expect(error.message.match(FINGERPRINTS)).toHaveLength(16)
    expect(error.message).toContain(REDACTED_VALUE)
  })

  test("a 404 with many sensitive headers fails the request without fingerprinting each of them", async () => {
    const headers = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`x${i}-key`, `v${i}`]))
    const error = await requestError(new ErrorExecutor(404, headers, ""))

    expect(error).toBeInstanceOf(HttpError)
    expect(error.statusCode).toBe(404)
    expect(error.message.match(FINGERPRINTS)).toHaveLength(16)
    expect(error.message).toContain(REDACTED_VALUE)
  })
})

describe("hashSensitiveValue", () => {
  const FINGERPRINT = /^[a-f0-9]{32} \(redacted fingerprint\)$/

  test("maps the same value to the same fingerprint within a run, and different values to different ones", ({ expect }) => {
    const first = hashSensitiveValue("hunter2")
    expect(first).toMatch(FINGERPRINT)
    expect(hashSensitiveValue("hunter2")).toBe(first)
    expect(hashSensitiveValue("hunter3")).not.toBe(first)
    expect(hashSensitiveValue("")).toMatch(FINGERPRINT)
  })

  // a plain (unkeyed) hash of a weak secret in a log could be checked against guesses offline
  test("is not a plain hash of the value, and does not contain it", ({ expect }) => {
    const output = hashSensitiveValue("hunter2")
    const fingerprint = output.split(" ")[0]
    for (const algorithm of ["sha256", "sha1", "md5"]) {
      const digest = createHash(algorithm).update("hunter2").digest("hex")
      expect(output).not.toContain(digest)
      expect(digest.startsWith(fingerprint)).toBe(false)
    }
    expect(output).not.toContain("hunter2")
  })

  test("never throws: a value that cannot be read is logged as a constant", ({ expect }) => {
    const unreadable = {
      toString() {
        throw new Error("boom")
      },
    }
    expect(hashSensitiveValue(unreadable as unknown as string)).toBe(REDACTED_VALUE)
  })
})
