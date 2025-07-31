import { httpExecutor, log } from "builder-util"
import { GitlabReleaseInfo, HttpError } from "builder-util-runtime"

/**
 * Helper class for GitLab test operations
 *
 * Provides methods for interacting with GitLab API during testing,
 * including release management and cleanup operations.
 */
export class GitlabTestHelper {
  private readonly token: string
  private readonly host: string
  private readonly projectId: string

  constructor({
    // gitlab repo for this project is `https://gitlab.com/daihere1993/gitlab-electron-updater-test-2`
    projectId = "72170733",
    host = "gitlab.com",
  }: {
    projectId?: string
    host?: string
  } = {}) {
    this.token = process.env.GITLAB_TOKEN || process.env.GL_TOKEN || ""
    this.host = host
    this.projectId = String(projectId)
  }

  /**
   * Make authenticated request to GitLab API
   */
  private async gitlabRequest<T>(path: string, data?: any, method: string = "GET"): Promise<T | null> {
    const requestOptions = {
      hostname: this.host,
      path: `/api/v4${path}`,
      method: method,
      headers: {
        "Private-Token": this.token,
        accept: "application/json",
      },
    }

    try {
      const response = await httpExecutor.request(requestOptions, undefined, data)
      return response ? JSON.parse(response) : null
    } catch (e: any) {
      if (e instanceof HttpError && e.statusCode === 404) {
        return null
      }
      throw e
    }
  }

  /**
   * Get release information by tag name
   */
  async getRelease(releaseId: string): Promise<GitlabReleaseInfo | null> {
    try {
      return await this.gitlabRequest<GitlabReleaseInfo>(`/projects/${encodeURIComponent(this.projectId)}/releases/${releaseId}`)
    } catch (e: any) {
      if (e instanceof HttpError && e.statusCode === 404) {
        return null
      }
      throw e
    }
  }

  /**
   * Delete GitLab release by tag name
   */
  async deleteRelease(releaseId: string): Promise<void> {
    const release = await this.getRelease(releaseId)
    if (release == null) {
      log.warn({ releaseId, reason: "doesn't exist" }, "cannot delete release")
      return
    }

    try {
      await this.gitlabRequest(`/projects/${encodeURIComponent(this.projectId)}/releases/${releaseId}`, null, "DELETE")
    } catch (e: any) {
      if (e instanceof HttpError && e.statusCode === 404) {
        log.warn({ releaseId, reason: "doesn't exist" }, "cannot delete release")
        return
      }
      throw e
    }
  }

  /**
   * Delete GitLab release and corresponding git tag
   */
  async deleteReleaseAndTag(releaseId: string): Promise<void> {
    const release = await this.getRelease(releaseId)
    if (release == null) {
      log.warn({ releaseId, reason: "doesn't exist" }, "cannot delete release")
      return
    }

    try {
      // First delete the release
      await this.deleteRelease(releaseId)
      log.debug({ releaseId }, "Deleted GitLab release")
    } catch (e: any) {
      log.warn({ releaseId, error: e.message }, "Failed to delete GitLab release")
    }

    try {
      // Then delete the git tag
      await this.gitlabRequest(`/projects/${encodeURIComponent(this.projectId)}/repository/tags/${encodeURIComponent(releaseId)}`, null, "DELETE")
      log.debug({ releaseId }, "Deleted GitLab tag")
    } catch (e: any) {
      if (e instanceof HttpError && e.statusCode === 404) {
        log.warn({ releaseId, reason: "doesn't exist" }, "cannot delete git tag")
        return
      }
      log.warn({ releaseId, error: e.message }, "Failed to delete GitLab tag")
    }
  }

  /**
   * Delete uploaded assets (generic packages only)
   *
   * Note: Project uploads are automatically deleted by GitLab when the release is deleted.
   */
  async deleteUploadedAssets(releaseId: string): Promise<void> {
    try {
      // Only need to delete generic packages - project uploads are auto-deleted with releases
      await this.deleteGenericPackages(releaseId)
    } catch (e: any) {
      log.warn({ releaseId, error: e.message }, "Failed to cleanup uploaded assets")
    }
  }

  /**
   * Delete generic packages matching version from Package Registry
   */
  async deleteGenericPackages(version: string): Promise<void> {
    try {
      // Get all packages for the "releases" package name
      const packages = await this.gitlabRequest<any[]>(`/projects/${encodeURIComponent(this.projectId)}/packages?package_name=releases`)

      if (!packages || packages.length === 0) {
        return
      }

      // Find packages that match our version
      const matchingPackages = packages.filter(pkg => pkg.name === "releases" && pkg.version === version)

      // Delete matching packages
      const deletePromises = matchingPackages.map(async (pkg: any) => {
        try {
          await this.gitlabRequest(`/projects/${encodeURIComponent(this.projectId)}/packages/${pkg.id}`, null, "DELETE")
          log.debug({ packageId: pkg.id, version: pkg.version }, "Deleted GitLab generic package")
        } catch (e: any) {
          log.warn({ packageId: pkg.id, version: pkg.version, error: e.message }, "Failed to delete GitLab generic package")
        }
      })

      await Promise.allSettled(deletePromises)
    } catch (e: any) {
      log.warn({ version, error: e.message }, "Failed to cleanup generic packages")
    }
  }

  /**
   * Get all releases from GitLab project
   */
  async getAllReleases(): Promise<GitlabReleaseInfo[]> {
    try {
      const releases = await this.gitlabRequest<GitlabReleaseInfo[]>(`/projects/${encodeURIComponent(this.projectId)}/releases`)
      return releases || []
    } catch (e: any) {
      throw new Error(`Failed to get all releases: ${e.message}`)
    }
  }
}
