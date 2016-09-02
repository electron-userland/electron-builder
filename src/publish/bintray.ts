import { bintrayRequest } from "./restApiRequest"

//noinspection ReservedWordAsName
export interface Version {
  readonly name: string
  readonly package: string
}

export class BintrayClient {
  private readonly basePath: string
  readonly auth: string | null

  constructor(public user: string, public packageName: string, public repo: string = "generic", apiKey?: string | null) {
    this.auth = apiKey == null ? null : `Basic ${new Buffer(`${user}:${apiKey}`).toString("base64")}`
    this.basePath = `/packages/${this.user}/${this.repo}/${this.packageName}`
  }

  getVersion(version: string): Promise<Version> {
    return bintrayRequest<Version>(`${this.basePath}/versions/${version}`, this.auth)
  }

  createVersion(version: string): Promise<any> {
    return bintrayRequest<Version>(`${this.basePath}/versions`, this.auth, {
      name: version,
    })
  }

  deleteVersion(version: string): Promise<any> {
    return bintrayRequest(`/packages/${this.user}/${this.repo}/${this.packageName}/versions/${version}`, this.auth, null, "DELETE")
  }
}