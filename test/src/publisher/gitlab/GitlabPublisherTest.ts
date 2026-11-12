import { Arch, httpExecutor } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { GitlabPublisher, PublishContext } from "electron-publish"
import { beforeEach, describe, test, vi } from "vitest"
import { GitlabTestFixtures } from "./GitlabTestFixtures.js"

// Mock the HTTP executor to avoid real network calls
vi.mock("builder-util", async () => {
  const actual = await vi.importActual("builder-util")
  return {
    ...actual,
    httpExecutor: {
      doApiRequest: vi.fn(),
      request: vi.fn(),
    },
  }
})

describe("GitLab Publisher - Unit Tests", () => {
  let publishContext: PublishContext

  beforeEach(() => {
    publishContext = {
      cancellationToken: new CancellationToken(),
      progress: null,
    }
    vi.clearAllMocks()
  })

  describe("Configuration", () => {
    describe("Authentication", () => {
      test("should throw error for missing token", ({ expect }) => {
        const env = GitlabTestFixtures.setupTestEnvironment()

        try {
          delete process.env.GITLAB_TOKEN

          expect(() => {
            new GitlabPublisher(
              publishContext,
              {
                provider: "gitlab",
                projectId: GitlabTestFixtures.PROJECTS.valid,
              },
              GitlabTestFixtures.VERSIONS.valid
            )
          }).toThrow(GitlabTestFixtures.ERROR_PATTERNS.missingToken)
        } finally {
          env.restore()
        }
      })
    })

    describe("Project Configuration", () => {
      test("should handle string project ID", ({ expect }) => {
        const publisher = new GitlabPublisher(
          publishContext,
          GitlabTestFixtures.createOptions({
            projectId: GitlabTestFixtures.PROJECTS.stringFormat,
          }),
          GitlabTestFixtures.VERSIONS.valid
        )

        expect(publisher.toString()).toContain(GitlabTestFixtures.PROJECTS.stringFormat)
      })

      test("should handle numeric project ID", ({ expect }) => {
        const publisher = new GitlabPublisher(
          publishContext,
          GitlabTestFixtures.createOptions({
            projectId: GitlabTestFixtures.PROJECTS.numericFormat,
          }),
          GitlabTestFixtures.VERSIONS.valid
        )

        expect(publisher.toString()).toContain(String(GitlabTestFixtures.PROJECTS.numericFormat))
      })
    })

    describe("Version Handling", () => {
      test("should reject version starting with 'v'", ({ expect }) => {
        expect(() => {
          new GitlabPublisher(publishContext, GitlabTestFixtures.createOptions(), GitlabTestFixtures.VERSIONS.invalidWithV)
        }).toThrow(GitlabTestFixtures.ERROR_PATTERNS.invalidVersion)
      })

      test("should accept valid version", ({ expect }) => {
        const publisher = new GitlabPublisher(publishContext, GitlabTestFixtures.createOptions(), GitlabTestFixtures.VERSIONS.valid)

        expect(publisher.toString()).toContain(GitlabTestFixtures.VERSIONS.valid)
      })

      test("should accept version with build metadata", ({ expect }) => {
        const publisher = new GitlabPublisher(publishContext, GitlabTestFixtures.createOptions(), GitlabTestFixtures.VERSIONS.validWithBuild)

        expect(publisher.toString()).toContain(GitlabTestFixtures.VERSIONS.validWithBuild)
      })
    })

    describe("Tag name", () => {
      // The GitLab API as the publisher calls it: the release list is empty, the default branch is main, and a POST returns what it sent.
      // The token is passed in (not "__test__", which skips the API), so no environment variable is read.
      function mockGitlabApi() {
        vi.mocked(httpExecutor.request).mockImplementation(async (options, _cancellationToken, data) =>
          options.method !== "GET" ? JSON.stringify(data) : options.path?.endsWith("/releases") ? "[]" : JSON.stringify({ default_branch: "main" })
        )
      }

      test.for([
        [undefined, "v1.0.0"],
        ["", "1.0.0"],
        ["release-", "release-1.0.0"],
      ] as const)("tagNamePrefix %j tags and names the release %s", async ([tagNamePrefix, expected], { expect }) => {
        mockGitlabApi()
        const publisher = new GitlabPublisher(publishContext, GitlabTestFixtures.createOptions({ token: "glpat-test", tagNamePrefix }), GitlabTestFixtures.VERSIONS.valid)
        await publisher._release.value
        const createRelease = vi.mocked(httpExecutor.request).mock.calls.find(([options]) => options.method === "POST")
        expect(createRelease?.[2]).toMatchObject({ tag_name: expected, name: expected })
      })

      test("a tag name with a slash is one path segment of the release asset link URL", async ({ expect }) => {
        mockGitlabApi()
        const publisher = new GitlabPublisher(
          publishContext,
          GitlabTestFixtures.createOptions({ token: "glpat-test", tagNamePrefix: "release/", uploadTarget: "generic_package" }),
          GitlabTestFixtures.VERSIONS.valid
        )
        await publisher.upload({ file: "app.exe", fileContent: Buffer.from("x"), arch: Arch.x64 })
        expect(vi.mocked(httpExecutor.request).mock.calls.map(([options]) => options.path)).toContain(
          `/api/v4/projects/${GitlabTestFixtures.PROJECTS.valid}/releases/release%2F1.0.0/assets/links`
        )
      })
    })

    describe("Host Configuration", () => {
      test("should use default host", ({ expect }) => {
        const publisher = new GitlabPublisher(publishContext, GitlabTestFixtures.createOptions(), GitlabTestFixtures.VERSIONS.valid)

        expect(publisher.toString()).toContain("GitLab")
      })

      test("should use custom host", ({ expect }) => {
        const publisher = new GitlabPublisher(
          publishContext,
          GitlabTestFixtures.createOptions({
            host: GitlabTestFixtures.HOSTS.custom,
          }),
          GitlabTestFixtures.VERSIONS.valid
        )

        expect(publisher.toString()).toContain("GitLab")
      })

      test("should use enterprise host", ({ expect }) => {
        const publisher = new GitlabPublisher(
          publishContext,
          GitlabTestFixtures.createOptions({
            host: GitlabTestFixtures.HOSTS.enterprise,
          }),
          GitlabTestFixtures.VERSIONS.valid
        )

        expect(publisher.toString()).toContain("GitLab")
      })
    })
  })

  describe("Publisher String Representation", () => {
    test("should return meaningful string representation", ({ expect }) => {
      const publisher = new GitlabPublisher(
        publishContext,
        GitlabTestFixtures.createOptions({
          projectId: "test-project",
        }),
        "1.2.3"
      )

      const str = publisher.toString()
      expect(str).toContain("GitLab")
      expect(str).toContain("test-project")
      expect(str).toContain("1.2.3")
    })
  })

  describe("Upload Target Configuration", () => {
    test("should default to project_upload method", ({ expect }) => {
      const publisher = new GitlabPublisher(publishContext, GitlabTestFixtures.createOptions(), GitlabTestFixtures.VERSIONS.valid)

      expect(publisher.toString()).toContain("GitLab")
    })

    test("should accept generic_package upload target", ({ expect }) => {
      const publisher = new GitlabPublisher(
        publishContext,
        GitlabTestFixtures.createOptions({
          uploadTarget: "generic_package",
        }),
        GitlabTestFixtures.VERSIONS.valid
      )

      expect(publisher.toString()).toContain("GitLab")
    })

    test("should accept custom timeout", ({ expect }) => {
      const publisher = new GitlabPublisher(
        publishContext,
        GitlabTestFixtures.createOptions({
          timeout: 60000,
        }),
        GitlabTestFixtures.VERSIONS.valid
      )

      expect(publisher.toString()).toContain("GitLab")
    })
  })

  describe("Provider Name", () => {
    test("should return correct provider name", ({ expect }) => {
      const publisher = new GitlabPublisher(publishContext, GitlabTestFixtures.createOptions(), GitlabTestFixtures.VERSIONS.valid)

      expect(publisher.providerName).toBe("gitlab")
    })
  })
})
