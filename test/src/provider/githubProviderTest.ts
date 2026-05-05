import { GithubOptions, HttpError, UpdateInfo } from "builder-util-runtime"
import { GitHubProvider } from "electron-updater/src/providers/GitHubProvider"
import { assertDownloadNotTriggered, getProvider, mockYaml } from "../helpers/providerTestUtil"
import { createMockRequest, createNsisUpdater, trackEvents, writeUpdateConfig } from "../helpers/updaterTestUtil"

const MOCK_OWNER = "test-owner"
const MOCK_REPO = "test-public-repo"
const STABLE_VERSION = "1.1.0"
const STABLE_TAG = `v${STABLE_VERSION}`
const BETA_VERSION = "1.2.0-beta.1"
const BETA_TAG = `v${BETA_VERSION}`

// Atom feed entry href must match /\/tag\/([^/]+)$/ for tag extraction
function mockAtomFeed(entries: Array<{ tag: string; title: string; content?: string }>): string {
  const entryXml = entries
    .map(
      ({ tag, title, content = "" }) => `  <entry>
    <link rel="alternate" type="text/html" href="https://github.com/${MOCK_OWNER}/${MOCK_REPO}/releases/tag/${tag}"/>
    <title>${title}</title>
    <content type="html">${content}</content>
  </entry>`
    )
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en-US">
${entryXml}
</feed>`
}

function mockReleaseJson(tag: string): string {
  return JSON.stringify({ tag_name: tag })
}

async function createPublicUpdater(requestSpy: ReturnType<typeof createMockRequest>, version = "0.0.1") {
  const updater = await createNsisUpdater(version)
  // Inject per-test mock executor so concurrent tests never share state
  ;(updater as any).httpExecutor = { request: requestSpy }
  updater.autoDownload = false
  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: MOCK_OWNER,
    repo: MOCK_REPO,
  })
  return updater
}

// stable flow: feed → releases/latest JSON (getLatestTagName) → latest.yml
test("stable release - checkForUpdates fetches Atom feed and returns correct UpdateInfo", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: STABLE_TAG, content: "Release notes for stable" }]))
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  const info = result?.updateInfo as UpdateInfo & { tag: string }

  expect(info.version).toBe(STABLE_VERSION)
  expect(info.tag).toBe(STABLE_TAG)
  expect(result?.updateInfo).toMatchSnapshot()
})

// allowPrerelease=false always calls getLatestTagName via /releases/latest
test("allowPrerelease=false - uses /releases/latest for tag resolution", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)
  updater.allowPrerelease = false

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: STABLE_TAG }]))
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  // second call must be to /releases/latest for tag_name lookup
  const secondCallPath = requestSpy.mock.calls[1][0].path as string
  expect(secondCallPath).toContain("/releases/latest")
})

// allowPrerelease=true with stable current version: takes first feed entry directly (no getLatestTagName call)
test("allowPrerelease=true with stable current - picks first entry from Atom feed", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "0.0.1")
  updater.allowPrerelease = true

  requestSpy.mockResolvedValueOnce(mockAtomFeed([{ tag: BETA_TAG, title: BETA_TAG, content: "Beta notes" }])).mockResolvedValueOnce(mockYaml(BETA_VERSION))

  const result = await updater.checkForUpdates()

  // only 2 calls: feed + channel file (no getLatestTagName)
  expect(requestSpy).toHaveBeenCalledTimes(2)
  expect((result?.updateInfo as any).tag).toBe(BETA_TAG)
  expect(result?.updateInfo.version).toBe(BETA_VERSION)
})

// allowPrerelease=true with beta channel current: loops feed to find matching beta entry
test("allowPrerelease=true with beta channel current - picks matching beta entry", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "1.0.0-beta.1")
  updater.allowPrerelease = true

  const olderBeta = "v1.0.0-beta.1"
  const newerBeta = "v1.2.0-beta.2"

  requestSpy
    .mockResolvedValueOnce(
      mockAtomFeed([
        { tag: newerBeta, title: newerBeta, content: "Newer beta notes" },
        { tag: olderBeta, title: olderBeta, content: "Older beta notes" },
      ])
    )
    .mockResolvedValueOnce(mockYaml("1.2.0-beta.2"))

  const result = await updater.checkForUpdates()
  expect((result?.updateInfo as any).tag).toBe(newerBeta)
  expect(result?.updateInfo.version).toBe("1.2.0-beta.2")
})

// allowPrerelease=true: beta.yml 404 → falls back to latest.yml without error
test("allowPrerelease=true - falls back to latest.yml when channel file not found", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "0.0.1")
  updater.allowPrerelease = true

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: BETA_TAG, title: BETA_TAG }]))
    .mockRejectedValueOnce(new HttpError(404)) // beta.yml not found
    .mockResolvedValueOnce(mockYaml(BETA_VERSION)) // fallback to latest.yml succeeds

  const result = await updater.checkForUpdates()
  expect(result?.updateInfo.version).toBe(BETA_VERSION)
})

// allowPrerelease=true with custom channel current + only nightly entries → no match → ERR_UPDATER_NO_PUBLISHED_VERSIONS
test("allowPrerelease=true - no matching channel entry throws ERR_UPDATER_NO_PUBLISHED_VERSIONS", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "1.0.0-beta.1")
  updater.allowPrerelease = true

  // nightly entries are "custom" channels, skipped when current is beta
  requestSpy.mockResolvedValueOnce(mockAtomFeed([{ tag: "v2.0.0-nightly.1", title: "v2.0.0-nightly.1" }]))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_NO_PUBLISHED_VERSIONS" })
})

// allowPrerelease=false: channel file 404 → ERR_UPDATER_CHANNEL_FILE_NOT_FOUND (no fallback)
test("stable mode - channel file 404 throws ERR_UPDATER_CHANNEL_FILE_NOT_FOUND", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)
  updater.allowPrerelease = false

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: STABLE_TAG }]))
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockRejectedValueOnce(new HttpError(404))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND" })
})

// getLatestTagName failure is wrapped in ERR_UPDATER_INVALID_RELEASE_FEED by outer try-catch
test("getLatestTagName failure - throws ERR_UPDATER_INVALID_RELEASE_FEED", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)
  updater.allowPrerelease = false

  requestSpy.mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: STABLE_TAG }])).mockRejectedValueOnce(new Error("Connection refused"))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_INVALID_RELEASE_FEED" })
})

// Atom feed with no entries → element("entry") throws → ERR_XML_MISSED_ELEMENT bubbles out
test("empty Atom feed - throws ERR_XML_MISSED_ELEMENT", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en-US">
</feed>`)

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_XML_MISSED_ELEMENT" })
})

