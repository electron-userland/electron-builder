import { GithubOptions, HttpError } from "builder-util-runtime"
import { PrivateGitHubProvider, PrivateGitHubUpdateInfo } from "electron-updater/src/providers/PrivateGitHubProvider"
import { assertDownloadNotTriggered, getProvider, mockYaml } from "../helpers/providerTestUtil"
import { createMockRequest, createNsisUpdater, trackEvents, writeUpdateConfig } from "../helpers/updaterTestUtil"

const MOCK_TOKEN = "ghp_test-token-12345"
const MOCK_OWNER = "test-owner"
const MOCK_REPO = "test-private-repo"
const STABLE_VERSION = "1.1.0"
const PRERELEASE_VERSION = "1.2.0-beta.1"

function mockAssets(version: string) {
  return [
    { name: "latest.yml", url: `https://api.github.com/repos/${MOCK_OWNER}/${MOCK_REPO}/releases/assets/1001` },
    { name: `my-app-Setup-${version}.exe`, url: `https://api.github.com/repos/${MOCK_OWNER}/${MOCK_REPO}/releases/assets/1002` },
    { name: `my-app-Setup-${version}.exe.blockmap`, url: `https://api.github.com/repos/${MOCK_OWNER}/${MOCK_REPO}/releases/assets/1003` },
  ]
}

function mockRelease(version: string, opts: { draft?: boolean; prerelease?: boolean } = {}) {
  return {
    name: `v${version}`,
    html_url: `https://github.com/${MOCK_OWNER}/${MOCK_REPO}/releases/tag/v${version}`,
    draft: opts.draft ?? false,
    prerelease: opts.prerelease ?? false,
    assets: mockAssets(version),
  }
}

async function createPrivateUpdater(requestSpy: ReturnType<typeof createMockRequest>, version = "0.0.1") {
  const updater = await createNsisUpdater(version)
  // Inject per-test mock executor so concurrent tests never share state
  ;(updater as any).httpExecutor = { request: requestSpy }
  updater.autoDownload = false
  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: MOCK_OWNER,
    repo: MOCK_REPO,
    token: MOCK_TOKEN,
  })
  return updater
}

test("stable release - checkForUpdates returns correct UpdateInfo", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockRelease(STABLE_VERSION))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  const info = result?.updateInfo as PrivateGitHubUpdateInfo

  expect(info.version).toBe(STABLE_VERSION)
  expect(info.assets).toHaveLength(3)
  expect(info.assets[0].name).toBe("latest.yml")
  expect(result?.updateInfo).toMatchSnapshot()
})

test("allowPrerelease=true - picks prerelease from release list", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy)
  updater.allowPrerelease = true

  requestSpy
    .mockResolvedValueOnce(JSON.stringify([mockRelease(STABLE_VERSION), mockRelease(PRERELEASE_VERSION, { prerelease: true })]))
    .mockResolvedValueOnce(mockYaml(PRERELEASE_VERSION))

  const result = await updater.checkForUpdates()
  expect(result?.updateInfo.version).toBe(PRERELEASE_VERSION)
})

test("allowPrerelease=false - uses /latest endpoint and returns stable release", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy)
  updater.allowPrerelease = false

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockRelease(STABLE_VERSION))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  expect(result?.updateInfo.version).toBe(STABLE_VERSION)

  // The first call should be to /releases/latest (not the list endpoint)
  const firstCallOptions = requestSpy.mock.calls[0][0]
  expect(firstCallOptions.path).toContain("/releases/latest")
})

test("allowPrerelease=true - skips draft releases", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy)
  updater.allowPrerelease = true

  requestSpy
    .mockResolvedValueOnce(JSON.stringify([mockRelease(PRERELEASE_VERSION, { prerelease: true, draft: true }), mockRelease(STABLE_VERSION)]))
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  // Draft should be excluded, falls back to first non-draft
  expect(result?.updateInfo.version).toBe(STABLE_VERSION)
})

