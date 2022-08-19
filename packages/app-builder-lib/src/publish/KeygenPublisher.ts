import { Arch, InvalidConfigurationError, log, isEmptyOrSpaces } from "builder-util"
import { httpExecutor } from "builder-util/out/nodeHttpExecutor"
import { ClientRequest, RequestOptions } from "http"
import { HttpPublisher, PublishContext } from "electron-publish"
import { KeygenOptions } from "builder-util-runtime/out/publishOptions"
import { configureRequestOptions, HttpExecutor, parseJson } from "builder-util-runtime"
import { getCompleteExtname } from "../util/filename"

type RecursivePartial<T> = {
  [P in keyof T]?: RecursivePartial<T[P]>
}

export interface KeygenError {
  title: string
  detail: string
  code: string
}

export interface KeygenRelease {
  id: string
  type: "releases"
  attributes: {
    name: string | null
    description: string | null
    channel: "stable" | "rc" | "beta" | "alpha" | "dev"
    status: "DRAFT" | "PUBLISHED" | "YANKED"
    tag: string
    version: string
    semver: {
      major: number
      minor: number
      patch: number
      prerelease: string | null
      build: string | null
    }
    metadata: { [s: string]: any }
    created: string
    updated: string
    yanked: string | null
  }
  relationships: {
    account: {
      data: { type: "accounts"; id: string }
    }
    product: {
      data: { type: "products"; id: string }
    }
  }
}

export interface KeygenArtifact {
  id: string
  type: "artifacts"
  attributes: {
    filename: string
    filetype: string | null
    filesize: number | null
    platform: string | null
    arch: string | null
    signature: string | null
    checksum: string | null
    status: "WAITING" | "UPLOADED" | "FAILED" | "YANKED"
    metadata: { [s: string]: any }
    created: string
    updated: string
  }
  relationships: {
    account: {
      data: { type: "accounts"; id: string }
    }
    release: {
      data: { type: "releases"; id: string }
    }
  }
  links: {
    redirect: string
  }
}

export class KeygenPublisher extends HttpPublisher {
  readonly providerName = "keygen"
  readonly hostname = "api.keygen.sh"

  private readonly info: KeygenOptions
  private readonly auth: string
  private readonly version: string
  private readonly basePath: string

  constructor(context: PublishContext, info: KeygenOptions, version: string) {
    super(context)

    const token = process.env.KEYGEN_TOKEN
    if (isEmptyOrSpaces(token)) {
      throw new InvalidConfigurationError(`Keygen token is not set using env "KEYGEN_TOKEN" (see https://www.electron.build/configuration/publish#KeygenOptions)`)
    }

    this.info = info
    this.auth = `Bearer ${token.trim()}`
    this.version = version
    this.basePath = `/v1/accounts/${this.info.account}`
  }

  protected doUpload(
    fileName: string,
    _arch: Arch,
    dataLength: number,
    requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _file: string
  ): Promise<string> {
    return HttpExecutor.retryOnServerError(async () => {
      const { data, errors } = await this.getOrCreateRelease()
      if (errors) {
        throw new Error(`Keygen - Creating release returned errors: ${JSON.stringify(errors)}`)
      }

      await this.uploadArtifact(data!.id, fileName, dataLength, requestProcessor)

      return data!.id
    })
  }

  private async uploadArtifact(
    releaseId: any,
    fileName: string,
    dataLength: number,
    requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void
  ): Promise<void> {
    const { data, errors } = await this.createArtifact(releaseId, fileName, dataLength)
    if (errors) {
      throw new Error(`Keygen - Creating artifact returned errors: ${JSON.stringify(errors)}`)
    }

    // Follow the redirect and upload directly to S3-equivalent storage provider
    const url = new URL(data!.links.redirect)
    const upload: RequestOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        "Content-Length": dataLength,
      },
      timeout: this.info.timeout || undefined,
    }

    await httpExecutor.doApiRequest(configureRequestOptions(upload, null, "PUT"), this.context.cancellationToken, requestProcessor)
  }

  private async createArtifact(releaseId: any, fileName: string, dataLength: number): Promise<{ data?: KeygenArtifact; errors?: KeygenError[] }> {
    const upload: RequestOptions = {
      hostname: this.hostname,
      path: `${this.basePath}/artifacts`,
      headers: {
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
        "Keygen-Version": "1.1",
        Prefer: "no-redirect",
      },
      timeout: this.info.timeout || undefined,
    }

    const data: RecursivePartial<KeygenArtifact> = {
      type: "artifacts",
      attributes: {
        filename: fileName,
        filetype: getCompleteExtname(fileName),
        filesize: dataLength,
        platform: this.info.platform,
      },
      relationships: {
        release: {
          data: {
            type: "releases",
            id: releaseId,
          },
        },
      },
    }

    log.debug({ data: JSON.stringify(data) }, "Keygen create artifact")

    return parseJson(httpExecutor.request(configureRequestOptions(upload, this.auth, "POST"), this.context.cancellationToken, { data }))
  }

  private async getOrCreateRelease(): Promise<{ data?: KeygenRelease; errors?: KeygenError[] }> {
    try {
      // First, we'll attempt to fetch the release.
      return await this.getRelease()
    } catch (e: any) {
      if (e.statusCode !== 404) {
        throw e
      }

      try {
        // Next, if the release doesn't exist, we'll attempt to create it.
        return await this.createRelease()
      } catch (e: any) {
        if (e.statusCode !== 409 && e.statusCode !== 422) {
          throw e
        }

        // Lastly, when a conflict occurs (in the case of parallel uploads),
        // we'll try to fetch it one last time.
        return this.getRelease()
      }
    }
  }

  private async getRelease(): Promise<{ data?: KeygenRelease; errors?: KeygenError[] }> {
    const req: RequestOptions = {
      hostname: this.hostname,
      path: `${this.basePath}/releases/${this.version}?product=${this.info.product}`,
      headers: {
        Accept: "application/vnd.api+json",
        "Keygen-Version": "1.1",
      },
      timeout: this.info.timeout || undefined,
    }

    return parseJson(httpExecutor.request(configureRequestOptions(req, this.auth, "GET"), this.context.cancellationToken, null))
  }

  private async createRelease(): Promise<{ data?: KeygenRelease; errors?: KeygenError[] }> {
    const req: RequestOptions = {
      hostname: this.hostname,
      path: `${this.basePath}/releases`,
      headers: {
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
        "Keygen-Version": "1.1",
      },
      timeout: this.info.timeout || undefined,
    }

    const data: RecursivePartial<KeygenRelease> = {
      type: "releases",
      attributes: {
        version: this.version,
        channel: this.info.channel || "stable",
        status: "PUBLISHED",
      },
      relationships: {
        product: {
          data: {
            type: "products",
            id: this.info.product,
          },
        },
      },
    }

    log.debug({ data: JSON.stringify(data) }, "Keygen create release")

    return parseJson(httpExecutor.request(configureRequestOptions(req, this.auth, "POST"), this.context.cancellationToken, { data }))
  }

  async deleteRelease(releaseId: string): Promise<void> {
    const req: RequestOptions = {
      hostname: this.hostname,
      path: `${this.basePath}/releases/${releaseId}`,
      headers: {
        Accept: "application/vnd.api+json",
        "Keygen-Version": "1.1",
      },
      timeout: this.info.timeout || undefined,
    }
    await httpExecutor.request(configureRequestOptions(req, this.auth, "DELETE"), this.context.cancellationToken)
  }

  toString() {
    const { account, product, platform } = this.info
    return `Keygen (account: ${account}, product: ${product}, platform: ${platform}, version: ${this.version})`
  }
}
