import { expect, test, describe } from "vitest"
import { HttpExecutor } from "builder-util-runtime"
import { RequestOptions } from "http"

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

// @ts-ignore
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
