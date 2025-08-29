import * as path from "path"
import { GitlabOptions } from "builder-util-runtime"

export class GitlabTestFixtures {
  // Test file paths
  static readonly ICON_PATH = path.join(__dirname, "..", "..", "..", "fixtures", "test-app", "build", "icon.icns")
  static readonly ICO_PATH = path.join(__dirname, "..", "..", "..", "fixtures", "test-app", "build", "icon.ico")

  // Test versions
  static readonly VERSIONS = {
    valid: "1.0.0",
    validWithBuild: "1.0.0-beta.1",
    invalidWithV: "v1.0.0",
    randomVersion: () => GitlabTestFixtures.generateRandomVersion(),
  } as const

  // Project configurations
  static readonly PROJECTS = {
    valid: "72170733",
    nonExistent: "99999999",
    stringFormat: "namespace/project-name",
    numericFormat: 12345678,
  } as const

  // Host configurations
  static readonly HOSTS = {
    gitlab: "gitlab.com",
    custom: "gitlab.example.com",
    enterprise: "git.company.com",
  } as const

  // Token configurations
  static readonly TOKENS = {
    test: "__test__",
    invalid: "invalid-token",
    malformed: "glpat-invalid!@#$%",
  } as const

  // Error patterns for assertions
  static readonly ERROR_PATTERNS = {
    auth: /(Unauthorized|401|invalid token|Bad credentials|403|Forbidden)/i,
    notFound: /(404|not found|doesn't exist)/i,
    rateLimit: /rate limit exceeded/i,
    missingToken: /GitLab Personal Access Token is not set/i,
    missingProject: /GitLab project ID or path is not specified/i,
    invalidVersion: /Version must not start with "v"/i,
  } as const

  // Default configurations
  static readonly DEFAULT_OPTIONS: GitlabOptions = {
    provider: "gitlab",
    projectId: GitlabTestFixtures.PROJECTS.valid,
    host: GitlabTestFixtures.HOSTS.gitlab,
    token: GitlabTestFixtures.TOKENS.test,
  }

  static readonly DEFAULT_PUBLISH_OPTIONS = {
    publish: "always" as const,
  }

  // Helper methods
  static generateRandomVersion(): string {
    const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
    return `${randomInt(0, 99)}.${randomInt(0, 99)}.${randomInt(0, 99)}`
  }

  static createOptions(overrides: Partial<GitlabOptions> = {}): GitlabOptions {
    return { ...GitlabTestFixtures.DEFAULT_OPTIONS, ...overrides }
  }

  static createTestFiles(): { name: string; path: string }[] {
    return [
      { name: "icon.icns", path: GitlabTestFixtures.ICON_PATH },
      { name: "icon.ico", path: GitlabTestFixtures.ICO_PATH },
    ]
  }

  // Environment setup helpers
  static setupTestEnvironment(): {
    original: Record<string, string | undefined>
    restore: () => void
  } {
    const original = {
      GITLAB_TOKEN: process.env.GITLAB_TOKEN,
      CI_PROJECT_ID: process.env.CI_PROJECT_ID,
      CI_PROJECT_PATH: process.env.CI_PROJECT_PATH,
    }

    return {
      original,
      restore: () => {
        Object.entries(original).forEach(([key, value]) => {
          if (value !== undefined) {
            process.env[key] = value
          } else {
            delete process.env[key]
          }
        })
      },
    }
  }

  // Assertion helpers for test validation
  static validateReleaseStructure(release: unknown): boolean {
    const r = release as any
    return typeof r?.tag_name === "string" && typeof r?.name === "string" && Array.isArray(r?.assets?.links)
  }

  static validateAssetLinkStructure(link: unknown, assetType: "project_upload" | "generic_package"): boolean {
    const l = link as any

    // GitLab upload URL pattern: https://gitlab.com/-/project/{projectId}/uploads/{hash}/{filename}
    const gitlabUploadUrlPattern = /^https:\/\/gitlab\.com\/-\/project\/\d+\/uploads\/[a-f0-9]{32}\/.+$/

    // GitLab generic package URL pattern: https://gitlab.com/api/v4/projects/{projectId}/packages/generic/{packageName}/{packageVersion}/{filename}
    const gitlabGenericPackageUrlPattern = /^https:\/\/gitlab\.com\/api\/v4\/projects\/\d+\/packages\/generic\/.+\/.+\/.+$/

    const isValidUrl = (url: string) => {
      if (assetType === "project_upload") {
        return gitlabUploadUrlPattern.test(url)
      } else if (assetType === "generic_package") {
        return gitlabGenericPackageUrlPattern.test(url)
      }
      return false
    }

    return (
      (typeof l?.id === "string" || typeof l?.id === "number") &&
      typeof l?.name === "string" &&
      typeof l?.url === "string" &&
      isValidUrl(l?.url) &&
      typeof l?.direct_asset_url === "string" &&
      isValidUrl(l?.direct_asset_url) &&
      typeof l?.link_type === "string"
    )
  }
}
