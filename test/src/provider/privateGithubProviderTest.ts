import { GithubOptions, HttpError } from "builder-util-runtime"
import { prereleaseChannelOf } from "electron-updater/src/providers/GitHubProvider"
import { PrivateGitHubProvider } from "electron-updater/src/providers/PrivateGitHubProvider"
import type { PrivateGitHubUpdateInfo } from "electron-updater/src/providers/PrivateGitHubProvider"
import { assertDownloadNotTriggered, getProvider, mockAliasChainYaml, mockComplexKeyYaml, mockYaml } from "../helpers/providerTestUtil.js"
import { createMockRequest, createNsisUpdater, trackEvents, writeUpdateConfig } from "../helpers/updaterTestUtil.js"

const MOCK_TOKEN = "ghp_test-token-12345"
const MOCK_OWNER = "test-owner"
const MOCK_REPO = "test-private-repo"
const STABLE_VERSION = "1.1.0"
const PRERELEASE_VERSION = "1.2.0-beta.1"

// extraChannelFiles (e.g. beta.yml) are listed next to latest.yml, with the file name as their asset id so a test can tell which one was requested
function mockAssets(version: string, extraChannelFiles: Array<string> = []) {
  return [
    { name: "latest.yml", url: `https://api.github.com/repos/${MOCK_OWNER}/${MOCK_REPO}/releases/assets/1001` },
    ...extraChannelFiles.map(name => ({ name, url: `https://api.github.com/repos/${MOCK_OWNER}/${MOCK_REPO}/releases/assets/${name}` })),
    { name: `my-app-Setup-${version}.exe`, url: `https://api.github.com/repos/${MOCK_OWNER}/${MOCK_REPO}/releases/assets/1002` },
    { name: `my-app-Setup-${version}.exe.blockmap`, url: `https://api.github.com/repos/${MOCK_OWNER}/${MOCK_REPO}/releases/assets/1003` },
  ]
}

function mockRelease(version: string, opts: { draft?: boolean; prerelease?: boolean; tagName?: string; extraChannelFiles?: Array<string> } = {}) {
  const tagName = opts.tagName ?? `v${version}`
  return {
    tag_name: tagName,
    name: `v${version}`,
    html_url: `https://github.com/${MOCK_OWNER}/${MOCK_REPO}/releases/tag/${tagName}`,
    draft: opts.draft ?? false,
    prerelease: opts.prerelease ?? false,
    assets: mockAssets(version, opts.extraChannelFiles),
  }
}

async function createPrivateUpdater(requestSpy: ReturnType<typeof createMockRequest>, version = "0.0.1", extraOptions: Partial<GithubOptions> = {}) {
  const updater = await createNsisUpdater(version)
  // Inject per-test mock executor so concurrent tests never share state
  ;(updater as any).httpExecutor = { request: requestSpy }
  updater.autoDownload = false
  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: MOCK_OWNER,
    repo: MOCK_REPO,
    token: MOCK_TOKEN,
    ...extraOptions,
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
  // Draft should be excluded, falls back to the highest non-draft
  expect(result?.updateInfo.version).toBe(STABLE_VERSION)
})

