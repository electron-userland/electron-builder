import { buildGotProxyAgent, NodeHttpExecutor } from "builder-util/src/nodeHttpExecutor"
import { afterEach, beforeEach, vi } from "vitest"

const PROXY_VARS = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"] as const

describe("buildGotProxyAgent", () => {
  beforeEach(() => {
    for (const key of PROXY_VARS) {
      delete process.env[key]
    }
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe("returns undefined when no proxy is configured", () => {
    test("no proxy env vars set", ({ expect }) => {
      expect(buildGotProxyAgent()).toBeUndefined()
    })

    test("all proxy env vars are empty strings", ({ expect }) => {
      vi.stubEnv("HTTPS_PROXY", "")
      vi.stubEnv("HTTP_PROXY", "")
      expect(buildGotProxyAgent()).toBeUndefined()
    })

    test("all proxy env vars are whitespace-only", ({ expect }) => {
      vi.stubEnv("HTTPS_PROXY", "   ")
      vi.stubEnv("HTTP_PROXY", "   ")
      expect(buildGotProxyAgent()).toBeUndefined()
    })
  })

  describe("returns correct agent shape", () => {
    test("only https key when HTTPS_PROXY is set", ({ expect }) => {
      vi.stubEnv("HTTPS_PROXY", "https://proxy.example.com:8080")
      const agent = buildGotProxyAgent()
      expect(agent?.https).toBeDefined()
      expect(agent?.http).toBeUndefined()
    })

    test("only https key when https_proxy (lowercase) is set", ({ expect }) => {
      vi.stubEnv("https_proxy", "https://proxy.example.com:8080")
      const agent = buildGotProxyAgent()
      expect(agent?.https).toBeDefined()
      expect(agent?.http).toBeUndefined()
    })

    test("only http key when HTTP_PROXY is set", ({ expect }) => {
      vi.stubEnv("HTTP_PROXY", "http://proxy.example.com:3128")
      const agent = buildGotProxyAgent()
      expect(agent?.http).toBeDefined()
      expect(agent?.https).toBeUndefined()
    })

    test("only http key when http_proxy (lowercase) is set", ({ expect }) => {
      vi.stubEnv("http_proxy", "http://proxy.example.com:3128")
      const agent = buildGotProxyAgent()
      expect(agent?.http).toBeDefined()
      expect(agent?.https).toBeUndefined()
    })

    test("both keys when HTTPS_PROXY and HTTP_PROXY are set", ({ expect }) => {
      vi.stubEnv("HTTPS_PROXY", "https://proxy.example.com:8080")
      vi.stubEnv("HTTP_PROXY", "http://proxy.example.com:3128")
      const agent = buildGotProxyAgent()
      expect(agent?.https).toBeDefined()
      expect(agent?.http).toBeDefined()
    })

    test("only https key when HTTPS_PROXY is valid but HTTP_PROXY is whitespace-only", ({ expect }) => {
      vi.stubEnv("HTTPS_PROXY", "https://proxy.example.com:8080")
      vi.stubEnv("HTTP_PROXY", "   ")
      const agent = buildGotProxyAgent()
      expect(agent?.https).toBeDefined()
      expect(agent?.http).toBeUndefined()
    })

    test("falls back to https_proxy when HTTPS_PROXY is whitespace-only", ({ expect }) => {
      vi.stubEnv("HTTPS_PROXY", "   ")
      vi.stubEnv("https_proxy", "https://fallback.example.com:8080")
      const agent = buildGotProxyAgent()
      expect(agent?.https).toBeDefined()
    })

    test("falls back to http_proxy when HTTP_PROXY is whitespace-only", ({ expect }) => {
      vi.stubEnv("HTTP_PROXY", "   ")
      vi.stubEnv("http_proxy", "http://fallback.example.com:3128")
      const agent = buildGotProxyAgent()
      expect(agent?.http).toBeDefined()
    })
  })

  // On Windows, env var names are case-insensitive at the OS level, so HTTPS_PROXY and
  // https_proxy refer to the same variable. Precedence between case variants is only
  // meaningful on case-sensitive OSes (Linux/macOS).
  describe("env var precedence", () => {
    test.skipIf(process.platform === "win32")("HTTPS_PROXY takes precedence over https_proxy when both are set", ({ expect }) => {
      vi.stubEnv("HTTPS_PROXY", "https://uppercase.example.com:8080")
      vi.stubEnv("https_proxy", "https://lowercase.example.com:8080")
      const agent = buildGotProxyAgent()
      expect((agent?.https as any)?.proxy?.hostname).toBe("uppercase.example.com")
    })

    test.skipIf(process.platform === "win32")("HTTP_PROXY takes precedence over http_proxy when both are set", ({ expect }) => {
      vi.stubEnv("HTTP_PROXY", "http://uppercase.example.com:3128")
      vi.stubEnv("http_proxy", "http://lowercase.example.com:3128")
      const agent = buildGotProxyAgent()
      expect((agent?.http as any)?.proxy?.hostname).toBe("uppercase.example.com")
    })
  })

  describe("agent instances", () => {
    test("http agent is an HttpProxyAgent", ({ expect }) => {
      vi.stubEnv("HTTP_PROXY", "http://proxy.example.com:3128")
      const agent = buildGotProxyAgent()
      expect(agent?.http?.constructor?.name).toBe("HttpProxyAgent")
    })

    test("https agent is an HttpsProxyAgent", ({ expect }) => {
      vi.stubEnv("HTTPS_PROXY", "https://proxy.example.com:8080")
      const agent = buildGotProxyAgent()
      expect(agent?.https?.constructor?.name).toBe("HttpsProxyAgent")
    })
  })
})

describe("NodeHttpExecutor.createRequest", () => {
  let executor: NodeHttpExecutor

  beforeEach(() => {
    executor = new NodeHttpExecutor()
    for (const key of PROXY_VARS) {
      delete process.env[key]
    }
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // createRequest mutates options.agent before delegating to http/https.request.
  // The returned ClientRequest makes a real async connection; suppress the resulting
  // ECONNREFUSED so it doesn't surface as an unhandled error after the test.
  function callCreateRequest(executor: NodeHttpExecutor, options: any) {
    const req = executor.createRequest(options, vi.fn()) as any
    req?.on?.("error", () => {})
    req?.destroy?.()
    return req
  }

  describe("proxy agent assignment", () => {
    test("sets HttpsProxyAgent when https_proxy is set and protocol is https:", ({ expect }) => {
      vi.stubEnv("https_proxy", "https://proxy.example.com:8080")
      const options: any = { protocol: "https:" }
      callCreateRequest(executor, options)
      expect(options.agent?.constructor?.name).toBe("HttpsProxyAgent")
    })

    test("sets HttpProxyAgent when http_proxy is set and protocol is http:", ({ expect }) => {
      vi.stubEnv("http_proxy", "http://proxy.example.com:3128")
      const options: any = { protocol: "http:" }
      callCreateRequest(executor, options)
      expect(options.agent?.constructor?.name).toBe("HttpProxyAgent")
    })

    test("does not set agent when no proxy env vars are set", ({ expect }) => {
      const options: any = { protocol: "https:" }
      callCreateRequest(executor, options)
      expect(options.agent).toBeUndefined()
    })

    test("does not set agent when https_proxy is set but protocol is http: (mismatch)", ({ expect }) => {
      vi.stubEnv("https_proxy", "https://proxy.example.com:8080")
      const options: any = { protocol: "http:" }
      callCreateRequest(executor, options)
      expect(options.agent).toBeUndefined()
    })

    test("does not set agent when http_proxy is set but protocol is https: (mismatch)", ({ expect }) => {
      vi.stubEnv("http_proxy", "http://proxy.example.com:3128")
      const options: any = { protocol: "https:" }
      callCreateRequest(executor, options)
      expect(options.agent).toBeUndefined()
    })
  })
})
