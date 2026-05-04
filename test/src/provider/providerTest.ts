import { CancellationToken, UpdateInfo } from "builder-util-runtime"
import { Provider, ProviderRuntimeOptions } from "electron-updater/src/providers/Provider"
import { ResolvedUpdateFileInfo } from "electron-updater/src/types"
import { OutgoingHttpHeaders } from "http"
import { URL } from "url"
import { afterEach, beforeEach, vi } from "vitest"
import { TEST_CONFIG } from "../helpers/providerTestUtil"
import { httpExecutor } from "../helpers/updaterTestUtil"

const config = TEST_CONFIG

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.restoreAllMocks())

class TestProvider extends Provider<UpdateInfo> {
  constructor(opts: ProviderRuntimeOptions) {
    super(opts)
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    return { version: "1.0.0", files: [], path: "", sha512: "", releaseDate: "" }
  }

  resolveFiles(_updateInfo: UpdateInfo): ResolvedUpdateFileInfo[] {
    return []
  }

  // Expose protected methods for testing
  callHttpRequest(url: URL, headers?: OutgoingHttpHeaders | null, token?: CancellationToken) {
    return this.httpRequest(url, headers, token)
  }

  callCreateRequestOptions(url: URL, headers?: OutgoingHttpHeaders | null) {
    return this.createRequestOptions(url, headers)
  }

  callGetDefaultChannelName() {
    return this.getDefaultChannelName()
  }

  callGetCustomChannelName(channel: string) {
    return this.getCustomChannelName(channel)
  }
}

function makeProvider(platform: ProviderRuntimeOptions["platform"] = "win32", isUseMultipleRangeRequest = true): TestProvider {
  return new TestProvider({ isUseMultipleRangeRequest, platform, executor: httpExecutor as any })
}


test("isUseMultipleRangeRequest - true when runtimeOptions flag is true", config, ({ expect }) => {
  const provider = makeProvider("win32", true)
  expect(provider.isUseMultipleRangeRequest).toBe(true)
})

test("isUseMultipleRangeRequest - false when runtimeOptions flag is false", config, ({ expect }) => {
  const provider = makeProvider("win32", false)
  expect(provider.isUseMultipleRangeRequest).toBe(false)
})

test("fileExtraDownloadHeaders - returns null by default", config, ({ expect }) => {
  const provider = makeProvider()
  expect(provider.fileExtraDownloadHeaders).toBeNull()
})

test("getDefaultChannelName - win32 returns latest (no suffix)", config, ({ expect }) => {
  const provider = makeProvider("win32")
  expect(provider.callGetDefaultChannelName()).toBe("latest")
})

test("getDefaultChannelName - darwin returns latest-mac", config, ({ expect }) => {
  const provider = makeProvider("darwin")
  expect(provider.callGetDefaultChannelName()).toBe("latest-mac")
})

test("getDefaultChannelName - linux returns latest-linux (x64 arch)", config, ({ expect }) => {
  const orig = process.env["TEST_UPDATER_ARCH"]
  process.env["TEST_UPDATER_ARCH"] = "x64"
  try {
    const provider = makeProvider("linux")
    expect(provider.callGetDefaultChannelName()).toBe("latest-linux")
  } finally {
    if (orig === undefined) delete process.env["TEST_UPDATER_ARCH"]
    else process.env["TEST_UPDATER_ARCH"] = orig
  }
})

test("getCustomChannelName - win32 returns channel with no suffix", config, ({ expect }) => {
  const provider = makeProvider("win32")
  expect(provider.callGetCustomChannelName("beta")).toBe("beta")
})

test("getCustomChannelName - darwin appends -mac suffix", config, ({ expect }) => {
  const provider = makeProvider("darwin")
  expect(provider.callGetCustomChannelName("beta")).toBe("beta-mac")
})

test("getCustomChannelName - linux appends -linux suffix (x64)", config, ({ expect }) => {
  const orig = process.env["TEST_UPDATER_ARCH"]
  process.env["TEST_UPDATER_ARCH"] = "x64"
  try {
    const provider = makeProvider("linux")
    expect(provider.callGetCustomChannelName("nightly")).toBe("nightly-linux")
  } finally {
    if (orig === undefined) delete process.env["TEST_UPDATER_ARCH"]
    else process.env["TEST_UPDATER_ARCH"] = orig
  }
})

test("httpRequest - delegates to executor.request with correct options", config, async ({ expect }) => {
  const provider = makeProvider()
  vi.spyOn(httpExecutor, "request").mockResolvedValueOnce("ok")

  const url = new URL("https://example.com/latest.yml")
  const result = await provider.callHttpRequest(url)

  expect(result).toBe("ok")
  expect(httpExecutor.request).toHaveBeenCalledOnce()
  const opts = vi.mocked(httpExecutor.request).mock.calls[0][0]
  expect(opts.hostname).toBe("example.com")
  expect(opts.path).toBe("/latest.yml")
})

test("createRequestOptions - populates hostname and path from URL", config, ({ expect }) => {
  const provider = makeProvider()
  const url = new URL("https://api.example.com/v1/releases?foo=bar")
  const opts = provider.callCreateRequestOptions(url)

  expect(opts.hostname).toBe("api.example.com")
  expect(opts.path).toBe("/v1/releases?foo=bar")
})

test("createRequestOptions - merges setRequestHeaders with per-call headers", config, ({ expect }) => {
  const provider = makeProvider()
  provider.setRequestHeaders({ "x-base": "base-value" })

  const url = new URL("https://api.example.com/v1/releases")
  const opts = provider.callCreateRequestOptions(url, { "x-extra": "extra-value" })

  expect((opts.headers as any)["x-base"]).toBe("base-value")
  expect((opts.headers as any)["x-extra"]).toBe("extra-value")
})

test("createRequestOptions - per-call headers used alone when no base headers set", config, ({ expect }) => {
  const provider = makeProvider()
  const url = new URL("https://api.example.com/v1/releases")
  const opts = provider.callCreateRequestOptions(url, { authorization: "token abc" })

  expect((opts.headers as any)["authorization"]).toBe("token abc")
})

test("createRequestOptions - no headers set when both are null", config, ({ expect }) => {
  const provider = makeProvider()
  const url = new URL("https://api.example.com/v1/releases")
  const opts = provider.callCreateRequestOptions(url)

  expect(opts.headers).toBeUndefined()
})
