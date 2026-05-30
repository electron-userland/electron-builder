import { GitlabOptions, GitlabReleaseInfo, HttpError } from "builder-util-runtime"
import { GitLabProvider } from "electron-updater/src/providers/GitLabProvider"
import { assertDownloadNotTriggered, getProvider, mockYaml } from "../helpers/providerTestUtil"
import { createMockRequest, createNsisUpdater, trackEvents, writeUpdateConfig } from "../helpers/updaterTestUtil"

const MOCK_PROJECT_ID = 99999999
const STABLE_VERSION = "1.1.0"
const STABLE_TAG = `v${STABLE_VERSION}`
const ASSET_BASE = "https://gitlab.com/-/project/99999999/uploads/abc123"

function mockGitlabRelease(version: string, opts: { name?: string; description?: string; extraLinks?: Array<{ name: string; url: string }> } = {}): GitlabReleaseInfo {
  const tag = `v${version}`
  const links = [
    { id: 1, name: "latest.yml", url: `${ASSET_BASE}/latest.yml`, direct_asset_url: `${ASSET_BASE}/latest.yml`, link_type: "other" },
    {
      id: 2,
      name: `my-app-Setup-${version}.exe`,
      url: `${ASSET_BASE}/my-app-Setup-${version}.exe`,
      direct_asset_url: `${ASSET_BASE}/my-app-Setup-${version}.exe`,
      link_type: "package",
    },
    {
      id: 3,
      name: `my-app-Setup-${version}.exe.blockmap`,
      url: `${ASSET_BASE}/my-app-Setup-${version}.exe.blockmap`,
      direct_asset_url: `${ASSET_BASE}/my-app-Setup-${version}.exe.blockmap`,
      link_type: "other",
    },
    ...(opts.extraLinks || []).map((l, i) => ({ id: 10 + i, name: l.name, url: l.url, direct_asset_url: l.url, link_type: "other" })),
  ]
  return {
    name: opts.name ?? `Release ${tag}`,
    tag_name: tag,
    description: opts.description ?? `Release notes for ${version}`,
    created_at: "2024-01-01T00:00:00Z",
    released_at: "2024-01-01T00:00:00Z",
    upcoming_release: false,
    assets: { count: links.length, sources: [], links },
  }
}

async function createGitlabUpdater(requestSpy: ReturnType<typeof createMockRequest>, version = "0.0.1", options: Partial<GitlabOptions> = {}) {
  const updater = await createNsisUpdater(version)
  // Inject per-test mock executor so concurrent tests never share state
  ;(updater as any).httpExecutor = { request: requestSpy }
  updater.autoDownload = false
  updater.updateConfigPath = await writeUpdateConfig<GitlabOptions>({
    provider: "gitlab",
    projectId: MOCK_PROJECT_ID,
    ...options,
  })
  return updater
}

// Two HTTP calls: permalink/latest API → channel YAML
test("stable release - getLatestVersion fetches API then channel file", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGitlabUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockGitlabRelease(STABLE_VERSION))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  expect(result?.updateInfo.version).toBe(STABLE_VERSION)
  expect(result?.updateInfo).toMatchSnapshot()
})

// First request must go to /projects/{id}/releases/permalink/latest
test("API request URL - uses GitLab releases permalink/latest endpoint", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGitlabUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockGitlabRelease(STABLE_VERSION))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  const firstCallPath = requestSpy.mock.calls[0][0].path as string
  expect(firstCallPath).toContain(`projects/${MOCK_PROJECT_ID}/releases/permalink/latest`)
})

// API returns null/empty → ERR_UPDATER_NO_PUBLISHED_VERSIONS
test("null API response - throws ERR_UPDATER_NO_PUBLISHED_VERSIONS", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGitlabUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(null)

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_NO_PUBLISHED_VERSIONS" })
})

// upcoming_release=true → ERR_UPDATER_LATEST_VERSION_NOT_FOUND (scheduled, not yet published)
test("upcoming release - throws ERR_UPDATER_LATEST_VERSION_NOT_FOUND", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGitlabUpdater(requestSpy)

  const release = mockGitlabRelease(STABLE_VERSION)
  release.upcoming_release = true
  requestSpy.mockResolvedValueOnce(JSON.stringify(release))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_LATEST_VERSION_NOT_FOUND" })
})

// API request failure → ERR_UPDATER_LATEST_VERSION_NOT_FOUND
test("API request failure - throws ERR_UPDATER_LATEST_VERSION_NOT_FOUND", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGitlabUpdater(requestSpy)

  requestSpy.mockRejectedValueOnce(new Error("Network failure"))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_LATEST_VERSION_NOT_FOUND" })
})

// Channel file absent from release assets → ERR_UPDATER_CHANNEL_FILE_NOT_FOUND
test("missing channel file in assets - throws ERR_UPDATER_CHANNEL_FILE_NOT_FOUND", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGitlabUpdater(requestSpy)

  const release = mockGitlabRelease(STABLE_VERSION)
  release.assets.links = release.assets.links.filter(l => l.name !== "latest.yml")

  requestSpy.mockResolvedValueOnce(JSON.stringify(release))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND" })
})

// Channel file asset URL returns 404 → ERR_UPDATER_CHANNEL_FILE_NOT_FOUND
test("channel file 404 - throws ERR_UPDATER_CHANNEL_FILE_NOT_FOUND", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGitlabUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockGitlabRelease(STABLE_VERSION))).mockRejectedValueOnce(new HttpError(404))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND" })
})

// Custom channel not in assets → falls back to default latest.yml
test("custom channel missing in assets - falls back to latest.yml", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGitlabUpdater(requestSpy, "0.0.1", { channel: "beta" })

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockGitlabRelease(STABLE_VERSION))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  expect(result?.updateInfo.version).toBe(STABLE_VERSION)
})

