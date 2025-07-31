import { Arch } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { GitlabPublisher, PublishContext } from "electron-publish"
import { afterAll, beforeEach, describe, test, expect } from "vitest"
import { GitlabTestFixtures } from "./GitlabTestFixtures"
import { GitlabTestHelper } from "./GitlabTestHelper"

/**
 * GitLab Publisher Integration Tests
 *
 * Streamlined integration tests for GitlabPublisher core functionality.
 *
 * Prerequisites:
 * - GITLAB_TOKEN environment variable with valid GitLab personal access token
 * - GITLAB_TEST_PROJECT_ID for test project (default: 72170733)
 *
 * Coverage:
 * - Authentication validation
 * - Upload methods: project_upload and generic_package
 * - Release creation and asset linking
 *
 * Features:
 * - Automatic cleanup via afterAll hook
 * - Minimal API calls for CI efficiency
 */

// Helper function to check if error is due to authentication issues
function isAuthError(error: any): boolean {
  const errorMessage = error.message || error.description?.message || error.toString()
  return GitlabTestFixtures.ERROR_PATTERNS.auth.test(errorMessage)
}

/**
 * Cleans up test releases, preserving [v1.0.0, v1.1.0] baseline releases
 */
async function cleanupExistingReleases(): Promise<void> {
  const token = process.env.GITLAB_TOKEN
  if (!token) {
    console.warn("No GitLab token available for cleanup")
    return
  }

  try {
    const helper = new GitlabTestHelper()
    const releases = await helper.getAllReleases()

    // Keep [v1.0.0, v1.1.0] baseline releases
    const protectedReleases = ["v1.0.0", "1.0.0", "v1.1.0", "1.1.0"]
    const releasesToDelete = releases.filter(release => !protectedReleases.includes(release.tag_name))

    if (releasesToDelete.length === 0) {
      console.log("No releases to cleanup")
      return
    }

    // Delete releases, tags, and assets
    const cleanupPromises = releasesToDelete.map(async (release: any) => {
      try {
        const versionId = release.tag_name
        await helper.deleteUploadedAssets(versionId)
        await helper.deleteReleaseAndTag(versionId)
        console.log(`Cleaned up release: ${versionId}`)
      } catch (e: any) {
        console.warn(`Failed to cleanup release ${release.tag_name}:`, e.message)
      }
    })

    await Promise.allSettled(cleanupPromises)
    console.log(`Cleanup completed. Deleted ${releasesToDelete.length} releases.`)
  } catch (e: any) {
    console.warn("Failed to perform cleanup:", e.message)
  }
}

describe.sequential("GitLab Publisher - Integration Tests", () => {
  let publishContext: PublishContext
  let gitlabHelper: GitlabTestHelper
  let testId: string

  beforeEach(() => {
    testId = Date.now().toString()
    publishContext = {
      cancellationToken: new CancellationToken(),
      progress: null,
    }
    gitlabHelper = new GitlabTestHelper()
  })

  afterAll(async () => {
    await cleanupExistingReleases()
  }, 120000)

  // Helper to create a publisher with unique version
  function createPublisher(options: any = {}): GitlabPublisher {
    const uniqueVersion = `${GitlabTestFixtures.VERSIONS.randomVersion()}.${testId}`

    return new GitlabPublisher(
      publishContext,
      GitlabTestFixtures.createOptions({
        ...options,
        token: undefined, // Use environment token
      }),
      uniqueVersion,
      GitlabTestFixtures.DEFAULT_PUBLISH_OPTIONS
    )
  }

  describe.sequential("Authentication", () => {
    test("should reject invalid token", async () => {
      const publisher = new GitlabPublisher(
        publishContext,
        GitlabTestFixtures.createOptions({
          token: GitlabTestFixtures.TOKENS.invalid,
        }),
        `${GitlabTestFixtures.VERSIONS.randomVersion()}.${testId}`,
        GitlabTestFixtures.DEFAULT_PUBLISH_OPTIONS
      )

      try {
        await publisher.upload({ file: GitlabTestFixtures.ICON_PATH, arch: Arch.x64 })
        throw new Error("Expected authentication error")
      } catch (error: any) {
        expect(isAuthError(error), `Error: ${error.message}`).toBe(true)
      }
    }, 15000)
  })

  describe.sequential("File Upload", () => {
    test.skipIf(!process.env.GITLAB_TOKEN)(
      "should upload via project_upload, create release and link assets",
      async () => {
        const publisher = createPublisher()
        await publisher.upload({ file: GitlabTestFixtures.ICON_PATH, arch: Arch.x64 })

        const tag = (publisher as any).tag
        const release = await gitlabHelper.getRelease(tag)
        expect(release).toBeTruthy()
        expect(GitlabTestFixtures.validateReleaseStructure(release)).toBe(true)

        const assets = release?.assets
        expect(assets?.links?.length).toBeGreaterThan(0)
        expect(GitlabTestFixtures.validateAssetLinkStructure(assets?.links[0])).toBe(true)
      },
      60000
    )

    test.skipIf(!process.env.GITLAB_TOKEN)(
      "should upload via generic_package, create release and link assets",
      async () => {
        const publisher = createPublisher({ uploadTarget: "generic_package" })
        await publisher.upload({ file: GitlabTestFixtures.ICON_PATH, arch: Arch.x64 })

        const tag = (publisher as any).tag
        const release = await gitlabHelper.getRelease(tag)
        expect(release).toBeTruthy()
        expect(GitlabTestFixtures.validateReleaseStructure(release)).toBe(true)

        const assets = release?.assets
        expect(assets?.links?.length).toBeGreaterThan(0)
        expect(GitlabTestFixtures.validateAssetLinkStructure(assets?.links[0])).toBe(true)
      },
      60000
    )
  })
})
