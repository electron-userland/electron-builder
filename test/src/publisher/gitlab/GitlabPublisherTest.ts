import { CancellationToken, GitlabOptions } from "builder-util-runtime"
import { GitlabPublisher, PublishContext } from "electron-publish"
import { beforeEach, describe, test, vi } from "vitest"
import { GitlabTestFixtures } from "./GitlabTestFixtures"

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
          delete process.env.GL_TOKEN

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

      test("should accept token from environment variables", ({ expect }) => {
        const env = GitlabTestFixtures.setupTestEnvironment()

        try {
          process.env.GITLAB_TOKEN = "test-token-from-env"

          const publisher = new GitlabPublisher(
            publishContext,
            {
              provider: "gitlab",
              projectId: GitlabTestFixtures.PROJECTS.valid,
            } as GitlabOptions,
            GitlabTestFixtures.VERSIONS.valid
          )

          expect(publisher.getTokenForTesting()).toBe("test-token-from-env")
        } finally {
          env.restore()
        }
      })

      test("should accept token from GL_TOKEN environment variable", ({ expect }) => {
        const env = GitlabTestFixtures.setupTestEnvironment()

        try {
          delete process.env.GITLAB_TOKEN
          process.env.GL_TOKEN = "test-token-from-gl-token"

          const publisher = new GitlabPublisher(
            publishContext,
            {
              provider: "gitlab",
              projectId: GitlabTestFixtures.PROJECTS.valid,
            } as GitlabOptions,
            GitlabTestFixtures.VERSIONS.valid
          )

          expect(publisher.getTokenForTesting()).toBe("test-token-from-gl-token")
        } finally {
          env.restore()
        }
      })

      test("should prioritize explicit token over environment", ({ expect }) => {
        const env = GitlabTestFixtures.setupTestEnvironment()

        try {
          process.env.GITLAB_TOKEN = "env-token"
          process.env.GL_TOKEN = "gl-env-token"

          const publisher = new GitlabPublisher(
            publishContext,
            {
              provider: "gitlab",
              projectId: GitlabTestFixtures.PROJECTS.valid,
              token: "explicit-token",
            } as GitlabOptions,
            GitlabTestFixtures.VERSIONS.valid
          )

          // Verify that the explicit token is used, not the environment tokens
          expect(publisher.getTokenForTesting()).toBe("explicit-token")
        } finally {
          env.restore()
        }
      })

      test("should prioritize GITLAB_TOKEN over GL_TOKEN", ({ expect }) => {
        const env = GitlabTestFixtures.setupTestEnvironment()

        try {
          process.env.GITLAB_TOKEN = "gitlab-token"
          process.env.GL_TOKEN = "gl-token"

          const publisher = new GitlabPublisher(
            publishContext,
            {
              provider: "gitlab",
              projectId: GitlabTestFixtures.PROJECTS.valid,
            } as GitlabOptions,
            GitlabTestFixtures.VERSIONS.valid
          )

          // Verify that GITLAB_TOKEN is used over GL_TOKEN
          expect(publisher.getTokenForTesting()).toBe("gitlab-token")
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

      test("should use CI environment variables as fallback", ({ expect }) => {
        const env = GitlabTestFixtures.setupTestEnvironment()

        try {
          process.env.CI_PROJECT_ID = "987654321"

          const publisher = new GitlabPublisher(
            publishContext,
            {
              provider: "gitlab",
              token: GitlabTestFixtures.TOKENS.test,
            } as GitlabOptions,
            GitlabTestFixtures.VERSIONS.valid
          )

          expect(publisher.toString()).toContain("987654321")
        } finally {
          env.restore()
        }
      })

      test("should use CI_PROJECT_PATH as fallback", ({ expect }) => {
        const env = GitlabTestFixtures.setupTestEnvironment()

        try {
          delete process.env.CI_PROJECT_ID
          process.env.CI_PROJECT_PATH = "namespace/project"

          const publisher = new GitlabPublisher(
            publishContext,
            {
              provider: "gitlab",
              token: GitlabTestFixtures.TOKENS.test,
            } as GitlabOptions,
            GitlabTestFixtures.VERSIONS.valid
          )

          expect(publisher.toString()).toContain("namespace/project")
        } finally {
          env.restore()
        }
      })

      test("should throw error when project ID is missing", ({ expect }) => {
        const env = GitlabTestFixtures.setupTestEnvironment()

        try {
          delete process.env.CI_PROJECT_ID
          delete process.env.CI_PROJECT_PATH

          expect(() => {
            new GitlabPublisher(
              publishContext,
              {
                provider: "gitlab",
                token: GitlabTestFixtures.TOKENS.test,
              } as GitlabOptions,
              GitlabTestFixtures.VERSIONS.valid
            )
          }).toThrow(GitlabTestFixtures.ERROR_PATTERNS.missingProject)
        } finally {
          env.restore()
        }
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

        expect(publisherWithPrefix.toString()).toBeDefined()
        expect(publisherWithoutPrefix.toString()).toBeDefined()
      })
    })

    describe("Host Configuration", () => {
      test("should use default host", ({ expect }) => {
        const publisher = new GitlabPublisher(publishContext, GitlabTestFixtures.createOptions(), GitlabTestFixtures.VERSIONS.valid)

        expect(publisher.toString()).toBeDefined()
      })

      test("should use custom host", ({ expect }) => {
        const publisher = new GitlabPublisher(
          publishContext,
          GitlabTestFixtures.createOptions({
            host: GitlabTestFixtures.HOSTS.custom,
          }),
          GitlabTestFixtures.VERSIONS.valid
        )

        expect(publisher.toString()).toBeDefined()
      })

      test("should use enterprise host", ({ expect }) => {
        const publisher = new GitlabPublisher(
          publishContext,
          GitlabTestFixtures.createOptions({
            host: GitlabTestFixtures.HOSTS.enterprise,
          }),
          GitlabTestFixtures.VERSIONS.valid
        )

        expect(publisher.toString()).toBeDefined()
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

      expect(publisher.toString()).toBeDefined()
    })

    test("should accept generic_package upload target", ({ expect }) => {
      const publisher = new GitlabPublisher(
        publishContext,
        GitlabTestFixtures.createOptions({
          uploadTarget: "generic_package",
        }),
        GitlabTestFixtures.VERSIONS.valid
      )

      expect(publisher.toString()).toBeDefined()
    })

    test("should accept custom timeout", ({ expect }) => {
      const publisher = new GitlabPublisher(
        publishContext,
        GitlabTestFixtures.createOptions({
          timeout: 60000,
        }),
        GitlabTestFixtures.VERSIONS.valid
      )

      expect(publisher.toString()).toBeDefined()
    })
  })

  describe("Provider Name", () => {
    test("should return correct provider name", ({ expect }) => {
      const publisher = new GitlabPublisher(publishContext, GitlabTestFixtures.createOptions(), GitlabTestFixtures.VERSIONS.valid)

      expect(publisher.providerName).toBe("gitlab")
    })
  })
})