// Private-token auth header sent when options.token is a plain token
test("PRIVATE-TOKEN auth - plain token sent as PRIVATE-TOKEN header", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGitlabUpdater(requestSpy, "0.0.1", { token: "glpat-abc123" })

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockGitlabRelease(STABLE_VERSION))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  const firstCallHeaders = requestSpy.mock.calls[0][0].headers as Record<string, string>
  expect(firstCallHeaders["PRIVATE-TOKEN"]).toBe("glpat-abc123")
  expect(firstCallHeaders["authorization"]).toBeUndefined()

  // Channel YAML download (second request) must also use PRIVATE-TOKEN, not authorization
  const secondCallHeaders = requestSpy.mock.calls[1][0].headers as Record<string, string>
  expect(secondCallHeaders["PRIVATE-TOKEN"]).toBe("glpat-abc123")
  expect(secondCallHeaders["authorization"]).toBeUndefined()
})

// Bearer token sent as authorization header when token starts with "Bearer"
test("Bearer auth - token starting with Bearer sent as authorization header", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGitlabUpdater(requestSpy, "0.0.1", { token: "Bearer gloas-oauth-token" })

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockGitlabRelease(STABLE_VERSION))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  const firstCallHeaders = requestSpy.mock.calls[0][0].headers as Record<string, string>
  expect(firstCallHeaders["authorization"]).toBe("Bearer gloas-oauth-token")
  expect(firstCallHeaders["PRIVATE-TOKEN"]).toBeUndefined()

  // Channel YAML download (second request) must also use authorization, not PRIVATE-TOKEN
  const secondCallHeaders = requestSpy.mock.calls[1][0].headers as Record<string, string>
  expect(secondCallHeaders["authorization"]).toBe("Bearer gloas-oauth-token")
  expect(secondCallHeaders["PRIVATE-TOKEN"]).toBeUndefined()
})

// No token → no auth headers on the release API request
test("no token - no auth headers on API request", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGitlabUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockGitlabRelease(STABLE_VERSION))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  const firstCallHeaders = (requestSpy.mock.calls[0][0].headers as Record<string, string>) ?? {}
  expect(firstCallHeaders["PRIVATE-TOKEN"]).toBeUndefined()
  expect(firstCallHeaders["authorization"]).toBeUndefined()
})

// resolveFiles uses the assets Map populated from GitLab release links
test("resolveFiles - maps file URLs from GitLab release assets", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGitlabUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockGitlabRelease(STABLE_VERSION))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  const provider = getProvider<GitLabProvider>(updater)
  const resolvedFiles = provider.resolveFiles(result?.updateInfo as any)

  expect(resolvedFiles).toHaveLength(1)
  expect(resolvedFiles[0].url.href).toBe(`${ASSET_BASE}/my-app-Setup-${STABLE_VERSION}.exe`)
})

// resolveFiles throws ERR_UPDATER_ASSET_NOT_FOUND when asset is absent from the Map
test("resolveFiles - throws ERR_UPDATER_ASSET_NOT_FOUND for unknown file", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGitlabUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockGitlabRelease(STABLE_VERSION))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()
  const provider = getProvider<GitLabProvider>(updater)

  const updateInfoWithMismatch = {
    version: STABLE_VERSION,
    files: [{ url: "unknown-file.exe", sha512: "abc", size: 100 }],
    path: "unknown-file.exe",
    sha512: "abc",
    releaseDate: "2024-01-01T00:00:00.000Z",
    tag: STABLE_TAG,
    assets: new Map<string, string>(),
  }

  expect(() => provider.resolveFiles(updateInfoWithMismatch as any)).toThrow(expect.objectContaining({ code: "ERR_UPDATER_ASSET_NOT_FOUND" }))
})

// normalizeFilename: underscores in asset names are matched to dashes in YAML file URLs
test("resolveFiles - normalizes underscores in asset names to match YAML filenames", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGitlabUpdater(requestSpy)

  const release = mockGitlabRelease(STABLE_VERSION)
  const exeLink = release.assets.links.find(l => l.name.endsWith(".exe"))!
  exeLink.name = exeLink.name.replace(/-/g, "_")

  requestSpy.mockResolvedValueOnce(JSON.stringify(release)).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  const provider = getProvider<GitLabProvider>(updater)

  const resolvedFiles = provider.resolveFiles(result?.updateInfo as any)
  expect(resolvedFiles).toHaveLength(1)
})

// releaseName pulled from GitLab release when absent from YAML
test("releaseName - populated from GitLab release name when absent from YAML", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGitlabUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockGitlabRelease(STABLE_VERSION, { name: "My App v1.1.0 GA Release" }))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  expect(result?.updateInfo.releaseName).toBe("My App v1.1.0 GA Release")
})

// releaseNotes pulled from GitLab release description when absent from YAML
test("releaseNotes - populated from GitLab release description when absent from YAML", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGitlabUpdater(requestSpy)

  requestSpy
    .mockResolvedValueOnce(JSON.stringify(mockGitlabRelease(STABLE_VERSION, { description: "## What's new\n- Fixed bug X" })))
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  expect(result?.updateInfo.releaseNotes).toBe("## What's new\n- Fixed bug X")
})

// autoDownload=false → downloadPromise null, only checking + available events
test("autoDownload=false - does not trigger download", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGitlabUpdater(requestSpy)
  updater.autoDownload = false

  requestSpy.mockResolvedValueOnce(JSON.stringify(mockGitlabRelease(STABLE_VERSION))).mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const actualEvents = trackEvents(updater)
  const result = await updater.checkForUpdates()

  assertDownloadNotTriggered(expect, result, actualEvents)
})
