import { GithubOptions, HttpError, UpdateInfo } from "builder-util-runtime"
import { GitHubProvider } from "electron-updater/internal"
import { vi } from "vitest"
import { assertDownloadNotTriggered, getProvider, mockYaml } from "../helpers/providerTestUtil.js"
import { createMockRequest, createNsisUpdater, trackEvents, writeUpdateConfig } from "../helpers/updaterTestUtil.js"

const MOCK_OWNER = "test-owner"
const MOCK_REPO = "test-public-repo"
const STABLE_VERSION = "1.1.0"
const STABLE_TAG = `v${STABLE_VERSION}`
const BETA_VERSION = "1.2.0-beta.1"
const BETA_TAG = `v${BETA_VERSION}`

// Atom feed entry href must match /\/tag\/([^/]+)$/ for tag extraction.
// `href` overrides the generated link href; `href: null` omits the <link> element entirely.
function mockAtomFeed(entries: Array<{ tag: string; title: string; content?: string; href?: string | null }>): string {
  const entryXml = entries
    .map(
      ({ tag, title, content = "", href }) => `  <entry>
${href === null ? "" : `    <link rel="alternate" type="text/html" href="${href ?? `https://github.com/${MOCK_OWNER}/${MOCK_REPO}/releases/tag/${tag}`}"/>\n`}    <title>${title}</title>
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

async function createPublicUpdater(requestSpy: ReturnType<typeof createMockRequest>, version = "0.0.1", extraOptions: Partial<GithubOptions> = {}) {
  const updater = await createNsisUpdater(version)
  // Inject per-test mock executor so concurrent tests never share state
  ;(updater as any).httpExecutor = { request: requestSpy }
  updater.autoDownload = false
  updater.updateConfigPath = await writeUpdateConfig<GithubOptions>({
    provider: "github",
    owner: MOCK_OWNER,
    repo: MOCK_REPO,
    ...extraOptions,
  })
  return updater
}

const RELEASES_PATH = `/${MOCK_OWNER}/${MOCK_REPO}/releases`

function requestedPaths(requestSpy: ReturnType<typeof createMockRequest>): Array<string> {
  return requestSpy.mock.calls.map(call => call[0].path as string)
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

// allowPrerelease=true with stable current version: takes the newest available stable or prerelease version (prerelease in this case)
test("allowPrerelease=true with stable current - picks the newest available valid release (the beta release in this case)", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "0.0.1")
  updater.allowPrerelease = true

  requestSpy
    .mockResolvedValueOnce(
      mockAtomFeed([
        { tag: "some-package@2.2.0", title: "Some Package v2.2.0", content: "Some Package notes" },
        { tag: BETA_TAG, title: BETA_TAG, content: "Beta notes" },
      ])
    )
    .mockResolvedValueOnce(mockYaml(BETA_VERSION))

  const result = await updater.checkForUpdates()

  // only 2 calls: feed + channel file (no getLatestTagName)
  expect(requestSpy).toHaveBeenCalledTimes(2)
  expect((result!.updateInfo as any).tag).toBe(BETA_TAG)
  expect(result?.updateInfo.version).toBe(BETA_VERSION)
})

// allowPrerelease=true with stable current version: takes the newest available stable or prerelease version (stable in this case)
test("allowPrerelease=true with stable current - picks the newest available valid release (the stable 5.1.0 release in this case)", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "5.0.0")
  updater.allowPrerelease = true

  const newVersion = "5.1.0"
  const newVersionTag = `v${newVersion}`

  requestSpy
    .mockResolvedValueOnce(
      mockAtomFeed([
        { tag: "some-tool@3.2.0", title: "Some Tool v3.2.0", content: "Some Tool notes" },
        { tag: newVersionTag, title: newVersionTag, content: "New stable release notes" },
      ])
    )
    .mockResolvedValueOnce(mockYaml("5.1.0"))

  const result = await updater.checkForUpdates()

  // only 2 calls: feed + channel file (no getLatestTagName)
  expect(requestSpy).toHaveBeenCalledTimes(2)
  expect((result!.updateInfo as any).tag).toBe(newVersionTag)
  expect(result?.updateInfo.version).toBe(newVersion)
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
  expect((result!.updateInfo as any).tag).toBe(newerBeta)
  expect(result?.updateInfo.version).toBe("1.2.0-beta.2")
})

// regression for #10287: the Atom feed is ordered by publication date, so a stable hotfix published after a
// pre-release comes first. A beta client must still be offered the newer pre-release, not the (lower) hotfix.
test.for([
  { name: "channel derived from current version", channel: undefined },
  { name: 'explicit channel = "beta"', channel: "beta" },
])("allowPrerelease=true with beta channel current - picks the highest pre-release when a lower stable hotfix was published after it ($name)", async ({ channel }, { expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "1.1.0-beta.3")
  if (channel != null) {
    // the channel setter also enables allowPrerelease (and allowDowngrade)
    updater.channel = channel
  }
  updater.allowPrerelease = true

  // newest-first by publication date, as GitHub serves releases.atom
  requestSpy
    .mockResolvedValueOnce(
      mockAtomFeed([
        { tag: "v1.0.4", title: "v1.0.4", content: "Stable hotfix notes" },
        { tag: "v1.1.0-beta.4", title: "v1.1.0-beta.4", content: "Beta 4 notes" },
        { tag: "v1.1.0-beta.3", title: "v1.1.0-beta.3", content: "Beta 3 notes" },
      ])
    )
    .mockResolvedValueOnce(mockYaml("1.1.0-beta.4"))

  const result = await updater.checkForUpdates()
  expect((result!.updateInfo as any).tag).toBe("v1.1.0-beta.4")
  expect(result?.updateInfo.version).toBe("1.1.0-beta.4")
  expect(result?.isUpdateAvailable).toBe(true)
  expect(requestSpy.mock.calls[1][0].path as string).toContain("/download/v1.1.0-beta.4/")
})

// counterpart of #10287: a beta client still moves on to a stable release when it is the highest eligible version,
// even when a lower stable hotfix was published after it
test("allowPrerelease=true with beta channel current - picks a higher stable release over a later-published lower hotfix", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "1.1.0-beta.4")
  updater.allowPrerelease = true

  requestSpy
    .mockResolvedValueOnce(
      mockAtomFeed([
        { tag: "v1.0.5", title: "v1.0.5", content: "Stable hotfix notes" },
        { tag: "v1.1.0", title: "v1.1.0", content: "Stable 1.1.0 notes" },
        { tag: "v1.1.0-beta.4", title: "v1.1.0-beta.4", content: "Beta 4 notes" },
      ])
    )
    .mockResolvedValueOnce(mockYaml("1.1.0"))

  const result = await updater.checkForUpdates()
  expect((result!.updateInfo as any).tag).toBe("v1.1.0")
  expect(result?.updateInfo.version).toBe("1.1.0")
  expect(result?.isUpdateAvailable).toBe(true)
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

// allowPrerelease=true, no channel: feed has only non-semver tags (e.g. monorepo package releases)
// → no valid release to offer → ERR_UPDATER_NO_PUBLISHED_VERSIONS
test("allowPrerelease=true with only non-semver feed entries - throws ERR_UPDATER_NO_PUBLISHED_VERSIONS", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "0.0.1")
  updater.allowPrerelease = true

  requestSpy.mockResolvedValueOnce(
    mockAtomFeed([
      { tag: "some-package@1.2.3", title: "some-package@1.2.3" },
      { tag: "other-tool@4.5.6", title: "other-tool@4.5.6" },
    ])
  )

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_NO_PUBLISHED_VERSIONS" })
})

// allowPrerelease=true, no channel, stable current NEWER than every release: the newest valid release
// is still selected and AppUpdater reports no update gracefully (no throw, no spurious downgrade offer)
test("allowPrerelease=true with stable current newer than all releases - reports no update gracefully", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "2.0.0")
  updater.allowPrerelease = true

  requestSpy
    .mockResolvedValueOnce(
      mockAtomFeed([
        { tag: "v1.0.0", title: "v1.0.0" },
        { tag: BETA_TAG, title: BETA_TAG }, // newest valid release, but still older than current 2.0.0
      ])
    )
    .mockResolvedValueOnce(mockYaml(BETA_VERSION))

  // listen to a superset of outcomes so the assertion also proves no `error`/`update-available` fired
  const events: Array<string> = []
  for (const eventName of ["checking-for-update", "update-available", "update-not-available", "error"] as const) {
    updater.addListener(eventName, () => events.push(eventName))
  }

  const result = await updater.checkForUpdates()
  expect(result?.isUpdateAvailable).toBe(false)
  expect((result!.updateInfo as any).tag).toBe(BETA_TAG)
  // newest available release is older than current → AppUpdater takes the graceful no-update path
  expect(events).toEqual(["checking-for-update", "update-not-available"])
})

// allowPrerelease=false: the latest tag (from /releases/latest) is absent from the truncated Atom feed
// → the update still resolves using the API tag (regression for monorepos where the latest release is
// pushed past the ~10 most recent feed entries; previously threw ERR_UPDATER_NO_PUBLISHED_VERSIONS)
test("allowPrerelease=false - resolves update when latest tag is missing from the Atom feed", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)
  updater.allowPrerelease = false

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: "other-package@9.9.9", title: "Unrelated 9.9.9" }])) // feed does NOT contain STABLE_TAG
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG)) // /releases/latest returns the real latest tag
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  // positive counterpart of the graceful path: a resolvable update must reach `update-available`, not `error`
  const events: Array<string> = []
  for (const eventName of ["checking-for-update", "update-available", "update-not-available", "error"] as const) {
    updater.addListener(eventName, () => events.push(eventName))
  }

  const result = await updater.checkForUpdates()
  const info = result?.updateInfo as UpdateInfo & { tag: string }
  expect(info.tag).toBe(STABLE_TAG)
  expect(info.version).toBe(STABLE_VERSION)
  expect(events).toEqual(["checking-for-update", "update-available"])
})

// security: a path-traversal tag (e.g. from a malicious/compromised GitHub Enterprise /releases/latest
// response) must not be interpolated into the download URL
test("path-traversal tag - throws ERR_UPDATER_INVALID_TAG instead of building a traversing download URL", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)
  updater.allowPrerelease = false

  requestSpy.mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: STABLE_TAG }])).mockResolvedValueOnce(mockReleaseJson("../../../../evil/repo/releases/download/v1.0.0"))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_INVALID_TAG" })
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

// ---------------------------------------------------------------------------
// getLatestVersion path coverage (characterization of release selection, requested URLs, errors and notes)
// ---------------------------------------------------------------------------

test("Atom feed request - fetches releases.atom with the XML accept header", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: STABLE_TAG }]))
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  const feedRequest = requestSpy.mock.calls[0][0]
  expect(feedRequest.hostname).toBe("github.com")
  expect(feedRequest.path).toBe(`${RELEASES_PATH}.atom`)
  expect(feedRequest.headers).toMatchObject({ accept: "application/xml, application/atom+xml, text/xml, */*" })
})

test("empty Atom feed - error message names the missing entries", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)

  requestSpy.mockResolvedValueOnce(mockAtomFeed([]))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_XML_MISSED_ELEMENT", message: "No releases in the GitHub Atom feed" })
  expect(requestSpy).toHaveBeenCalledTimes(1)
})

// --- allowPrerelease=false: tag from /releases/latest, release entry looked up in the feed ---

test("allowPrerelease=false - requests feed, /releases/latest (JSON) and latest.yml under the tag download path", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)
  updater.allowPrerelease = false

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: STABLE_TAG }]))
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  expect(requestedPaths(requestSpy)).toEqual([`${RELEASES_PATH}.atom`, `${RELEASES_PATH}/latest`, `${RELEASES_PATH}/download/${STABLE_TAG}/latest.yml`])
  expect(requestSpy.mock.calls[1][0].headers).toMatchObject({ Accept: "application/json" })
})

test("allowPrerelease=false - api.github.com host queries /repos/.../releases/latest without the /api/v3 prefix", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "0.0.1", { host: "api.github.com" })
  updater.allowPrerelease = false

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: STABLE_TAG }]))
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()

  expect(requestSpy.mock.calls[1][0].hostname).toBe("api.github.com")
  expect(requestSpy.mock.calls[1][0].path).toBe(`/repos/${MOCK_OWNER}/${MOCK_REPO}/releases/latest`)
})

test.for([
  { name: "empty response body", response: null },
  { name: "JSON without tag_name", response: JSON.stringify({ name: "no tag" }) },
])("allowPrerelease=false - /releases/latest with $name throws ERR_UPDATER_NO_PUBLISHED_VERSIONS", async ({ response }, { expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)
  updater.allowPrerelease = false

  requestSpy.mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: STABLE_TAG }])).mockResolvedValueOnce(response)

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_NO_PUBLISHED_VERSIONS", message: "No published versions on GitHub" })
  expect(requestSpy).toHaveBeenCalledTimes(2)
})

test.for([
  { name: "request failure", mock: (spy: ReturnType<typeof createMockRequest>) => spy.mockRejectedValueOnce(new Error("Connection refused")), detail: "Connection refused" },
  { name: "invalid JSON", mock: (spy: ReturnType<typeof createMockRequest>) => spy.mockResolvedValueOnce("not json"), detail: "JSON" },
])('allowPrerelease=false - /releases/latest $name is wrapped as "Unable to find latest version" inside ERR_UPDATER_INVALID_RELEASE_FEED', async ({ mock, detail }, { expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)
  updater.allowPrerelease = false

  requestSpy.mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: STABLE_TAG }]))
  mock(requestSpy)

  const error = await updater.checkForUpdates().then(
    () => null,
    (e: any) => e
  )
  expect(error?.code).toBe("ERR_UPDATER_INVALID_RELEASE_FEED")
  expect(error?.message).toContain(
    `Cannot parse releases feed: Error: Unable to find latest version on GitHub (https://github.com${RELEASES_PATH}/latest), please ensure a production release exists: `
  )
  expect(error?.message).toContain(detail)
  expect(error?.message).toContain(`,\nXML:\n<?xml`)
})

