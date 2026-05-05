import { KeygenOptions } from "builder-util-runtime"
import { assertDownloadNotTriggered, getProvider, mockYaml } from "../helpers/providerTestUtil"
import { createMockRequest, createNsisUpdater, trackEvents, writeUpdateConfig } from "../helpers/updaterTestUtil"

const MOCK_ACCOUNT = "test-account-id"
const MOCK_PRODUCT = "test-product-id"
const STABLE_VERSION = "1.1.0"

async function createKeygenUpdater(requestSpy: ReturnType<typeof createMockRequest>, version = "0.0.1", options: Partial<KeygenOptions> = {}) {
  const updater = await createNsisUpdater(version)
  // Inject per-test mock executor so concurrent tests never share state
  ;(updater as any).httpExecutor = { request: requestSpy }
  updater.autoDownload = false
  updater.updateConfigPath = await writeUpdateConfig<KeygenOptions>({
    provider: "keygen",
    account: MOCK_ACCOUNT,
    product: MOCK_PRODUCT,
    ...options,
  })
  return updater
}

// Single HTTP call with Keygen-specific headers
test("stable release - getLatestVersion fetches channel file and returns UpdateInfo", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createKeygenUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  expect(result?.updateInfo.version).toBe(STABLE_VERSION)
  expect(result?.updateInfo).toMatchSnapshot()
})

// Request must go to api.keygen.sh with account and product in URL
test("request URL - uses Keygen API with account and product", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createKeygenUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  const callOptions = requestSpy.mock.calls[0][0]
  expect(callOptions.hostname).toBe("api.keygen.sh")
  expect(callOptions.path).toContain(MOCK_ACCOUNT)
  expect(callOptions.path).toContain(MOCK_PRODUCT)
})

// Keygen requires Accept: application/vnd.api+json and Keygen-Version headers
test("request headers - sends Keygen-specific Accept and Keygen-Version headers", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createKeygenUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  const headers = requestSpy.mock.calls[0][0].headers as Record<string, string>
  expect(headers["Accept"]).toBe("application/vnd.api+json")
  expect(headers["Keygen-Version"]).toBe("1.1")
})

// Default channel is "stable" (not "latest" as in other providers)
test("default channel - requests stable.yml (Keygen default is stable, not latest)", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createKeygenUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  const callPath = requestSpy.mock.calls[0][0].path as string
  expect(callPath).toContain("stable.yml")
})

// Custom channel via KeygenOptions.channel
test("custom channel via options - requests {channel}.yml", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createKeygenUpdater(requestSpy, "0.0.1", { channel: "beta" })

  requestSpy.mockResolvedValueOnce(mockYaml("1.2.0-beta.1"))

  await updater.checkForUpdates()

  const callPath = requestSpy.mock.calls[0][0].path as string
  expect(callPath).toContain("beta.yml")
})

// updater.channel takes precedence over configuration.channel
test("custom channel via updater.channel - overrides options.channel", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createKeygenUpdater(requestSpy, "0.0.1", { channel: "stable" })
  updater.channel = "nightly"

  requestSpy.mockResolvedValueOnce(mockYaml("2.0.0"))

  await updater.checkForUpdates()

  const callPath = requestSpy.mock.calls[0][0].path as string
  expect(callPath).toContain("nightly.yml")
})

// Custom host override via KeygenOptions.host
test("custom host - uses configured host instead of api.keygen.sh", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createKeygenUpdater(requestSpy, "0.0.1", { host: "keygen.mycompany.com" })

  requestSpy.mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  const callOptions = requestSpy.mock.calls[0][0]
  expect(callOptions.hostname).toBe("keygen.mycompany.com")
})

// Any request failure is wrapped as ERR_UPDATER_LATEST_VERSION_NOT_FOUND
test("request failure - throws ERR_UPDATER_LATEST_VERSION_NOT_FOUND", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createKeygenUpdater(requestSpy)

  requestSpy.mockRejectedValueOnce(new Error("Network failure"))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_LATEST_VERSION_NOT_FOUND" })
})

// resolveFiles resolves YAML file URLs relative to the Keygen artifacts base URL
test("resolveFiles - constructs download URLs relative to Keygen artifacts base", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createKeygenUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  const provider = getProvider<any>(updater)
  const resolvedFiles = provider.resolveFiles(result?.updateInfo)

  expect(resolvedFiles).toHaveLength(1)
  // URL is resolved relative to base: https://api.keygen.sh/v1/accounts/{account}/artifacts?product={product}
  expect(resolvedFiles[0].url.href).toContain(MOCK_ACCOUNT)
  expect(resolvedFiles[0].url.href).toContain(`my-app-Setup-${STABLE_VERSION}.exe`)
})

// autoDownload=false → downloadPromise null, only checking + available events
test("autoDownload=false - does not trigger download", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createKeygenUpdater(requestSpy)
  updater.autoDownload = false

  requestSpy.mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const actualEvents = trackEvents(updater)
  const result = await updater.checkForUpdates()

  assertDownloadNotTriggered(expect, result, actualEvents)
})

// toString() describes the provider configuration for logging
test("toString - includes account, product, platform, and channel", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createKeygenUpdater(requestSpy, "0.0.1", { channel: "beta", platform: "win32" })

  requestSpy.mockResolvedValueOnce(mockYaml("1.2.0"))

  await updater.checkForUpdates()

  const provider = getProvider<any>(updater)
  const description = provider.toString()
  expect(description).toContain(MOCK_ACCOUNT)
  expect(description).toContain(MOCK_PRODUCT)
  expect(description).toContain("beta")
})
