import { serializeToYaml } from "builder-util"
import { CancellationToken, UpdateInfo } from "builder-util-runtime"
import { Provider, ProviderRuntimeOptions } from "electron-updater"
import { parseUpdateInfo } from "electron-updater/src/providers/Provider"
import type { ResolvedUpdateFileInfo } from "electron-updater/src/types"
import { readFileSync } from "fs"
import { OutgoingHttpHeaders } from "http"
import * as path from "path"
import * as semver from "semver"
import { URL } from "url"
import { MockInstance, afterEach, beforeEach, vi } from "vitest"
import { mockAliasChainYaml, mockComplexKeyYaml, mockYaml } from "../helpers/providerTestUtil.js"
import { httpExecutor } from "../helpers/updaterTestUtil.js"

let requestSpy: MockInstance

beforeEach(() => {
  vi.restoreAllMocks()
  // Block every real HTTP call by default; tests opt-in via mockResolvedValueOnce
  requestSpy = vi.spyOn(httpExecutor, "request").mockRejectedValue(new Error("Unexpected HTTP request – mock it with mockResolvedValueOnce"))
})
afterEach(() => vi.restoreAllMocks())

class TestProvider extends Provider<UpdateInfo> {
  constructor(opts: ProviderRuntimeOptions) {
    super(opts)
  }