test("allowPrerelease=false - takes name/notes from the first feed entry whose tag exactly matches, skipping malformed and other tags", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)
  updater.allowPrerelease = false

  requestSpy
    .mockResolvedValueOnce(
      mockAtomFeed([
        { tag: "unused", title: "Malformed href", content: "malformed", href: `https://github.com/${MOCK_OWNER}/${MOCK_REPO}/releases` },
        { tag: "v2.0.0", title: "Newer but not latest", content: "newer" },
        { tag: STABLE_VERSION, title: "Unprefixed tag", content: "unprefixed" },
        { tag: STABLE_TAG, title: "First match", content: "first match notes" },
        { tag: STABLE_TAG, title: "Duplicate match", content: "duplicate notes" },
      ])
    )
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  expect((result!.updateInfo as any).tag).toBe(STABLE_TAG)
  expect(result?.updateInfo.releaseName).toBe("First match")
  expect(result?.updateInfo.releaseNotes).toBe("first match notes")
})

test.for([
  { name: "before the matching entry → ERR_UPDATER_INVALID_RELEASE_FEED", linkless: "before", code: "ERR_UPDATER_INVALID_RELEASE_FEED" },
  { name: "after the matching entry → not inspected", linkless: "after", code: null },
])("allowPrerelease=false - feed entry without <link> $name", async ({ linkless, code }, { expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)
  updater.allowPrerelease = false

  const broken = { tag: "unused", title: "No link", href: null }
  const match = { tag: STABLE_TAG, title: STABLE_TAG }
  requestSpy
    .mockResolvedValueOnce(mockAtomFeed(linkless === "before" ? [broken, match] : [match, broken]))
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  if (code == null) {
    const result = await updater.checkForUpdates()
    expect(result?.updateInfo.releaseName).toBe(STABLE_TAG)
  } else {
    await expect(updater.checkForUpdates()).rejects.toMatchObject({ code, message: expect.stringContaining('No element "link"') })
  }
})

