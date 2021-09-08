import { Arch, InvalidConfigurationError, log, isEmptyOrSpaces } from "builder-util"
import { httpExecutor } from "builder-util/out/nodeHttpExecutor"
import { ClientRequest, RequestOptions } from "http"
import { HttpPublisher, PublishContext } from "electron-publish"
import { KeygenOptions } from "builder-util-runtime/out/publishOptions"
import { configureRequestOptions, HttpExecutor, parseJson } from "builder-util-runtime"
import { getCompleteExtname } from "../util/filename"

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
    this.basePath = `/v1/accounts/${this.info.account}/releases`
  }

  protected doUpload(
    fileName: string,
    _arch: Arch,
    dataLength: number,
    requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _file: string
  ): Promise<any> {
    return HttpExecutor.retryOnServerError(async () => {
      const { data, errors } = await this.upsertRelease(fileName, dataLength)
      if (errors) {
        throw new Error(`Keygen - Upserting release returned errors: ${JSON.stringify(errors)}`)
      }
      const releaseId = data?.id
      if (!releaseId) {
        log.warn({ file: fileName, reason: "UUID doesn't exist and was not created" }, "upserting release failed")
        throw new Error(`Keygen - Upserting release returned no UUID: ${JSON.stringify(data)}`)
      }
      await this.uploadArtifact(releaseId, dataLength, requestProcessor)
      return releaseId
    })
  }

  private async uploadArtifact(releaseId: any, dataLength: number, requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void) {
    const upload: RequestOptions = {
      hostname: this.hostname,
      path: `${this.basePath}/${releaseId}/artifact`,
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Length": dataLength,
      },
    }
    await httpExecutor.doApiRequest(configureRequestOptions(upload, this.auth, "PUT"), this.context.cancellationToken, requestProcessor)
  }

  private async upsertRelease(fileName: string, dataLength: number): Promise<{ data: any; errors: any }> {
    const req: RequestOptions = {
      hostname: this.hostname,
      method: "PUT",
      path: this.basePath,
      headers: {
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
      },
    }
    const data = {
      data: {
        type: "release",
        attributes: {
          filename: fileName,
          filetype: getCompleteExtname(fileName),
          filesize: dataLength,
          version: this.version,
          platform: this.info.platform,
          channel: this.info.channel || "stable",
        },
        relationships: {
          product: {
            data: {
              type: "product",
              id: this.info.product,
            },
          },
        },
      },
    }
    log.debug({ data: JSON.stringify(data) }, "Keygen upsert release")
    return parseJson(httpExecutor.request(configureRequestOptions(req, this.auth, "PUT"), this.context.cancellationToken, data))
  }

  async deleteRelease(releaseId: string): Promise<void> {
    const req: RequestOptions = {
      hostname: this.hostname,
      path: `${this.basePath}/${releaseId}`,
      headers: {
        Accept: "application/vnd.api+json",
      },
    }
    await httpExecutor.request(configureRequestOptions(req, this.auth, "DELETE"), this.context.cancellationToken)
  }

  toString() {
    const { account, product, platform } = this.info
    return `Keygen (account: ${account}, product: ${product}, platform: ${platform}, version: ${this.version})`
  }
}
