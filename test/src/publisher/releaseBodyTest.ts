import { createPublisher } from "app-builder-lib/internal"
import { InvalidConfigurationError, log } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { PublishContext } from "electron-publish"
import { mkdir, writeFile } from "fs/promises"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { afterEach, beforeEach, describe, test, vi } from "vitest"

// The GitHub/GitLab release body follows the release-notes rules of latest*.yml, from the root releaseInfo:
// https://www.electron.build/docs/migration/v27-build-changes#github-gitlab-release-body-follows-latestyml

const DOCS = "https://www.electron.build/docs/migration/v27-build-changes#github-gitlab-release-body-follows-latestyml"
const publishContext: PublishContext = { cancellationToken: new CancellationToken(), progress: null }
const githubRelease = { id: 1, tag_name: "v1.0.0", draft: true, prerelease: false, published_at: "", upload_url: "https://uploads.github.com/{?name}" }

interface Dirs {
  readonly projectDir: string
  readonly buildResourcesDir: string
}

beforeEach(() => {
  // a token in the environment would replace the configured one
  vi.stubEnv("GITHUB_RELEASE_TOKEN", undefined)
  log.resetLimits()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function createProject(tmpDir: TmpDir, files: Record<string, string>, buildResourcesInProjectDir = false): Promise<Dirs> {
  const projectDir = await tmpDir.getTempDir({ prefix: "release-body" })
  const buildResourcesDir = buildResourcesInProjectDir ? projectDir : path.join(projectDir, "build")
  await mkdir(buildResourcesDir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(projectDir, name), content)
  }
  return { projectDir, buildResourcesDir }
}

function rootPackager(dirs: Dirs, releaseInfo?: Record<string, any>): any {
  return { config: { releaseInfo }, ...dirs }
}

async function githubReleaseData(dirs: Dirs, releaseInfo?: Record<string, any>): Promise<any> {
  const publisher: any = await createPublisher(
    publishContext,
    "1.0.0",
    { provider: "github", owner: "o", repo: "r", token: "__test__" } as any,
    {},
    rootPackager(dirs, releaseInfo)
  )
  let data: any = null
  publisher.githubRequest = (_path: string, _token: string, requestData: any) => {
    data = requestData
    return Promise.resolve(githubRelease)
  }
  await publisher.createRelease()
  return data
}

describe("GitHub/GitLab release body", () => {
  test("fills the body from release-notes.md in the build resources", async ({ expect, tmpDir }) => {
    const info = vi.spyOn(log, "info")
    const dirs = await createProject(tmpDir, { "build/release-notes.md": "build notes" })
    expect((await githubReleaseData(dirs)).body).toBe("build notes")
    expect(info.mock.calls.filter(([, message]) => String(message).includes(DOCS))).toHaveLength(1)
  })

  test("resolves an explicit releaseNotesFile in the build resources first", async ({ expect, tmpDir }) => {
    const dirs = await createProject(tmpDir, { "build/notes.md": "build copy", "notes.md": "project copy" })
    expect((await githubReleaseData(dirs, { releaseNotesFile: "notes.md" })).body).toBe("build copy")
  })

  test("releaseNotesFile: null turns the default off", async ({ expect, tmpDir }) => {
    const dirs = await createProject(tmpDir, { "build/release-notes.md": "build notes", "release-notes.md": "root notes" })
    expect((await githubReleaseData(dirs, { releaseNotesFile: null })).body).toBeUndefined()
  })

  test('releaseNotes "" means no body', async ({ expect, tmpDir }) => {
    const dirs = await createProject(tmpDir, { "build/release-notes.md": "build notes", "release-notes.md": "root notes" })
    expect((await githubReleaseData(dirs, { releaseNotes: "" })).body).toBeUndefined()
    expect((await githubReleaseData(dirs, { releaseNotes: "inline notes" })).body).toBe("inline notes")
  })

  test("a missing releaseNotesFile fails", async ({ expect, tmpDir }) => {
    const dirs = await createProject(tmpDir, {})
    const created = createPublisher(
      publishContext,
      "1.0.0",
      { provider: "github", owner: "o", repo: "r", token: "__test__" } as any,
      {},
      rootPackager(dirs, { releaseNotesFile: "missing.md" })
    )
    await expect(created).rejects.toThrow(InvalidConfigurationError)
    await expect(created).rejects.toThrow(
      /releaseInfo\.releaseNotesFile "missing\.md" was not found in the build resources .*v27-build-changes#github-gitlab-release-body-follows-latestyml/
    )
  })

  test("a project-root release-notes.md is no longer read, and that is announced once", async ({ expect, tmpDir }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
    const dirs = await createProject(tmpDir, { "release-notes.md": "root notes" })
    expect((await githubReleaseData(dirs)).body).toBeUndefined()
    expect((await githubReleaseData(dirs)).body).toBeUndefined()
    const announced = warn.mock.calls.filter(([, message]) => String(message).includes(DOCS))
    expect(announced).toHaveLength(1)
    expect(String(announced[0][1])).toContain("v27")
  })

  test("nothing is announced when the build resources are the project directory", async ({ expect, tmpDir }) => {
    const warn = vi.spyOn(log, "warn")
    const info = vi.spyOn(log, "info")
    const dirs = await createProject(tmpDir, { "release-notes.md": "root notes" }, true)
    expect((await githubReleaseData(dirs)).body).toBe("root notes")
    for (const spy of [warn, info]) {
      expect(spy.mock.calls.filter(([, message]) => String(message).includes(DOCS))).toHaveLength(0)
    }
  })

  test("GitLab uses the same resolution", async ({ expect, tmpDir }) => {
    const dirs = await createProject(tmpDir, { "build/release-notes.md": "build notes" })
    const publisher: any = await createPublisher(publishContext, "1.0.0", { provider: "gitlab", projectId: "1", token: "__test__" } as any, {}, rootPackager(dirs))
    let data: any = null
    publisher.gitlabRequest = (_url: URL, requestData: any, method = "GET") => {
      if (method === "POST") {
        data = requestData
      }
      return Promise.resolve(method === "GET" ? { default_branch: "main" } : { tag_name: "v1.0.0" })
    }
    await publisher.createRelease()
    expect(data.description).toBe("build notes")
  })
})