test("allowPrerelease=false - latest tag missing from the Atom feed leaves releaseName/releaseNotes unset", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)
  updater.allowPrerelease = false

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: "v1.0.0", title: "Older", content: "older notes" }]))
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  expect((result!.updateInfo as any).tag).toBe(STABLE_TAG)
  expect(result?.updateInfo.releaseName).toBeUndefined()
  expect(result?.updateInfo.releaseNotes).toBeUndefined()
})

test("allowPrerelease=false - a pre-release tag from /releases/latest still fetches the default channel file", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)
  updater.allowPrerelease = false

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: BETA_TAG, title: BETA_TAG }]))
    .mockResolvedValueOnce(mockReleaseJson(BETA_TAG))
    .mockResolvedValueOnce(mockYaml(BETA_VERSION))

  const result = await updater.checkForUpdates()
  expect((result!.updateInfo as any).tag).toBe(BETA_TAG)
  expect(requestedPaths(requestSpy)[2]).toBe(`${RELEASES_PATH}/download/${BETA_TAG}/latest.yml`)
})

test.for([
  { name: "app-update.yml channel option", configChannel: "beta", updaterChannel: undefined },
  { name: "updater.channel", configChannel: undefined, updaterChannel: "beta" },
])("allowPrerelease=false - channel file name comes from the $name", async ({ configChannel, updaterChannel }, { expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "0.0.1", configChannel == null ? {} : { channel: configChannel })
  if (updaterChannel != null) {
    updater.channel = updaterChannel
  }
  updater.allowPrerelease = false

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: STABLE_TAG }]))
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  await updater.checkForUpdates()
  expect(requestedPaths(requestSpy)[2]).toBe(`${RELEASES_PATH}/download/${STABLE_TAG}/beta.yml`)
})

