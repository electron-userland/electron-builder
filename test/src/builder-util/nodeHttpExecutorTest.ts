import { log } from "builder-util/src/log"
import { buildGotProxyAgent, NodeHttpExecutor } from "builder-util/src/nodeHttpExecutor"
import { afterEach, beforeEach, vi } from "vitest"

const PROXY_VARS = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"] as const

describe("buildGotProxyAgent", { concurrent: false }, () => {
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

describe("NodeHttpExecutor.createRequest", { concurrent: false }, () => {
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

    test("sets HttpsProxyAgent when HTTPS_PROXY is set", ({ expect }) => {
      vi.stubEnv("HTTPS_PROXY", "https://proxy.example.com:8080")
      const options: any = { protocol: "https:" }
      callCreateRequest(executor, options)
      expect(options.agent?.constructor?.name).toBe("HttpsProxyAgent")
    })

    test("falls back to lowercase proxy when the uppercase value is whitespace", ({ expect }) => {
      vi.stubEnv("HTTP_PROXY", "   ")
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

describe("NodeHttpExecutor cross-origin header policy", { concurrent: false }, () => {
  const hop = { from: new URL("https://api.example.com/upload"), to: new URL("https://storage.example.net/bucket/file") }

  test("by default sends another origin only the headers that carry no credential, and warns once per process, at the first redirect that leaves out headers v26 sent there, never with a value", ({
    expect,
  }) => {
    log.resetLimits()
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
    try {
      const policy = new NodeHttpExecutor().crossOriginHeaderPolicy
      // only headers v26 left out too: nothing changed, nothing to announce
      expect(policy({ Authorization: "token t", Cookie: "c=1", Accept: "application/json" }, hop)).toEqual({ Accept: "application/json" })
      expect(warn).not.toHaveBeenCalled()

      expect(policy({ "X-Api-Token": "secret-value", Authorization: "token t", Accept: "application/json" }, hop)).toEqual({ Accept: "application/json" })
      // the same names again, then none left out: no other warning
      policy({ authorization: "token other", "x-api-token": "other-value", accept: "*/*" }, hop)
      policy({ accept: "*/*" }, hop)
      expect(warn).toHaveBeenCalledOnce()
      const message = warn.mock.calls[0][0]
      expect(typeof message).toBe("string")
      expect(message).toContain("electron-builder v27 sends a redirect to another origin only the request headers that carry no credential")
      // Authorization never went to another origin: only the header v26 sent there is named
      expect(message).toContain("the redirect from https://api.example.com to https://storage.example.net went without x-api-token, which electron-builder v26 sent there.")
      expect(message).toContain("send the request to it yourself with that header, or pass a crossOriginHeaderPolicy")
      expect(message).toMatch(/ See https:\/\/www\.electron\.build\/docs\/migration\/v27-developer-changes#builder-util-runtime-default-cross-origin-headers$/)
      expect(message).not.toContain("secret-value")
      expect(message).not.toContain("other-value")

      // a later redirect, to another origin too, that leaves out another set of names: they are still left out, and the warning is not repeated
      expect(policy({ "X-Tenant": "acme", "X-Api-Token": "secret-value" }, { from: hop.from, to: new URL("https://uploads.example.org/file") })).toEqual({})
      expect(warn).toHaveBeenCalledOnce()
    } finally {
      warn.mockRestore()
      log.resetLimits()
    }
  })

  test("a policy passed to the constructor is used instead, without a warning", ({ expect }) => {
    log.resetLimits()
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
    try {
      const policy = vi.fn(() => ({}))
      const executor = new NodeHttpExecutor(policy)
      expect(executor.crossOriginHeaderPolicy).toBe(policy)
      executor.crossOriginHeaderPolicy({ "X-Api-Token": "secret-value" }, hop)
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
      log.resetLimits()
    }
  })
})