// The release list is ordered by creation date, not by version: like GitHubProvider (#10287), allowPrerelease=true picks
// the highest semver release eligible for the current channel, not the first pre-release in the list.
test.for([
  {
    name: "a pre-release client is offered a newer stable release listed before its pre-release",
    currentVersion: "2.0.0-beta.3",
    releases: [mockRelease("2.0.0"), mockRelease("2.0.0-beta.3", { prerelease: true })],
    expected: "2.0.0",
    isUpdateAvailable: true,
  },
  {
    name: "a lower pre-release hotfix created after a higher pre-release does not hide it",
    currentVersion: "1.2.0-beta.2",
    releases: [mockRelease("1.1.5-beta.1", { prerelease: true }), mockRelease("1.2.0-beta.3", { prerelease: true }), mockRelease("1.2.0-beta.2", { prerelease: true })],
    expected: "1.2.0-beta.3",
    isUpdateAvailable: true,
  },
  {
    name: 'channel = "beta" does not downgrade a pre-release client to a lower pre-release hotfix',
    currentVersion: "1.2.0-beta.2",
    channel: "beta",
    releases: [mockRelease("1.1.5-beta.1", { prerelease: true }), mockRelease("1.2.0-beta.3", { prerelease: true }), mockRelease("1.2.0-beta.2", { prerelease: true })],
    expected: "1.2.0-beta.3",
    isUpdateAvailable: true,
  },
  {
    name: 'channel = "beta" does not downgrade a stable client to an older pre-release',
    currentVersion: "2.1.0",
    channel: "beta",
    releases: [mockRelease("2.1.0"), mockRelease("2.0.0-beta.3", { prerelease: true })],
    expected: "2.1.0",
    isUpdateAvailable: false,
  },
  {
    name: "a beta client is not offered an alpha release",
    currentVersion: "1.0.0-beta.1",
    releases: [mockRelease("1.1.0-alpha.1", { prerelease: true }), mockRelease("1.0.0-beta.1", { prerelease: true })],
    expected: "1.0.0-beta.1",
    isUpdateAvailable: false,
  },
  {
    name: "a release whose tag is not a version is skipped",
    currentVersion: "1.0.0",
    releases: [mockRelease("3.0.0", { prerelease: true, tagName: "some-package@3.0.0" }), mockRelease("1.1.0")],
    expected: "1.1.0",
    isUpdateAvailable: true,
  },
  {
    name: "tags with a custom tagNamePrefix are compared by their version",
    currentVersion: "1.0.0-beta.1",
    options: { tagNamePrefix: "app-" },
    releases: [mockRelease("1.3.0", { tagName: "app-1.3.0" }), mockRelease("1.2.0-beta.1", { prerelease: true, tagName: "app-1.2.0-beta.1" })],
    expected: "1.3.0",
    isUpdateAvailable: true,
  },
  {
    name: "with a custom tagNamePrefix, a higher tag without the prefix belongs to another package and is skipped",
    currentVersion: "1.2.0-beta.1",
    options: { tagNamePrefix: "app-" },
    releases: [mockRelease("9.0.0", { tagName: "v9.0.0" }), mockRelease("5.0.0", { tagName: "5.0.0" }), mockRelease("1.3.0", { tagName: "app-1.3.0" })],
    expected: "1.3.0",
    isUpdateAvailable: true,
  },
  {
    name: 'with the default tagNamePrefix, tags with and without the "v" are compared',
    currentVersion: "1.0.0-beta.1",
    releases: [mockRelease("1.1.0"), mockRelease("1.2.0", { tagName: "1.2.0" })],
    expected: "1.2.0",
    isUpdateAvailable: true,
  },
  {
    name: "a numeric pre-release client (1.0.1-1) is offered a higher numeric pre-release",
    currentVersion: "1.0.1-1",
    releases: [mockRelease("1.0.1-2", { prerelease: true }), mockRelease("1.0.1-1", { prerelease: true })],
    expected: "1.0.1-2",
    isUpdateAvailable: true,
  },
  {
    name: "a numeric pre-release client (1.0.1-1) is offered the stable release",
    currentVersion: "1.0.1-1",
    releases: [mockRelease("1.0.1"), mockRelease("1.0.1-2", { prerelease: true }), mockRelease("1.0.1-1", { prerelease: true })],
    expected: "1.0.1",
    isUpdateAvailable: true,
  },
  {
    name: "releases whose tags are not versions: the first pre-release in the list",
    currentVersion: "1.0.0",
    releases: [mockRelease("1.2.0", { tagName: "release-1.2.0" }), mockRelease("1.3.0-beta.1", { prerelease: true, tagName: "release-1.3.0-beta.1" })],
    expected: "1.3.0-beta.1",
    isUpdateAvailable: true,
  },
  {
    name: "releases whose tags are not versions and no pre-release: the first release in the list",
    currentVersion: "1.0.0",
    releases: [mockRelease("1.2.0", { tagName: "release-1.2.0" }), mockRelease("1.1.0", { tagName: "release-1.1.0" })],
    expected: "1.2.0",
    isUpdateAvailable: true,
  },
  {
    name: "with a custom tagNamePrefix and no tag carrying it: the first pre-release in the list",
    currentVersion: "1.0.0",
    options: { tagNamePrefix: "app-" },
    releases: [mockRelease("2.0.0"), mockRelease("1.3.0-beta.1", { prerelease: true })],
    expected: "1.3.0-beta.1",
    isUpdateAvailable: true,
  },
])("allowPrerelease=true - $name", async ({ currentVersion, channel, options, releases, expected, isUpdateAvailable }, { expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy, currentVersion, options)
  if (channel != null) {
    updater.channel = channel
  }
  updater.allowPrerelease = true

  requestSpy.mockResolvedValueOnce(JSON.stringify(releases)).mockResolvedValueOnce(mockYaml(expected))

  const result = await updater.checkForUpdates()
  const info = result?.updateInfo as PrivateGitHubUpdateInfo
  // the assets come from the selected release
  expect(info.assets.map(it => it.name)).toContain(`my-app-Setup-${expected}.exe`)
  expect(info.version).toBe(expected)
  expect(result?.isUpdateAvailable).toBe(isUpdateAvailable)
})

test.for([
  {
    name: "a selected pre-release reads its own channel file",
    allowPrerelease: true,
    release: mockRelease("1.0.0-beta.2", { prerelease: true, extraChannelFiles: ["beta.yml"] }),
    expectedAsset: "beta.yml",
  },
  {
    name: "a selected pre-release without its own channel file falls back to latest.yml",
    allowPrerelease: true,
    release: mockRelease("1.0.0-beta.2", { prerelease: true }),
    expectedAsset: "1001",
  },
  {
    name: "the app-update.yml channel names the channel file of a stable release",
    allowPrerelease: false,
    options: { channel: "beta" },
    release: mockRelease("1.1.0", { extraChannelFiles: ["beta.yml"] }),
    expectedAsset: "beta.yml",
  },
  {
    name: "a release without the configured channel file falls back to latest.yml",
    allowPrerelease: false,
    options: { channel: "beta" },
    release: mockRelease("1.1.0"),
    expectedAsset: "1001",
  },
])("channel file - $name", async ({ allowPrerelease, options, release, expectedAsset }, { expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy, allowPrerelease ? "1.0.0-beta.1" : "1.0.0", options)
  updater.allowPrerelease = allowPrerelease

  requestSpy.mockResolvedValueOnce(JSON.stringify(allowPrerelease ? [release] : release)).mockResolvedValueOnce(mockYaml(release.name.slice(1)))

  await updater.checkForUpdates()
  expect(requestSpy.mock.calls[1][0].path).toBe(`/repos/${MOCK_OWNER}/${MOCK_REPO}/releases/assets/${expectedAsset}`)
})