test("allowPrerelease=false - non-404 channel file error is rethrown as-is without fallback", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)
  updater.allowPrerelease = false

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: STABLE_TAG }]))
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockRejectedValueOnce(new HttpError(500))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ statusCode: 500 })
  expect(requestSpy).toHaveBeenCalledTimes(3)
})

test("allowPrerelease=false - channel file 404 error message names the file and URL", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)
  updater.allowPrerelease = false

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: STABLE_TAG }]))
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockRejectedValueOnce(new HttpError(404))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({
    code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND",
    message: expect.stringContaining(`Cannot find latest.yml in the latest release artifacts (https://github.com${RELEASES_PATH}/download/${STABLE_TAG}/latest.yml): `),
  })
})

// --- allowPrerelease=true, no channel (stable current version): highest semver tag of any kind ---

test("allowPrerelease=true with stable current - skips hrefs without a /tag/ segment", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "1.0.0")
  updater.allowPrerelease = true

  requestSpy
    .mockResolvedValueOnce(
      mockAtomFeed([
        { tag: "unused", title: "Malformed", href: `https://github.com/${MOCK_OWNER}/${MOCK_REPO}/releases/v9.0.0` },
        { tag: "unused", title: "Trailing slash", href: `https://github.com/${MOCK_OWNER}/${MOCK_REPO}/releases/tag/v8.0.0/` },
        { tag: STABLE_TAG, title: STABLE_TAG, content: "Stable notes" },
      ])
    )
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  expect((result!.updateInfo as any).tag).toBe(STABLE_TAG)
  expect(result?.updateInfo.releaseNotes).toBe("Stable notes")
})

