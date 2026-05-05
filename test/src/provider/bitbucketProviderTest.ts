import { BitbucketOptions } from "builder-util-runtime"
import { assertDownloadNotTriggered, getProvider, mockYaml } from "../helpers/providerTestUtil"
import { createMockRequest, createNsisUpdater, trackEvents, writeUpdateConfig } from "../helpers/updaterTestUtil"

const MOCK_OWNER = "test-owner"
const MOCK_SLUG = "test-repo"
const STABLE_VERSION = "1.1.0"

async function createBitbucketUpdater(requestSpy: ReturnType<typeof createMockRequest>, version = "0.0.1", options: Partial<BitbucketOptions> = {}) {
  const updater = await createNsisUpdater(version)
  // Inject per-test mock executor so concurrent tests never share state
  ;(updater as any).httpExecutor = { request: requestSpy }
  updater.autoDownload = false
  updater.updateConfigPath = await writeUpdateConfig<BitbucketOptions>({
    provider: "bitbucket",
    owner: MOCK_OWNER,
    slug: MOCK_SLUG,
    ...options,
  })
  return updater
}

// Single HTTP call: GET /downloads/{channelFile} → YAML
test("stable release - getLatestVersion fetches channel file and returns UpdateInfo", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createBitbucketUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  expect(result?.updateInfo.version).toBe(STABLE_VERSION)
  expect(result?.updateInfo).toMatchSnapshot()
})

// Channel URL must point to the correct Bitbucket downloads endpoint
test("request URL - uses Bitbucket API downloads endpoint", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createBitbucketUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  const callOptions = requestSpy.mock.calls[0][0]
  expect(callOptions.hostname).toBe("api.bitbucket.org")
  expect(callOptions.path).toContain(`/2.0/repositories/${MOCK_OWNER}/${MOCK_SLUG}/downloads/`)
  expect(callOptions.path).toContain("latest.yml")
})

// Default channel is "latest" when neither updater.channel nor options.channel is set
test("default channel - requests latest.yml", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createBitbucketUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  const callPath = requestSpy.mock.calls[0][0].path as string
  expect(callPath).toContain("latest.yml")
})

// Custom channel via BitbucketOptions.channel
test("custom channel via options - requests {channel}.yml", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createBitbucketUpdater(requestSpy, "0.0.1", { channel: "beta" })

  requestSpy.mockResolvedValueOnce(mockYaml("1.2.0-beta.1"))

  await updater.checkForUpdates()

  const callPath = requestSpy.mock.calls[0][0].path as string
  expect(callPath).toContain("beta.yml")
})

// Custom channel via updater.channel takes precedence over options.channel
test("custom channel via updater.channel - overrides options.channel", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createBitbucketUpdater(requestSpy, "0.0.1", { channel: "stable" })
  updater.channel = "nightly"

  requestSpy.mockResolvedValueOnce(mockYaml("2.0.0"))

  await updater.checkForUpdates()

  const callPath = requestSpy.mock.calls[0][0].path as string
  expect(callPath).toContain("nightly.yml")
})

// Any request failure is wrapped as ERR_UPDATER_LATEST_VERSION_NOT_FOUND
test("request failure - throws ERR_UPDATER_LATEST_VERSION_NOT_FOUND", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createBitbucketUpdater(requestSpy)

  requestSpy.mockRejectedValueOnce(new Error("Connection reset"))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_LATEST_VERSION_NOT_FOUND" })
})

// resolveFiles resolves YAML file URLs relative to the Bitbucket downloads base URL
test("resolveFiles - constructs download URLs relative to Bitbucket base", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createBitbucketUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  const provider = getProvider<any>(updater)
  const resolvedFiles = provider.resolveFiles(result?.updateInfo)

  expect(resolvedFiles).toHaveLength(1)
  expect(resolvedFiles[0].url.href).toBe(`https://api.bitbucket.org/2.0/repositories/${MOCK_OWNER}/${MOCK_SLUG}/downloads/my-app-Setup-${STABLE_VERSION}.exe`)
})

// autoDownload=false → downloadPromise null, events contain only checking + available
test("autoDownload=false - does not trigger download", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createBitbucketUpdater(requestSpy)
  updater.autoDownload = false

  requestSpy.mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const actualEvents = trackEvents(updater)
  const result = await updater.checkForUpdates()

  assertDownloadNotTriggered(expect, result, actualEvents)
})

// toString() describes the provider configuration for logging
test("toString - includes owner, slug, and channel", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createBitbucketUpdater(requestSpy, "0.0.1", { channel: "beta" })

  requestSpy.mockResolvedValueOnce(mockYaml("1.2.0"))

  await updater.checkForUpdates()

  const provider = getProvider<any>(updater)
  expect(provider.toString()).toContain(MOCK_OWNER)
  expect(provider.toString()).toContain(MOCK_SLUG)
  expect(provider.toString()).toContain("beta")
})