  getLatestVersion(): Promise<UpdateInfo> {
    return Promise.resolve({ version: "1.0.0", files: [], path: "", sha512: "", releaseDate: "" })
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

test("isUseMultipleRangeRequest - true when runtimeOptions flag is true", ({ expect }) => {
  const provider = makeProvider("win32", true)
  expect(provider.isUseMultipleRangeRequest).toBe(true)
})

test("isUseMultipleRangeRequest - false when runtimeOptions flag is false", ({ expect }) => {
  const provider = makeProvider("win32", false)
  expect(provider.isUseMultipleRangeRequest).toBe(false)
})

test("fileExtraDownloadHeaders - returns null by default", ({ expect }) => {
  const provider = makeProvider()
  expect(provider.fileExtraDownloadHeaders).toBeNull()
})

// undeclared: a download with credential headers fails until a custom provider overrides feedBaseUrl (URL or null)
test("feedBaseUrl - returns undefined (not declared) by default", ({ expect }) => {
  const provider = makeProvider()
  expect(provider.feedBaseUrl).toBeUndefined()
})

test("getDefaultChannelName - win32 returns latest (no suffix)", ({ expect }) => {
  const provider = makeProvider("win32")
  expect(provider.callGetDefaultChannelName()).toBe("latest")
})

test("getDefaultChannelName - darwin returns latest-mac", ({ expect }) => {
  const provider = makeProvider("darwin")
  expect(provider.callGetDefaultChannelName()).toBe("latest-mac")
})

test("getDefaultChannelName - linux returns latest-linux (x64 arch)", ({ expect }) => {
  const orig = process.env["TEST_UPDATER_ARCH"]
  process.env["TEST_UPDATER_ARCH"] = "x64"
  try {
    const provider = makeProvider("linux")
    expect(provider.callGetDefaultChannelName()).toBe("latest-linux")
  } finally {
    if (orig === undefined) {
      delete process.env["TEST_UPDATER_ARCH"]
    } else {
      process.env["TEST_UPDATER_ARCH"] = orig
    }
  }
})

test("getCustomChannelName - win32 returns channel with no suffix", ({ expect }) => {
  const provider = makeProvider("win32")
  expect(provider.callGetCustomChannelName("beta")).toBe("beta")
})

test("getCustomChannelName - darwin appends -mac suffix", ({ expect }) => {
  const provider = makeProvider("darwin")
  expect(provider.callGetCustomChannelName("beta")).toBe("beta-mac")
})

test("getCustomChannelName - linux appends -linux suffix (x64)", ({ expect }) => {
  const orig = process.env["TEST_UPDATER_ARCH"]
  process.env["TEST_UPDATER_ARCH"] = "x64"
  try {
    const provider = makeProvider("linux")
    expect(provider.callGetCustomChannelName("nightly")).toBe("nightly-linux")
  } finally {
    if (orig === undefined) {
      delete process.env["TEST_UPDATER_ARCH"]
    } else {
      process.env["TEST_UPDATER_ARCH"] = orig
    }
  }
})

test("httpRequest - delegates to executor.request with correct options", async ({ expect }) => {
  const provider = makeProvider()
  requestSpy.mockResolvedValueOnce("ok")

  const url = new URL("https://example.com/latest.yml")
  const result = await provider.callHttpRequest(url)

  expect(result).toBe("ok")
  expect(requestSpy).toHaveBeenCalledOnce()
  const opts = requestSpy.mock.calls[0][0]
  expect(opts.hostname).toBe("example.com")
  expect(opts.path).toBe("/latest.yml")
})

test("createRequestOptions - populates hostname and path from URL", ({ expect }) => {
  const provider = makeProvider()
  const url = new URL("https://api.example.com/v1/releases?foo=bar")
  const opts = provider.callCreateRequestOptions(url)

  expect(opts.hostname).toBe("api.example.com")
  expect(opts.path).toBe("/v1/releases?foo=bar")
})

test("createRequestOptions - merges setRequestHeaders with per-call headers", ({ expect }) => {
  const provider = makeProvider()
  provider.setRequestHeaders({ "x-base": "base-value" })

  const url = new URL("https://api.example.com/v1/releases")
  const opts = provider.callCreateRequestOptions(url, { "x-extra": "extra-value" })

  expect((opts.headers as any)["x-base"]).toBe("base-value")
  expect((opts.headers as any)["x-extra"]).toBe("extra-value")
})

test("createRequestOptions - per-call headers used alone when no base headers set", ({ expect }) => {
  const provider = makeProvider()
  const url = new URL("https://api.example.com/v1/releases")
  const opts = provider.callCreateRequestOptions(url, { authorization: "token abc" })

  expect((opts.headers as any)["authorization"]).toBe("token abc")
})

test("createRequestOptions - no headers set when both are null", ({ expect }) => {
  const provider = makeProvider()
  const url = new URL("https://api.example.com/v1/releases")
  const opts = provider.callCreateRequestOptions(url)

  expect(opts.headers).toBeUndefined()
})

const CHANNEL_FILE_URL = new URL("https://example.com/latest.yml")

test.for([
  ["a 40-level alias chain", mockAliasChainYaml("1.0.1", 40)],
  ["a 5000x5000 alias fan-out", `${mockYaml("1.0.1")}big: &b [${Array(5000).fill("x").join(", ")}]\nrefs: [${Array(5000).fill("*b").join(", ")}]\n`],
  ["a self-referencing alias", `${mockYaml("1.0.1")}releaseNotes: &l [*l]\n`],
  ["a 100000-character string aliased 20 times", `${mockYaml("1.0.1")}s: &s ${"A".repeat(100_000)}\nreleaseNotes: [${Array(20).fill("*s").join(", ")}]\n`],
  [
    "a mapping with a 100000-character key referenced through an alias chain",
    `${mockYaml("1.0.1")}k0: &k0 { ${"K".repeat(100_000)}: 1 }\nk1: &k1 [*k0, *k0]\nreleaseNotes: [*k1, *k1]\n`,
  ],
])("parseUpdateInfo - rejects YAML aliases that expand to too many values or characters: %s", ([_name, yaml], { expect }) => {
  const start = performance.now()
  expect(() => parseUpdateInfo(yaml, "latest.yml", CHANNEL_FILE_URL)).toThrow(
    expect.objectContaining({ code: "ERR_UPDATER_INVALID_UPDATE_INFO", message: expect.stringMatching(/YAML aliases expand to more than/) })
  )
  expect(performance.now() - start).toBeLessThan(1000)
})

test.for([
  ["rawData null", null],
  ["invalid YAML", `${mockYaml("1.0.1")}releaseNotes: [unclosed\n`],
  ["aliases past the budget", mockAliasChainYaml("1.0.1", 40)],
])("parseUpdateInfo - the error for %s names the channel file URL without its query", ([_name, rawData], { expect }) => {
  let error: unknown
  try {
    parseUpdateInfo(rawData, "latest.yml", new URL("https://example.com/feed/latest.yml?token=secret#fragment"))
  } catch (e: unknown) {
    error = e
  }
  expect(error).toMatchObject({ code: "ERR_UPDATER_INVALID_UPDATE_INFO", message: expect.stringContaining("(https://example.com/feed/latest.yml)") })
  expect(error instanceof Error ? `${error.message}\n${error.stack}` : String(error)).not.toContain("secret")
})

test("parseUpdateInfo - the alias-budget error names the v27 change, the replacement and the migration guide", ({ expect }) => {
  let error: unknown
  try {
    parseUpdateInfo(mockAliasChainYaml("1.0.1", 40), "latest.yml", CHANNEL_FILE_URL)
  } catch (e: unknown) {
    error = e
  }
  expect(error).toMatchObject({
    code: "ERR_UPDATER_INVALID_UPDATE_INFO",
    message:
      "Cannot parse update info from latest.yml in the latest release artifacts (https://example.com/latest.yml): YAML aliases expand to more than 100000 values and string characters. " +
      "electron-updater 7 (electron-builder v27) rejects such a manifest: publish it without YAML aliases (js-yaml `dump` with `noRefs: true`, as electron-builder writes it) " +
      "or with the shared values repeated inline. https://www.electron.build/docs/migration/v27-runtime-changes#update-manifest-yaml-aliases-are-limited",
  })
})

test("parseUpdateInfo - accepts aliases as serializeToYaml writes them up to the budget", ({ expect }) => {
  // each reference to the notes is charged about 43000 keys, values and string characters, and the file stays under 100000 characters
  const notes = Array.from({ length: 200 }, (_, i) => ({ version: `0.${i}.0`, note: "n".repeat(200) }))
  const info = { version: "1.0.1", files: [{ url: "TestApp-Setup-1.0.1.exe", sha512: "sha512abc", size: 1024 }], path: "TestApp-Setup-1.0.1.exe", sha512: "sha512abc" }

  const twice = serializeToYaml({ ...info, releaseNotes: notes, previousReleaseNotes: notes })
  expect(twice).toContain("*ref_0")
  expect(parseUpdateInfo(twice, "latest.yml", CHANNEL_FILE_URL)).toEqual({ ...info, releaseNotes: notes, previousReleaseNotes: notes })

  const threeTimes = serializeToYaml({ ...info, releaseNotes: notes, previousReleaseNotes: notes, olderReleaseNotes: notes })
  expect(() => parseUpdateInfo(threeTimes, "latest.yml", CHANNEL_FILE_URL)).toThrow(expect.objectContaining({ code: "ERR_UPDATER_INVALID_UPDATE_INFO" }))
})

test("parseUpdateInfo - accepts alias-free channel files of any size and a benign alias", ({ expect }) => {
  const channelFile = [
    "version: 1.0.1",
    "files:",
    "  - url: TestApp-Setup-1.0.1.exe",
    "    sha512: sha512abc",
    "    size: 1024",
    "    blockMapSize: 128",
    "path: TestApp-Setup-1.0.1.exe",
    "sha512: sha512abc",
    "releaseDate: '2026-01-01T00:00:00.000Z'",
    "releaseNotes:",
    "  - version: 1.0.1",
    "    note: fixes",
    "  - version: 1.0.0",
    "    note: null",
    "",
  ].join("\n")
  expect(parseUpdateInfo(channelFile, "latest.yml", CHANNEL_FILE_URL).releaseNotes).toHaveLength(2)

  // about 1 MB of release notes
  const notes = Array.from({ length: 5000 }, (_, i) => `  - version: 0.${i}.0\n    note: "${"n".repeat(200)}"\n`).join("")
  expect(parseUpdateInfo(`${mockYaml("1.0.1")}releaseNotes:\n${notes}`, "latest.yml", CHANNEL_FILE_URL).releaseNotes).toHaveLength(5000)

  // more than 100000 values without aliases: the budget grows with the size of the file
  const many = Array(150_000).fill("x").join(",")
  expect(parseUpdateInfo(`${mockYaml("1.0.1")}releaseNotes: [${many}]\n`, "latest.yml", CHANNEL_FILE_URL).releaseNotes).toHaveLength(150_000)

  // a string longer than 100000 characters without aliases: it is never longer than the text it was parsed from
  const note = "z".repeat(300_000)
  expect(parseUpdateInfo(`${mockYaml("1.0.1")}releaseNotes: ${note}\n`, "latest.yml", CHANNEL_FILE_URL).releaseNotes).toBe(note)
  const block = `${mockYaml("1.0.1")}releaseNotes: |\n${"  line of the release notes\n".repeat(20_000)}`
  expect(parseUpdateInfo(block, "latest.yml", CHANNEL_FILE_URL).releaseNotes).toBe("line of the release notes\n".repeat(20_000))

  const withAlias = parseUpdateInfo(`${mockYaml("1.0.1")}other: &f [a, b]\nreleaseNotes: *f\n`, "latest.yml", CHANNEL_FILE_URL) as any
  expect(withAlias.releaseNotes).toEqual(["a", "b"])
})

// js-yaml converts a complex mapping key to a string inside load, so its aliases must be charged before load returns:
// without that, these fail as a duplicated mapping key, or a key longer than a string can be, after the keys are built
test.for([
  ["two explicit sequence keys", mockComplexKeyYaml("1.0.1")],
  ["two implicit flow sequence keys", `${mockYaml("1.0.1")}s: &s ${"A".repeat(10_000)}\n${`[${Array(200).fill("*s").join(", ")}]: 0\n`.repeat(2)}`],
  [
    "two sequence keys in a flow mapping",
    `${mockYaml("1.0.1")}s: &s ${"A".repeat(10_000)}\nm: { [${Array(200).fill("*s").join(", ")}]: 0, [${Array(200).fill("*s").join(", ")}]: 1 }\n`,
  ],
  ["a 600M-character key", `${mockYaml("1.0.1")}s: &s ${"A".repeat(100_000)}\n? [${Array(6000).fill("*s").join(", ")}]\n: 0\n`],
])("parseUpdateInfo - rejects YAML aliases in complex mapping keys while loading: %s", ([_name, yaml], { expect }) => {
  const start = performance.now()
  // the error thrown from the listener reaches the caller as is, not wrapped with the stack and the whole rawData
  expect(() => parseUpdateInfo(yaml, "latest.yml", CHANNEL_FILE_URL)).toThrow(
    expect.objectContaining({
      code: "ERR_UPDATER_INVALID_UPDATE_INFO",
      message: expect.stringMatching(
        /^Cannot parse update info from latest\.yml in the latest release artifacts \(https:\/\/example\.com\/latest\.yml\): YAML aliases expand to more than \d+ values and string characters\. electron-updater 7 \(electron-builder v27\) rejects such a manifest: [^\n]* https:\/\/www\.electron\.build\/docs\/migration\/v27-runtime-changes#update-manifest-yaml-aliases-are-limited$/
      ),
    })
  )
  expect(performance.now() - start).toBeLessThan(1000)
})

test("parseUpdateInfo - accepts a channel file as electron-builder writes it, and aliases in a key within the budget", ({ expect }) => {
  const info = {
    version: "1.0.1",
    files: [
      { url: "TestApp-Setup-1.0.1.exe", sha512: "sha512abc", size: 1024 },
      { url: "TestApp-1.0.1-arm64.exe", sha512: "sha512def", size: 2048 },
    ],
    path: "TestApp-Setup-1.0.1.exe",
    sha512: "sha512abc",
    releaseDate: "2026-01-01T00:00:00.000Z",
    releaseNotes: "Fixes and improvements",
  }
  expect(parseUpdateInfo(serializeToYaml(info), "latest.yml", CHANNEL_FILE_URL)).toEqual(info)

  const withKey = parseUpdateInfo(`${mockYaml("1.0.1")}n: &n note\n? [*n, *n]\n: 0\n`, "latest.yml", CHANNEL_FILE_URL) as any
  expect(withKey["note,note"]).toBe(0)
})

// js-yaml before 4.3.2 spends seconds of CPU on a few hundred KB of YAML merge keys, and the channel file is parsed before its signature is checked
test("electron-updater requires a js-yaml that bounds YAML merge keys", ({ expect }) => {
  const { dependencies } = JSON.parse(readFileSync(path.join(import.meta.dirname, "../../../packages/electron-updater/package.json"), "utf8"))
  expect(dependencies["js-yaml"]).toSatisfy((range: string) => semver.subset(range, ">=4.3.2"))
})

test.for([
  ["20000 empty merge sources", `${mockYaml("1.0.1")}arr: &arr [${Array(20_000).fill("{}").join(", ")}]\ntargets:\n${"  - <<: *arr\n".repeat(20_000)}`],
  [
    "a chain of 8000 merge keys",
    `${mockYaml("1.0.1")}a0: &a0 { k0: 0 }\n${Array.from({ length: 7999 }, (_, i) => `a${i + 1}: &a${i + 1} { <<: *a${i}, k${i + 1}: 0 }\n`).join("")}`,
  ],
])("parseUpdateInfo - rejects YAML merge keys that would take seconds to parse: %s", ([_name, yaml], { expect }) => {
  const start = performance.now()
  // the message embeds the whole channel file, so only the code is checked
  expect(() => parseUpdateInfo(yaml, "latest.yml", CHANNEL_FILE_URL)).toThrow(expect.objectContaining({ code: "ERR_UPDATER_INVALID_UPDATE_INFO" }))
  expect(performance.now() - start).toBeLessThan(1000)
})
