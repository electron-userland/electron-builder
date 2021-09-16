import { Arch, InvalidConfigurationError, isEmptyOrSpaces } from "builder-util"
import { httpExecutor } from "builder-util/out/nodeHttpExecutor"
import { ClientRequest, RequestOptions } from "http"
import { HttpPublisher, PublishContext } from "electron-publish"
import { BitbucketOptions } from "builder-util-runtime/out/publishOptions"
import { configureRequestOptions, HttpExecutor } from "builder-util-runtime"
import * as FormData from "form-data"
import { readFile } from "fs/promises"
export class BitbucketPublisher extends HttpPublisher {
  readonly providerName = "Bitbucket"
  readonly hostname = "api.bitbucket.org"

  private readonly info: BitbucketOptions
  private readonly auth: string
  private readonly basePath: string

  constructor(context: PublishContext, info: BitbucketOptions) {
    super(context)

    const token = process.env.BITBUCKET_TOKEN
    if (isEmptyOrSpaces(token)) {
      throw new InvalidConfigurationError(`Bitbucket token is not set using env "BITBUCKET_TOKEN" (see https://www.electron.build/configuration/publish#BitbucketOptions)`)
    }
    this.info = info
    this.auth = BitbucketPublisher.convertAppPassword(this.info.owner, token)
    this.basePath = `/2.0/repositories/${this.info.owner}/${this.info.repo}/downloads`
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
    const { owner, repo, channel } = this.info
    return `Bitbucket (owner: ${owner}, repo: ${repo}, channel: ${channel})`
  }

  static convertAppPassword(owner: string, token: string) {
    const base64encodedData = Buffer.from(`${owner}:${token.trim()}`).toString("base64")
    return `Basic ${base64encodedData}`
  }
}
