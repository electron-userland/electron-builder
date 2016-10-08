import { bintrayRequest } from "./restApiRequest"

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

  constructor(public owner: string, public packageName: string, repo?: string, apiKey?: string | null) {
    if (owner == null) {
      throw new Error("owner is not specified")
    }
    if (packageName == null) {
      throw new Error("package is not specified")
    }

    this.repo = repo || "generic"
    this.auth = apiKey == null ? null : `Basic ${new Buffer(`${owner}:${apiKey}`).toString("base64")}`
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
    return bintrayRequest(`/packages/${this.owner}/${this.repo}/${this.packageName}/versions/${version}`, this.auth, null, "DELETE")
  }
}