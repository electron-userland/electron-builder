import { BintrayOptions } from "../options/publishOptions"
import { request } from "../util/httpExecutor"
export { HttpError, request } from "../util/httpExecutor"

export function bintrayRequest<T>(path: string, auth: string | null, data: {[name: string]: any; } | null = null, method: string = "GET"): Promise<T> {
  return request<T>({hostname: "api.bintray.com", path: path}, auth, data, method)
}

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
  private readonly user: string
  readonly packageName: string

  constructor(options: BintrayOptions, apiKey?: string | null) {
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
    this.auth = apiKey == null ? null : `Basic ${new Buffer(`${this.user}:${apiKey}`).toString("base64")}`
    this.basePath = `/packages/${this.owner}/${this.repo}/${this.packageName}`
  }

  getVersion(version: string): Promise<Version> {
    return bintrayRequest<Version>(`${this.basePath}/versions/${version}`, this.auth)
  }

  getVersionFiles(version: string): Promise<Array<File>> {
    return bintrayRequest<Array<File>>(`${this.basePath}/versions/${version}/files`, this.auth)
  }

  createVersion(version: string): Promise<any> {
    return bintrayRequest<Version>(`${this.basePath}/versions`, this.auth, {
      name: version,
    })
  }

  deleteVersion(version: string): Promise<any> {
    return bintrayRequest(`${this.basePath}/versions/${version}`, this.auth, null, "DELETE")
  }
}