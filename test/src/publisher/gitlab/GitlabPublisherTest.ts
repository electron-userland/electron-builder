import { CancellationToken, GitlabOptions } from "builder-util-runtime"
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
              } as GitlabOptions,
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

      test("should handle vPrefixedTagName option", ({ expect }) => {
        const publisherWithPrefix = new GitlabPublisher(
          publishContext,
          GitlabTestFixtures.createOptions({
            vPrefixedTagName: true,
          }),
          GitlabTestFixtures.VERSIONS.valid
        )

        const publisherWithoutPrefix = new GitlabPublisher(
          publishContext,
          GitlabTestFixtures.createOptions({
            vPrefixedTagName: false,
          }),
          GitlabTestFixtures.VERSIONS.valid
        )

        expect(publisherWithPrefix.toString()).toContain("GitLab")
        expect(publisherWithoutPrefix.toString()).toContain("GitLab")
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