test.for([
  { name: "stable current (no channel)", version: "1.0.0" },
  { name: "beta current", version: "1.0.0-beta.1" },
])("allowPrerelease=true with $name - feed entry without <link> throws ERR_UPDATER_INVALID_RELEASE_FEED", async ({ version }, { expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, version)
  updater.allowPrerelease = true

  requestSpy.mockResolvedValueOnce(
    mockAtomFeed([
      { tag: BETA_TAG, title: BETA_TAG },
      { tag: "unused", title: "No link", href: null },
    ])
  )

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_INVALID_RELEASE_FEED", message: expect.stringContaining('No element "link"') })
})

test.for([
  { name: "unprefixed first", feed: ["1.2.0", "v1.2.0"], expected: "1.2.0" },
  { name: "prefixed first", feed: ["v1.2.0", "1.2.0"], expected: "v1.2.0" },
])("allowPrerelease=true with stable current - equal versions keep the earlier feed entry ($name)", async ({ feed, expected }, { expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "1.0.0")
  updater.allowPrerelease = true

  requestSpy.mockResolvedValueOnce(mockAtomFeed(feed.map(tag => ({ tag, title: `title ${tag}` })))).mockResolvedValueOnce(mockYaml("1.2.0"))

  const result = await updater.checkForUpdates()
  expect((result!.updateInfo as any).tag).toBe(expected)
  expect(result?.updateInfo.releaseName).toBe(`title ${expected}`)
})

test("allowPrerelease=true with stable current - a custom-channel pre-release can be the newest, and its channel file is requested", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "1.0.0")
  updater.allowPrerelease = true

  requestSpy
    .mockResolvedValueOnce(
      mockAtomFeed([
        { tag: "v1.5.0", title: "v1.5.0" },
        { tag: "v2.0.0-nightly.1", title: "v2.0.0-nightly.1" },
        { tag: BETA_TAG, title: BETA_TAG },
      ])
    )
    .mockResolvedValueOnce(mockYaml("2.0.0-nightly.1"))

  const result = await updater.checkForUpdates()
  expect((result!.updateInfo as any).tag).toBe("v2.0.0-nightly.1")
  expect(requestedPaths(requestSpy)).toEqual([`${RELEASES_PATH}.atom`, `${RELEASES_PATH}/download/v2.0.0-nightly.1/nightly.yml`])
})