test("missing channel file - throws ERR_UPDATER_CHANNEL_FILE_NOT_FOUND", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy)

  const releaseWithNoChannelFile = {
    ...mockRelease(STABLE_VERSION),
    assets: [{ name: `my-app-Setup-${STABLE_VERSION}.exe`, url: "https://api.github.com/repos/test-owner/test-private-repo/releases/assets/1002" }],
  }

  requestSpy.mockResolvedValueOnce(JSON.stringify(releaseWithNoChannelFile))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND" })
})

test("404 on channel file asset - throws ERR_UPDATER_CHANNEL_FILE_NOT_FOUND", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockRelease(STABLE_VERSION))).mockRejectedValueOnce(new HttpError(404))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND" })
})

test("no releases available - throws ERR_UPDATER_LATEST_VERSION_NOT_FOUND", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy)

  requestSpy.mockRejectedValueOnce(new Error("Network failure"))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_LATEST_VERSION_NOT_FOUND" })
})

test("fileExtraDownloadHeaders - includes authorization token with correct format", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockRelease(STABLE_VERSION))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  const provider = getProvider<PrivateGitHubProvider>(updater)
  expect(provider.fileExtraDownloadHeaders).toEqual({
    accept: "application/octet-stream",
    authorization: `token ${MOCK_TOKEN}`,
  })
})

test("resolveFiles - maps release assets to asset download URLs", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockRelease(STABLE_VERSION))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  const provider = getProvider<PrivateGitHubProvider>(updater)
  const updateInfo = result?.updateInfo as PrivateGitHubUpdateInfo

  const resolvedFiles = provider.resolveFiles(updateInfo)
  expect(resolvedFiles).toHaveLength(1)
  expect(resolvedFiles[0].url.href).toBe(`https://api.github.com/repos/${MOCK_OWNER}/${MOCK_REPO}/releases/assets/1002`)
})

test("resolveFiles - throws ERR_UPDATER_ASSET_NOT_FOUND when asset missing from release", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockRelease(STABLE_VERSION))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()
  const provider = getProvider<PrivateGitHubProvider>(updater)

  const updateInfoWithEmptyAssets: PrivateGitHubUpdateInfo = {
    version: STABLE_VERSION,
    files: [{ url: `my-app-Setup-${STABLE_VERSION}.exe`, sha512: "abc", size: 100 }],
    path: `my-app-Setup-${STABLE_VERSION}.exe`,
    sha512: "abc",
    releaseDate: "2024-01-01T00:00:00.000Z",
    assets: [],
  }

  expect(() => provider.resolveFiles(updateInfoWithEmptyAssets)).toThrow(expect.objectContaining({ code: "ERR_UPDATER_ASSET_NOT_FOUND" }))
})

test("autoDownload=false - checkForUpdates does not trigger download", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy)
  updater.autoDownload = false

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockRelease(STABLE_VERSION))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const actualEvents = trackEvents(updater)
  const result = await updater.checkForUpdates()

  assertDownloadNotTriggered(expect, result, actualEvents)
})

test("authorization header sent in GitHub API request", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockRelease(STABLE_VERSION))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  const firstCallOptions = requestSpy.mock.calls[0][0]
  expect(firstCallOptions.headers).toMatchObject({
    authorization: `token ${MOCK_TOKEN}`,
    accept: "application/vnd.github.v3+json",
  })
})

test("channel file request uses octet-stream accept header with authorization", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockRelease(STABLE_VERSION))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  const secondCallOptions = requestSpy.mock.calls[1][0]
  expect(secondCallOptions.headers).toMatchObject({
    authorization: `token ${MOCK_TOKEN}`,
    accept: "application/octet-stream",
  })
})

test("enterprise GitHub host - uses /api/v3 prefix in request path", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createNsisUpdater()
  // Inject per-test mock before setting updateConfigPath (which resets clientPromise)
  ;(updater as any).httpExecutor = { request: requestSpy }
  updater.autoDownload = false
  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: MOCK_OWNER,
    repo: MOCK_REPO,
    token: MOCK_TOKEN,
    host: "github.mycompany.com",
  })

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockRelease(STABLE_VERSION))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  const firstCallOptions = requestSpy.mock.calls[0][0]
  expect(firstCallOptions.path).toMatch(/^\/api\/v3\/repos\//)
})
