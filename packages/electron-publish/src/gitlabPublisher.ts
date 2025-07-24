import { Arch, httpExecutor, InvalidConfigurationError, isEmptyOrSpaces, isTokenCharValid, log } from "builder-util"
import { readFile } from "fs/promises"
import { configureRequestOptions, GitlabOptions, GitlabReleaseInfo, parseJson } from "builder-util-runtime"
import { ClientRequest } from "http"
import { Lazy } from "lazy-val"
import * as mime from "mime"
import * as FormData from "form-data"
import { parse as parseUrl, URL } from "url"
import { HttpPublisher } from "./httpPublisher"
import { PublishContext, PublishOptions } from "./index"
import { getCiTag } from "./publisher"

export class GitlabPublisher extends HttpPublisher {
  private readonly tag: string
  readonly _release = new Lazy(() => (this.token === "__test__" ? Promise.resolve(null as any) : this.getOrCreateRelease()))

  private readonly token: string
  private readonly host: string
  private readonly baseApiPath: string
  private readonly projectId: string

  readonly providerName = "gitlab"

  private releaseLogFields: any = null

  constructor(
    context: PublishContext,
    private readonly info: GitlabOptions,
    private readonly version: string,
    private readonly options: PublishOptions = {}
  ) {
    super(context, true)

    let token = info.token
    if (isEmptyOrSpaces(token)) {
      token = process.env.GITLAB_TOKEN || process.env.GL_TOKEN
      if (isEmptyOrSpaces(token)) {
        throw new InvalidConfigurationError(`GitLab Personal Access Token is not set, neither programmatically, nor using env "GITLAB_TOKEN" or "GL_TOKEN"`)
      }

      token = token.trim()

      if (!isTokenCharValid(token)) {
        throw new InvalidConfigurationError(`GitLab Personal Access Token (${JSON.stringify(token)}) contains invalid characters, please check env "GITLAB_TOKEN" or "GL_TOKEN"`)
      }
    }

    this.token = token
    this.host = info.host || "gitlab.com"
    this.projectId = this.resolveProjectId()
    this.baseApiPath = `https://${this.host}/api/v4`

    if (version.startsWith("v")) {
      throw new InvalidConfigurationError(`Version must not start with "v": ${version}`)
    }

    // By default, we prefix the version with "v"
    this.tag = info.vPrefixedTagName === false ? version : `v${version}`
  }

  private async getOrCreateRelease(): Promise<GitlabReleaseInfo | null> {
    const logFields = {
      tag: this.tag,
      version: this.version,
    }

    // Get all releases first, then filter by tag (similar to GitHub publisher pattern)
    const url = new URL(`${this.baseApiPath}/projects/${encodeURIComponent(this.projectId)}/releases`)
    const releases = await this.gitlabRequest<GitlabReleaseInfo[]>(url, this.token)
    for (const release of releases) {
      if (release.tag_name === this.tag) {
        return release
      }
    }

    // Create new release if it doesn't exist
    if (this.options.publish === "always" || getCiTag() != null) {
      log.info(
        {
          reason: "release doesn't exist",
          ...logFields,
        },
        `creating GitLab release`
      )
      return this.createRelease()
    }

    this.releaseLogFields = {
      reason: 'release doesn\'t exist and not created because "publish" is not "always" and build is not on tag',
      ...logFields,
    }
    return null
  }

  private getBranchName(): string {
    // Try GitLab CI environment variables first
    if (process.env.CI_COMMIT_REF_NAME) {
      return process.env.CI_COMMIT_REF_NAME
    }
    if (process.env.CI_COMMIT_BRANCH) {
      return process.env.CI_COMMIT_BRANCH
    }
    if (process.env.CI_DEFAULT_BRANCH) {
      return process.env.CI_DEFAULT_BRANCH
    }

    // Default fallback
    return "main"
  }

  private async createRelease(): Promise<GitlabReleaseInfo> {
    const releaseName = this.info.vPrefixedTagName === false ? this.version : `v${this.version}`
    const releaseData = {
      tag_name: this.tag,
      name: releaseName,
      description: `Release ${releaseName}`,
      ref: this.getBranchName(),
    }

    const url = new URL(`${this.baseApiPath}/projects/${encodeURIComponent(this.projectId)}/releases`)
    return this.gitlabRequest<GitlabReleaseInfo>(url, this.token, releaseData, "POST")
  }