test("allowPrerelease=true with stable current - app-update.yml channel does not restrict selection but names the channel file for a stable tag", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "1.0.0", { channel: "beta" })
  updater.allowPrerelease = true

  requestSpy
    .mockResolvedValueOnce(
      mockAtomFeed([
        { tag: "v1.3.0", title: "v1.3.0" },
        { tag: BETA_TAG, title: BETA_TAG },
      ])
    )
    .mockResolvedValueOnce(mockYaml("1.3.0"))

  const result = await updater.checkForUpdates()
  expect((result!.updateInfo as any).tag).toBe("v1.3.0")
  expect(requestedPaths(requestSpy)[1]).toBe(`${RELEASES_PATH}/download/v1.3.0/beta.yml`)
})

// --- allowPrerelease=true with a channel (derived from the current version or set explicitly) ---

test.for([
  {
    name: "alpha current may move up to beta",
    version: "1.0.0-alpha.1",
    feed: ["v1.0.0-alpha.3", "v1.0.0-beta.2", "v2.0.0-nightly.1", "v0.9.0"],
    expectedTag: "v1.0.0-beta.2",
    expectedFile: "beta.yml",
  },
  {
    name: "alpha current picks a higher stable release",
    version: "1.0.0-alpha.1",
    feed: ["v1.0.0-alpha.3", "v1.0.0", "v1.0.0-beta.2"],
    expectedTag: "v1.0.0",
    expectedFile: "latest.yml",
  },
  {
    name: "alpha current picks the highest alpha",
    version: "1.0.0-alpha.1",
    feed: ["v1.0.0-alpha.2", "v1.0.0-alpha.10", "v0.9.0", "v3.0.0-rc.1"],
    expectedTag: "v1.0.0-alpha.10",
    expectedFile: "alpha.yml",
  },
  {
    name: "beta current never moves down to alpha, even a higher one",
    version: "1.0.0-beta.1",
    feed: ["v1.1.0-alpha.1", "v1.0.0-beta.2"],
    expectedTag: "v1.0.0-beta.2",
    expectedFile: "beta.yml",
  },
  {
    name: "beta current skips custom channels and non-semver tags",
    version: "1.0.0-beta.1",
    feed: ["v9.0.0-nightly.1", "some-package@5.0.0", "v1.0.0-beta.2", "v1.0.0-rc.1"],
    expectedTag: "v1.0.0-beta.2",
    expectedFile: "beta.yml",
  },
  {
    name: "custom channel current only matches its own channel",
    version: "1.0.0-nightly.1",
    feed: ["v3.0.0", "v2.0.0-beta.1", "v2.0.0-alpha.1", "v2.0.0-canary.1", "v1.1.0-nightly.2", "v1.0.0-nightly.5"],
    expectedTag: "v1.1.0-nightly.2",
    expectedFile: "nightly.yml",
  },
  {
    name: "numeric pre-release current (1.0.0-1) matches the same numeric identifier only",
    version: "1.0.0-1",
    feed: ["v1.0.0-2", "v1.0.0-1.1", "v2.0.0"],
    expectedTag: "v1.0.0-1.1",
    expectedFile: "1.yml",
  },
  {
    name: "a 0 pre-release identifier (v1.0.0-0) is treated like a stable tag",
    version: "1.0.0-beta.1",
    feed: ["v1.0.0-0", "v0.9.0"],
    expectedTag: "v1.0.0-0",
    expectedFile: "latest.yml",
  },
])("allowPrerelease=true channel selection - $name", async ({ version, feed, expectedTag, expectedFile }, { expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, version)
  updater.allowPrerelease = true

  requestSpy.mockResolvedValueOnce(mockAtomFeed(feed.map(tag => ({ tag, title: tag, content: `notes ${tag}` })))).mockResolvedValueOnce(mockYaml(expectedTag.slice(1)))

  const result = await updater.checkForUpdates()
  expect((result!.updateInfo as any).tag).toBe(expectedTag)
  expect(result?.updateInfo.releaseName).toBe(expectedTag)
  expect(result?.updateInfo.releaseNotes).toBe(`notes ${expectedTag}`)
  expect(requestedPaths(requestSpy)).toEqual([`${RELEASES_PATH}.atom`, `${RELEASES_PATH}/download/${expectedTag}/${expectedFile}`])
})

