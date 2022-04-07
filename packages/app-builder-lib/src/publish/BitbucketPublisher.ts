import { Arch, InvalidConfigurationError, isEmptyOrSpaces, log } from "builder-util"
import { httpExecutor } from "builder-util/out/nodeHttpExecutor"
import { ClientRequest, RequestOptions } from "http"
import { HttpPublisher, PublishContext } from "electron-publish"
import { BitbucketOptions } from "builder-util-runtime/out/publishOptions"
import { configureRequestOptions, HttpExecutor } from "builder-util-runtime"
import * as FormData from "form-data"
import { readFile } from "fs-extra"

export class BitbucketPublisher extends HttpPublisher {
  readonly providerName = "bitbucket"
  readonly hostname = "api.bitbucket.org"

  private readonly info: BitbucketOptions
  private readonly auth: string
  private readonly basePath: string

  constructor(context: PublishContext, info: BitbucketOptions) {
    super(context)

    const token = info.token || process.env.BITBUCKET_TOKEN || null
    const username = info.username || process.env.BITBUCKET_USERNAME || null

    if (isEmptyOrSpaces(token)) {
      throw new InvalidConfigurationError(`Bitbucket token is not set using env "BITBUCKET_TOKEN" (see https://www.electron.build/configuration/publish#BitbucketOptions)`)
    }

    if (isEmptyOrSpaces(username)) {
      log.warn('No Bitbucket username provided via "BITBUCKET_USERNAME". Defaulting to use repo owner.')
    }

    this.info = info
    this.auth = BitbucketPublisher.convertAppPassword(username ?? this.info.owner, token)
    this.basePath = `/2.0/repositories/${this.info.owner}/${this.info.slug}/downloads`
  }

  protected doUpload(
    fileName: string,
    _arch: Arch,
    _dataLength: number,
    _requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void,
    file: string
  ): Promise<any> {
    return HttpExecutor.retryOnServerError(async () => {
      const fileContent = await readFile(file)
      const form = new FormData()
      form.append("files", fileContent, fileName)
      const upload: RequestOptions = {
        hostname: this.hostname,
        path: this.basePath,
        headers: form.getHeaders(),
      }
      await httpExecutor.doApiRequest(configureRequestOptions(upload, this.auth, "POST"), this.context.cancellationToken, it => form.pipe(it))
      return fileName
    })
  }

  async deleteRelease(filename: string): Promise<void> {
    const req: RequestOptions = {
      hostname: this.hostname,
      path: `${this.basePath}/${filename}`,
    }
    await httpExecutor.request(configureRequestOptions(req, this.auth, "DELETE"), this.context.cancellationToken)
  }

  toString() {
    const { owner, slug, channel } = this.info
    return `Bitbucket (owner: ${owner}, slug: ${slug}, channel: ${channel})`
  }

  static convertAppPassword(username: string, token: string) {
    const base64encodedData = Buffer.from(`${username}:${token.trim()}`).toString("base64")
    return `Basic ${base64encodedData}`
  }
}