// resolveFiles constructs the GitHub download URL using the tag from the feed
test("resolveFiles - constructs download URL with tag in path", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: STABLE_TAG }]))
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  const provider = getProvider<GitHubProvider>(updater)
  const updateInfo = result?.updateInfo as UpdateInfo & { tag: string }

  const resolvedFiles = provider.resolveFiles(updateInfo)
  expect(resolvedFiles).toHaveLength(1)
  expect(resolvedFiles[0].url.href).toContain(`/releases/download/${STABLE_TAG}/`)
  expect(resolvedFiles[0].url.href).toContain(`my-app-Setup-${STABLE_VERSION}.exe`)
})

// fullChangelog=true → releaseNotes is an array of ReleaseNoteInfo sorted descending
test("fullChangelog=true - releaseNotes returned as sorted ReleaseNoteInfo array", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "1.0.0")
  updater.fullChangelog = true

  requestSpy
    .mockResolvedValueOnce(
      mockAtomFeed([
        { tag: "v1.2.0", title: "v1.2.0", content: "Notes for 1.2.0" },
        { tag: "v1.1.0", title: "v1.1.0", content: "Notes for 1.1.0" },
      ])
    )
    .mockResolvedValueOnce(mockReleaseJson("v1.2.0"))
    .mockResolvedValueOnce(mockYaml("1.2.0"))

  const result = await updater.checkForUpdates()
  const notes = result?.updateInfo.releaseNotes

  expect(Array.isArray(notes)).toBe(true)
  const noteArray = notes as Array<{ version: string; note: string }>
  expect(noteArray[0].version).toBe("1.2.0")
  expect(noteArray[1].version).toBe("1.1.0")
})

// releaseName is pulled from the feed <title> when absent from the YAML
test("releaseName - populated from Atom feed entry title", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: "My App 1.1.0 Release" }]))
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  expect(result?.updateInfo.releaseName).toBe("My App 1.1.0 Release")
})

// autoDownload=false → downloadPromise is null, only checking-for-update + update-available events
test("autoDownload=false - checkForUpdates does not trigger download", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)
  updater.autoDownload = false

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: STABLE_TAG }]))
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const actualEvents = trackEvents(updater)
  const result = await updater.checkForUpdates()

  assertDownloadNotTriggered(expect, result, actualEvents)
})

// enterprise host: getLatestTagName must use /api/v3 API endpoint instead of HTML releases/latest
test("enterprise GitHub host - getLatestTagName uses /api/v3 API endpoint", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createNsisUpdater()
  // Inject per-test mock before setting updateConfigPath (which resets clientPromise)
  ;(updater as any).httpExecutor = { request: requestSpy }
  updater.autoDownload = false
  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: MOCK_OWNER,
    repo: MOCK_REPO,
    host: "github.mycompany.com",
  })

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: STABLE_TAG }]))
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  // second call (getLatestTagName) must go to /api/v3/repos/... for enterprise hosts
  const secondCallPath = requestSpy.mock.calls[1][0].path as string
  expect(secondCallPath).toMatch(/^\/api\/v3\/repos\//)
})

// getBlockMapFiles returns old/new blockmap URLs using the default Provider strategy
test("getBlockMapFiles - constructs correct blockmap URLs from base URL", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: STABLE_TAG }]))
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()
  const provider = getProvider<GitHubProvider>(updater)

  const baseUrl = new URL(`https://github.com/${MOCK_OWNER}/${MOCK_REPO}/releases/download/${STABLE_TAG}/my-app-Setup-${STABLE_VERSION}.exe`)
  const blockMapUrls = provider.getBlockMapFiles(baseUrl, "1.0.0", STABLE_VERSION) as URL[]

  expect(blockMapUrls).toHaveLength(2)
  expect(blockMapUrls[0].href).toContain("my-app-Setup-1.0.0.exe.blockmap")
  expect(blockMapUrls[1].href).toContain(`my-app-Setup-${STABLE_VERSION}.exe.blockmap`)
})