test.for([
  { name: "custom channel current with no matching release", version: "1.0.0-nightly.1", channel: undefined, feed: ["v2.0.0", "v2.0.0-beta.1", "v2.0.0-canary.1"] },
  { name: "beta current with only alpha releases", version: "1.0.0-beta.1", channel: undefined, feed: ["v1.1.0-alpha.1"] },
  // explicit channel "latest" is treated as a custom pre-release channel: stable tags are not eligible
  { name: 'explicit channel = "latest" with only stable releases', version: "1.0.0", channel: "latest", feed: ["v1.1.0", "v1.2.0"] },
])("allowPrerelease=true - $name throws ERR_UPDATER_NO_PUBLISHED_VERSIONS", async ({ version, channel, feed }, { expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, version)
  if (channel != null) {
    updater.channel = channel
  }
  updater.allowPrerelease = true

  requestSpy.mockResolvedValueOnce(mockAtomFeed(feed.map(tag => ({ tag, title: tag }))))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_NO_PUBLISHED_VERSIONS", message: "No published versions on GitHub" })
  expect(requestSpy).toHaveBeenCalledTimes(1)
})

test('allowPrerelease=true - explicit channel = "alpha" overrides the beta channel derived from the current version', async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "1.0.0-beta.1")
  updater.channel = "alpha"
  updater.allowPrerelease = true

  requestSpy
    .mockResolvedValueOnce(
      mockAtomFeed([
        { tag: "v1.0.0-beta.2", title: "v1.0.0-beta.2" },
        { tag: "v1.1.0-alpha.1", title: "v1.1.0-alpha.1" },
      ])
    )
    .mockResolvedValueOnce(mockYaml("1.1.0-alpha.1"))

  const result = await updater.checkForUpdates()
  expect((result!.updateInfo as any).tag).toBe("v1.1.0-alpha.1")
  expect(requestedPaths(requestSpy)[1]).toBe(`${RELEASES_PATH}/download/v1.1.0-alpha.1/alpha.yml`)
})

test('allowPrerelease=true with stable current and explicit channel = "beta" - skips custom channels; a stable tag uses beta.yml', async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "1.0.0")
  updater.channel = "beta"
  updater.allowPrerelease = true

  requestSpy
    .mockResolvedValueOnce(
      mockAtomFeed([
        { tag: "v2.0.0-nightly.1", title: "v2.0.0-nightly.1" },
        { tag: "v1.3.0", title: "v1.3.0" },
        { tag: BETA_TAG, title: BETA_TAG },
      ])
    )
    .mockResolvedValueOnce(mockYaml("1.3.0"))

  const result = await updater.checkForUpdates()
  expect((result!.updateInfo as any).tag).toBe("v1.3.0")
  expect(requestedPaths(requestSpy)[1]).toBe(`${RELEASES_PATH}/download/v1.3.0/beta.yml`)
})

// --- allowPrerelease=true channel file fallback ---

test.for([
  { name: "404", error: () => new HttpError(404) },
  { name: "non-404 HTTP error", error: () => new HttpError(500) },
  { name: "network error", error: () => new Error("socket hang up") },
])("allowPrerelease=true - any channel file error ($name) falls back to latest.yml of the same tag", async ({ error }, { expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "1.0.0")
  updater.allowPrerelease = true

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: BETA_TAG, title: BETA_TAG }]))
    .mockRejectedValueOnce(error())
    .mockResolvedValueOnce(mockYaml(BETA_VERSION))

  const result = await updater.checkForUpdates()
  expect(result?.updateInfo.version).toBe(BETA_VERSION)
  expect(requestedPaths(requestSpy)).toEqual([`${RELEASES_PATH}.atom`, `${RELEASES_PATH}/download/${BETA_TAG}/beta.yml`, `${RELEASES_PATH}/download/${BETA_TAG}/latest.yml`])
})

