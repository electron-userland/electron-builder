import { Arch, Fields, httpExecutor, InvalidConfigurationError, isEmptyOrSpaces, isTokenCharValid, log } from "builder-util"
import { createReadStream } from "fs"
import { stat } from "fs/promises"
import { readFile } from "fs/promises"
import { configureRequestOptions, GitlabOptions, GitlabReleaseInfo, parseJson, HttpError } from "builder-util-runtime"
import { ClientRequest } from "http"
import { Lazy } from "lazy-val"
import * as mime from "mime"
import * as FormData from "form-data"
import { URL } from "url"
import { HttpPublisher } from "./httpPublisher"
import { PublishContext } from "./index"
import { trimStringWithWarn } from "./util"

type RequestProcessor = (request: ClientRequest, reject: (error: Error) => void) => void

export class GitlabPublisher extends HttpPublisher {
  private readonly tag: string
  readonly _release = new Lazy(() => (this.token === "__test__" ? Promise.resolve(null as any) : this.getOrCreateRelease()))

  private readonly token: string | null
  private readonly host: string
  private readonly baseApiPath: string
  private readonly projectId: string

  readonly providerName = "gitlab"

  private releaseLogFields: Fields | null = null

  constructor(
    context: PublishContext,
    private readonly info: GitlabOptions,
    private readonly version: string
  ) {
    super(context, true)

    let token = info.token || null
    if (isEmptyOrSpaces(token)) {
      token = process.env.GITLAB_TOKEN || null
      if (isEmptyOrSpaces(token)) {
        throw new InvalidConfigurationError(`GitLab Personal Access Token is not set, neither programmatically, nor using env "GITLAB_TOKEN"`)
      }

      token = token.trim()

      if (!isTokenCharValid(token)) {
        throw new InvalidConfigurationError(`GitLab Personal Access Token (${JSON.stringify(token)}) contains invalid characters, please check env "GITLAB_TOKEN"`)
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

    try {
      const existingRelease = await this.getExistingRelease()
      if (existingRelease) {
        return existingRelease
      }

      // Create new release if it doesn't exist
      return this.createRelease()
    } catch (error: any) {
      const errorInfo = this.categorizeGitlabError(error)
      log.error(
        {
          ...logFields,
          error: error.message,
          errorType: errorInfo.type,
          statusCode: errorInfo.statusCode,
        },
        "Failed to get or create GitLab release"
      )
      throw error
    }
  }

  private async getExistingRelease(): Promise<GitlabReleaseInfo | null> {
    const url = this.buildProjectUrl("/releases")
    const releases = await this.gitlabRequest<GitlabReleaseInfo[]>(url)

    for (const release of releases) {
      if (release.tag_name === this.tag) {
        return release
      }
    }

    return null
  }

  private async getDefaultBranch(): Promise<string> {
    try {
      const url = this.buildProjectUrl()
      const project = await this.gitlabRequest<{ default_branch: string }>(url)
      return project.default_branch || "main"
    } catch (error: any) {
      log.warn({ error: error.message }, "Failed to get default branch, using 'main' as fallback")
      return "main"
    }
  }

  private async createRelease(): Promise<GitlabReleaseInfo> {
    const defaultName = this.info.vPrefixedTagName === false ? this.version : `v${this.version}`
    const releaseName = this.info.releaseName || defaultName
    const branchName = await this.getDefaultBranch()

    const description = this.info.releaseBody
      ? trimStringWithWarn(this.info.releaseBody, 100000, "release body exceeds GitLab limit, truncating")
      : `Release ${releaseName}`

    const releaseData = {
      tag_name: this.tag,
      name: releaseName,
      description,
      ref: branchName,
    }

    log.debug(
      {
        tag: this.tag,
        name: releaseName,
        ref: branchName,
        projectId: this.projectId,
      },
      "creating GitLab release"
    )

    const url = this.buildProjectUrl("/releases")
    return this.gitlabRequest<GitlabReleaseInfo>(url, releaseData, "POST")
  }

  protected async doUpload(fileName: string, arch: Arch, dataLength: number, requestProcessor: RequestProcessor, filePath: string): Promise<any> {
    const release = await this._release.value
    if (release == null) {
      log.warn({ file: fileName, ...this.releaseLogFields }, "skipped publishing")
      return
    }

    const logFields = {
      file: fileName,
      arch: Arch[arch],
      size: dataLength,
      uploadTarget: this.info.uploadTarget || "project_upload",
    }

    try {
      log.debug(logFields, "starting GitLab upload")
      const assetPath = await this.uploadFileAndReturnAssetPath(fileName, dataLength, requestProcessor, filePath)
      // Add the uploaded file as a release asset link
      if (assetPath) {
        await this.addReleaseAssetLink(fileName, assetPath)
        log.info({ ...logFields, assetPath }, "GitLab upload completed successfully")
      } else {
        log.warn({ ...logFields }, "No asset URL found for file")
      }

      return assetPath
    } catch (e: any) {
      const errorInfo = this.categorizeGitlabError(e)
      log.error(
        {
          ...logFields,
          error: e.message,
          errorType: errorInfo.type,
          statusCode: errorInfo.statusCode,
        },
        "GitLab upload failed"
      )
      throw e
    }
  }

  private async uploadFileAndReturnAssetPath(fileName: string, dataLength: number, requestProcessor: RequestProcessor, filePath: string) {
    // Default to project_upload method
    const uploadTarget = this.info.uploadTarget || "project_upload"

    let assetPath: string
    if (uploadTarget === "generic_package") {
      await this.uploadToGenericPackages(fileName, dataLength, requestProcessor)
      // For generic packages, construct the download URL
      const projectId = encodeURIComponent(this.projectId)
      assetPath = `${this.baseApiPath}/projects/${projectId}/packages/generic/releases/${this.version}/${fileName}`
    } else {
      // Default to project_upload
      const uploadResult = await this.uploadToProjectUpload(fileName, filePath)
      // For project uploads, construct full URL from relative path
      assetPath = `https://${this.host}${uploadResult.full_path}`
    }

    return assetPath
  }

  private async addReleaseAssetLink(fileName: string, assetUrl: string): Promise<void> {
    try {
      const linkData = {
        name: fileName,
        url: assetUrl,
        link_type: "other",
      }

      const url = this.buildProjectUrl(`/releases/${this.tag}/assets/links`)
      await this.gitlabRequest(url, linkData, "POST")

      log.debug({ fileName, assetUrl }, "Successfully linked asset to GitLab release")
    } catch (e: any) {
      log.warn({ fileName, assetUrl, error: e.message }, "Failed to link asset to GitLab release")
      // Don't throw - the file was uploaded successfully, linking is optional
    }
  }

  private async uploadToProjectUpload(fileName: string, filePath: string): Promise<any> {
    const uploadUrl = `${this.baseApiPath}/projects/${encodeURIComponent(this.projectId)}/uploads`
    const parsedUrl = new URL(uploadUrl)

    // Check file size to determine upload method
    const stats = await stat(filePath)
    const fileSize = stats.size
    const STREAMING_THRESHOLD = 50 * 1024 * 1024 // 50MB

    const form = new FormData()
    if (fileSize > STREAMING_THRESHOLD) {
      // Use streaming for large files
      log.debug({ fileName, fileSize }, "using streaming upload for large file")
      const fileStream = createReadStream(filePath)
      form.append("file", fileStream, fileName)
    } else {
      // Use buffer for small files
      log.debug({ fileName, fileSize }, "using buffer upload for small file")
      const fileContent = await readFile(filePath)
      form.append("file", fileContent, fileName)
    }

    const response = await httpExecutor.doApiRequest(
      configureRequestOptions(
        {
          protocol: parsedUrl.protocol,
          hostname: parsedUrl.hostname,
          port: parsedUrl.port as any,
          path: parsedUrl.pathname,
          headers: { ...form.getHeaders(), ...this.setAuthHeaderForToken(this.token) },
          timeout: this.info.timeout || undefined,
        },
        null,
        "POST"
      ),
      this.context.cancellationToken,
      (it: ClientRequest) => form.pipe(it)
    )

    // Parse the JSON response string
    return JSON.parse(response)
  }

  private async uploadToGenericPackages(fileName: string, dataLength: number, requestProcessor: RequestProcessor): Promise<any> {
    const uploadUrl = `${this.baseApiPath}/projects/${encodeURIComponent(this.projectId)}/packages/generic/releases/${this.version}/${fileName}`
    const parsedUrl = new URL(uploadUrl)

    return httpExecutor.doApiRequest(
      configureRequestOptions(
        {
          protocol: parsedUrl.protocol,
          hostname: parsedUrl.hostname,
          port: parsedUrl.port as any,
          path: parsedUrl.pathname,
          headers: { "Content-Length": dataLength, "Content-Type": mime.getType(fileName) || "application/octet-stream", ...this.setAuthHeaderForToken(this.token) },
          timeout: this.info.timeout || undefined,
        },
        null,
        "PUT"
      ),
      this.context.cancellationToken,
      requestProcessor
    )
  }

  private buildProjectUrl(path: string = ""): URL {
    return new URL(`${this.baseApiPath}/projects/${encodeURIComponent(this.projectId)}${path}`)
  }

  private resolveProjectId(): string {
    if (this.info.projectId) {
      return String(this.info.projectId)
    }

    throw new InvalidConfigurationError("GitLab project ID is not specified, please set it in configuration.")
  }

  private gitlabRequest<T>(url: URL, data: { [name: string]: any } | null = null, method: "GET" | "POST" | "PUT" | "DELETE" = "GET"): Promise<T> {
    return parseJson(
      httpExecutor.request(
        configureRequestOptions(
          {
            port: url.port,
            path: url.pathname,
            protocol: url.protocol,
            hostname: url.hostname,
            headers: { "Content-Type": "application/json", ...this.setAuthHeaderForToken(this.token) },
            timeout: this.info.timeout || undefined,
          },
          null,
          method
        ),
        this.context.cancellationToken,
        data
      )
    )
  }

  private setAuthHeaderForToken(token: string | null): { [key: string]: string } {
    const headers: { [key: string]: string } = {}

    if (token != null) {
      // If the token starts with "Bearer", it is an OAuth application secret
      // Note that the original gitlab token would not start with "Bearer"
      // it might start with "gloas-", if so user needs to add "Bearer " prefix to the token
      if (token.startsWith("Bearer")) {
        headers.authorization = token
      } else {
        headers["PRIVATE-TOKEN"] = token
      }
    }

    return headers
  }

  private categorizeGitlabError(error: any): { type: string; statusCode?: number } {
    if (error instanceof HttpError) {
      const statusCode = error.statusCode

      switch (statusCode) {
        case 401:
          return { type: "authentication", statusCode }
        case 403:
          return { type: "authorization", statusCode }
        case 404:
          return { type: "not_found", statusCode }
        case 409:
          return { type: "conflict", statusCode }
        case 413:
          return { type: "file_too_large", statusCode }
        case 422:
          return { type: "validation_error", statusCode }
        case 429:
          return { type: "rate_limit", statusCode }
        case 500:
        case 502:
        case 503:
        case 504:
          return { type: "server_error", statusCode }
        default:
          return { type: "http_error", statusCode }
      }
    }

    if (error.code === "ECONNRESET" || error.code === "ENOTFOUND" || error.code === "ETIMEDOUT") {
      return { type: "network_error" }
    }

    return { type: "unknown_error" }
  }

  toString() {
    return `GitLab (project: ${this.projectId}, version: ${this.version})`
  }
}
