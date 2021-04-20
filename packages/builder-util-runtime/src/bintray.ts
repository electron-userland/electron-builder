import { CancellationToken } from "./CancellationToken"
import { configureRequestOptions, HttpExecutor, parseJson, RequestHeaders } from "./httpExecutor"
import { BintrayOptions } from "./publishOptions"

export interface Version {
  readonly name: string
  //noinspection ReservedWordAsName
  readonly package: string
}

export interface File {
  name: string
  path: string

  sha1: string
  sha256: string
}

export class BintrayClient {
  private readonly basePath: string
  readonly auth: string | null
  readonly repo: string

  readonly owner: string
  readonly user: string
  readonly component: string | null
  readonly distribution: string | null
  readonly packageName: string

  private requestHeaders: RequestHeaders | null = null

  setRequestHeaders(value: RequestHeaders | null) {
    this.requestHeaders = value
  }

  constructor(options: BintrayOptions, private readonly httpExecutor: HttpExecutor<any>, private readonly cancellationToken: CancellationToken, apiKey?: string | null) {
    if (options.owner == null) {
      throw new Error("owner is not specified")
    }
    if (options.package == null) {
      throw new Error("package is not specified")
    }

    this.repo = options.repo || "generic"
    this.packageName = options.package
    this.owner = options.owner
    this.user = options.user || options.owner
    this.component = options.component || null
    this.distribution = options.distribution || "stable"
    this.auth = apiKey == null ? null : `Basic ${Buffer.from(`${this.user}:${apiKey}`).toString("base64")}`
    this.basePath = `/packages/${this.owner}/${this.repo}/${this.packageName}`
  }

  private bintrayRequest<T>(
    path: string,
    auth: string | null,
    data: { [name: string]: any } | null = null,
    cancellationToken: CancellationToken,
    method?: "GET" | "DELETE" | "PUT"
  ): Promise<T> {
    return parseJson(
      this.httpExecutor.request(configureRequestOptions({ hostname: "api.bintray.com", path, headers: this.requestHeaders || undefined }, auth, method), cancellationToken, data)
    )
  }

  getVersion(version: string): Promise<Version> {
    return this.bintrayRequest(`${this.basePath}/versions/${version}`, this.auth, null, this.cancellationToken)
  }

  getVersionFiles(version: string): Promise<Array<File>> {
    return this.bintrayRequest<Array<File>>(`${this.basePath}/versions/${version}/files`, this.auth, null, this.cancellationToken)
  }

  createVersion(version: string): Promise<any> {
    return this.bintrayRequest<Version>(
      `${this.basePath}/versions`,
      this.auth,
      {
        name: version,
      },
      this.cancellationToken
    )
  }

  deleteVersion(version: string): Promise<any> {
    return this.bintrayRequest(`${this.basePath}/versions/${version}`, this.auth, null, this.cancellationToken, "DELETE")
  }
}