test("allowPrerelease=true - fallback latest.yml 404 throws ERR_UPDATER_CHANNEL_FILE_NOT_FOUND for latest.yml", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "1.0.0")
  updater.allowPrerelease = true

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: BETA_TAG, title: BETA_TAG }]))
    .mockRejectedValueOnce(new HttpError(404))
    .mockRejectedValueOnce(new HttpError(404))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({
    code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND",
    message: expect.stringContaining(`Cannot find latest.yml in the latest release artifacts (https://github.com${RELEASES_PATH}/download/${BETA_TAG}/latest.yml): `),
  })
})

test("allowPrerelease=true - unparseable fallback channel file is reported against latest.yml", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "1.0.0")
  updater.allowPrerelease = true

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: BETA_TAG, title: BETA_TAG }]))
    .mockRejectedValueOnce(new HttpError(404))
    .mockResolvedValueOnce(null)

  await expect(updater.checkForUpdates()).rejects.toMatchObject({
    code: "ERR_UPDATER_INVALID_UPDATE_INFO",
    message: `Cannot parse update info from latest.yml in the latest release artifacts (https://github.com${RELEASES_PATH}/download/${BETA_TAG}/latest.yml): rawData: null`,
  })
})

test("linux platform - channel file names carry the platform/arch suffix, including the fallback", async ({ expect }) => {
  vi.stubEnv("TEST_UPDATER_ARCH", "arm64")
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "1.0.0")
  ;(updater as any)._testOnlyOptions = { ...(updater as any)._testOnlyOptions, platform: "linux" }
  updater.allowPrerelease = true

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: BETA_TAG, title: BETA_TAG }]))
    .mockRejectedValueOnce(new HttpError(404))
    .mockResolvedValueOnce(mockYaml(BETA_VERSION))

  try {
    await updater.checkForUpdates()
  } finally {
    vi.unstubAllEnvs()
  }
  expect(requestedPaths(requestSpy).slice(1)).toEqual([
    `${RELEASES_PATH}/download/${BETA_TAG}/beta-linux-arm64.yml`,
    `${RELEASES_PATH}/download/${BETA_TAG}/latest-linux-arm64.yml`,
  ])
})

// --- release name / notes ---

test("releaseName/releaseNotes from the channel file take precedence over the Atom feed", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: "Feed title", content: "Feed notes" }]))
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockResolvedValueOnce(`${mockYaml(STABLE_VERSION)}releaseName: YAML name\nreleaseNotes: YAML notes\n`)

  const result = await updater.checkForUpdates()
  expect(result?.updateInfo.releaseName).toBe("YAML name")
  expect(result?.updateInfo.releaseNotes).toBe("YAML notes")
})

test('releaseNotes - GitHub\'s "No content." placeholder becomes an empty string', async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy)

  requestSpy
    .mockResolvedValueOnce(mockAtomFeed([{ tag: STABLE_TAG, title: STABLE_TAG, content: "No content." }]))
    .mockResolvedValueOnce(mockReleaseJson(STABLE_TAG))
    .mockResolvedValueOnce(mockYaml(STABLE_VERSION))

  const result = await updater.checkForUpdates()
  expect(result?.updateInfo.releaseNotes).toBe("")
})

test("allowPrerelease=true with fullChangelog=true - notes span from the current version up to the selected (not first-listed) release", async ({ expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createPublicUpdater(requestSpy, "1.1.0-beta.2")
  updater.allowPrerelease = true
  updater.fullChangelog = true

  requestSpy
    .mockResolvedValueOnce(
      mockAtomFeed([
        { tag: "v1.0.4", title: "v1.0.4", content: "Stable hotfix notes" },
        { tag: "v1.1.0-beta.4", title: "v1.1.0-beta.4", content: "Beta 4 notes" },
        { tag: "v1.1.0-beta.3", title: "v1.1.0-beta.3", content: "Beta 3 notes" },
        { tag: "v1.1.0-beta.2", title: "v1.1.0-beta.2", content: "Beta 2 notes" },
      ])
    )
    .mockResolvedValueOnce(mockYaml("1.1.0-beta.4"))

  const result = await updater.checkForUpdates()
  expect(result?.updateInfo.releaseName).toBe("v1.1.0-beta.4")
  expect(result?.updateInfo.releaseNotes).toEqual([
    { version: "1.1.0-beta.4", note: "Beta 4 notes" },
    { version: "1.1.0-beta.3", note: "Beta 3 notes" },
  ])
})