test.for([
  { name: "only drafts", releases: [mockRelease(PRERELEASE_VERSION, { prerelease: true, draft: true })] },
  { name: "an empty list", releases: [] },
])("allowPrerelease=true with $name - throws ERR_UPDATER_NO_PUBLISHED_VERSIONS", async ({ releases }, { expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy, "1.0.0-beta.1")

  requestSpy.mockResolvedValueOnce(JSON.stringify(releases))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_NO_PUBLISHED_VERSIONS" })
})

test("allowPrerelease=true - skips release list entries without a tag_name or assets", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy, "1.0.0")
  updater.allowPrerelease = true

  const { tag_name: _tagName, ...withoutTagName } = mockRelease("3.0.0")
  const { assets: _assets, ...withoutAssets } = mockRelease("2.0.0")
  requestSpy.mockResolvedValueOnce(JSON.stringify([null, "v4.0.0", withoutTagName, withoutAssets, mockRelease(STABLE_VERSION)])).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  expect(result?.updateInfo.version).toBe(STABLE_VERSION)
})

test("allowPrerelease=true with a release list that is not an array - throws ERR_UPDATER_LATEST_VERSION_NOT_FOUND", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy, "1.0.0")
  updater.allowPrerelease = true

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockRelease(STABLE_VERSION)))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({
    code: "ERR_UPDATER_LATEST_VERSION_NOT_FOUND",
    message: expect.stringContaining("expected a list of releases, got object"),
  })
})

test.for([
  { name: "an empty body", body: null },
  { name: "a null release", body: "null" },
  { name: "a release without assets", body: JSON.stringify({ tag_name: "v1.1.0", name: "v1.1.0" }) },
])("allowPrerelease=false with $name from /releases/latest - throws ERR_UPDATER_LATEST_VERSION_NOT_FOUND", async ({ body }, { expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy)
  updater.allowPrerelease = false

  requestSpy.mockResolvedValueOnce(body)

  await expect(updater.checkForUpdates()).rejects.toMatchObject({
    code: "ERR_UPDATER_LATEST_VERSION_NOT_FOUND",
    message: expect.stringContaining("expected a release with a list of assets"),
  })
})

test("prereleaseChannelOf - returns the first pre-release identifier as a string", ({ expect }) => {
  expect(prereleaseChannelOf("1.0.0-beta.1")).toBe("beta")
  expect(prereleaseChannelOf("1.0.0-1")).toBe("1")
  expect(prereleaseChannelOf("1.0.0-0")).toBeNull()
  expect(prereleaseChannelOf("1.0.0")).toBeNull()
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

test("missing channel file of a selected pre-release - names both channel files", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy, "1.0.0-beta.1")
  updater.allowPrerelease = true

  const release = mockRelease("1.0.0-beta.2", { prerelease: true })
  requestSpy.mockResolvedValueOnce(JSON.stringify([{ ...release, assets: release.assets.filter(it => it.name !== "latest.yml") }]))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({
    code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND",
    message: `Cannot find beta.yml or latest.yml in the release ${release.html_url}`,
  })
})

test("404 on channel file asset - throws ERR_UPDATER_CHANNEL_FILE_NOT_FOUND", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockRelease(STABLE_VERSION))).mockRejectedValueOnce(new HttpError(404))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND" })
})

test("channel file with YAML aliases that expand to too many values - throws ERR_UPDATER_INVALID_UPDATE_INFO", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockRelease(STABLE_VERSION))).mockResolvedValueOnce(mockAliasChainYaml(STABLE_VERSION, 40))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_INVALID_UPDATE_INFO", message: expect.stringMatching(/YAML aliases expand to more than/) })
})

test("channel file with YAML aliases in complex mapping keys - throws ERR_UPDATER_INVALID_UPDATE_INFO while loading", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockRelease(STABLE_VERSION))).mockResolvedValueOnce(mockComplexKeyYaml(STABLE_VERSION))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_INVALID_UPDATE_INFO", message: expect.stringMatching(/YAML aliases expand to more than/) })
})

test("malformed channel file - throws ERR_UPDATER_INVALID_UPDATE_INFO", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPrivateUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockRelease(STABLE_VERSION))).mockResolvedValueOnce(`${mockYaml(STABLE_VERSION)}releaseNotes: [unclosed\n`)

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_INVALID_UPDATE_INFO", message: expect.stringMatching(/YAMLException/) })
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