  protected async doUpload(
    fileName: string,
    arch: Arch,
    dataLength: number,
    requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void,
    _file: string
  ): Promise<any> {
    const release = await this._release.value
    if (release == null) {
      log.warn({ file: fileName, ...this.releaseLogFields }, "skipped publishing")
      return
    }

    try {
      // Default to project_upload method
      const uploadTarget = this.info.uploadTarget || "project_upload"

      let uploadResult
      let assetUrl: string
      if (uploadTarget === "generic_package") {
        uploadResult = await this.uploadToGenericPackages(fileName, dataLength, requestProcessor, _file)
        // For generic packages, construct the download URL
        const projectId = encodeURIComponent(this.projectId)
        assetUrl = `https://${this.host}/api/v4/projects/${projectId}/packages/generic/releases/${this.version}/${fileName}`
      } else {
        // Default to project_upload
        uploadResult = await this.uploadToProjectUpload(fileName, _file)
        // For project uploads, construct full URL from relative path
        assetUrl = `https://${this.host}${uploadResult.url}`
      }

      // Add the uploaded file as a release asset link
      if (assetUrl) {
        await this.addReleaseAssetLink(fileName, assetUrl)
        log.info({ fileName, assetUrl }, "Added file to GitLab release assets")
      } else {
        log.warn({ fileName }, "No asset URL found for file")
      }

      return uploadResult
    } catch (e: any) {
      log.error({ file: fileName, error: e.message }, "failed to upload to GitLab")
      throw e
    }
  }

  private async addReleaseAssetLink(fileName: string, assetUrl: string): Promise<void> {
    try {
      const linkData = {
        name: fileName,
        url: assetUrl,
        link_type: "other",
      }

      const url = new URL(`${this.baseApiPath}/projects/${encodeURIComponent(this.projectId)}/releases/${this.tag}/assets/links`)
      await this.gitlabRequest(url, this.token, linkData, "POST")

      log.debug({ fileName, assetUrl }, "Successfully linked asset to GitLab release")
    } catch (e: any) {
      log.warn({ fileName, assetUrl, error: e.message }, "Failed to link asset to GitLab release")
      // Don't throw - the file was uploaded successfully, linking is optional
    }
  }

  private async uploadToProjectUpload(fileName: string, _filePath: string): Promise<any> {
    const projectId = encodeURIComponent(this.projectId)
    const uploadUrl = `https://${this.host}/api/v4/projects/${projectId}/uploads`
    const parsedUrl = parseUrl(uploadUrl)

    // Read file content and create FormData for multipart/form-data upload
    const fileContent = await readFile(_filePath)
    const form = new FormData()
    form.append("file", fileContent, fileName)

    const response = await httpExecutor.doApiRequest(
      configureRequestOptions(
        {
          protocol: parsedUrl.protocol,
          hostname: parsedUrl.hostname,
          port: parsedUrl.port as any,
          path: parsedUrl.path,
          headers: { ...form.getHeaders() },
          timeout: this.info.timeout || undefined,
        },
        this.token,
        "POST"
      ),
      this.context.cancellationToken,
      (it: ClientRequest) => form.pipe(it)
    )

    // Parse the JSON response string
    return JSON.parse(response)
  }

  private async uploadToGenericPackages(
    fileName: string,
    dataLength: number,
    requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void,
    _filePath: string
  ): Promise<any> {
    const projectId = encodeURIComponent(this.projectId)
    const uploadUrl = `https://${this.host}/api/v4/projects/${projectId}/packages/generic/releases/${this.version}/${fileName}`
    const parsedUrl = parseUrl(uploadUrl)

    return httpExecutor.doApiRequest(
      configureRequestOptions(
        {
          protocol: parsedUrl.protocol,
          hostname: parsedUrl.hostname,
          port: parsedUrl.port as any,
          path: parsedUrl.path,
          headers: { "Content-Length": dataLength, "Content-Type": mime.getType(fileName) || "application/octet-stream" },
          timeout: this.info.timeout || undefined,
        },
        this.token,
        "PUT"
      ),
      this.context.cancellationToken,
      requestProcessor
    )
  }

  private resolveProjectId(): string {
    if (this.info.projectId) {
      return String(this.info.projectId)
    }

    throw new InvalidConfigurationError("GitLab project ID is not specified, please set it in configuration.")
  }

  private gitlabRequest<T>(url: URL, token: string | null, data: { [name: string]: any } | null = null, method: "GET" | "POST" | "PUT" | "DELETE" = "GET"): Promise<T> {

    return parseJson(
      httpExecutor.request(
        configureRequestOptions(
          {
            port: url.port,
            path: url.pathname,
            protocol: url.protocol,
            hostname: url.hostname,
            headers: { "Content-Type": "application/json" },
            timeout: this.info.timeout || undefined,
          },
          token,
          method
        ),
        this.context.cancellationToken,
        data
      )
    )
  }

  toString() {
    return `GitLab (project: ${this.projectId}, version: ${this.version})`
  }
}
