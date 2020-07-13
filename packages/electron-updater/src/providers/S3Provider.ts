import { s3Url, UpdateInfo } from "builder-util-runtime"
import { OutgoingHttpHeaders, RequestOptions } from "http"
import aws4 from "aws4"
import { AppUpdater } from "../AppUpdater"
import { newBaseUrl, ResolvedUpdateFileInfo } from "../main"
import { getGenericLatestVersion, Provider, ProviderRuntimeOptions, resolveFiles } from "./Provider"

export interface S3ProviderOptions {
  readonly channel: string | null
  readonly bucket: string
  readonly region?: string | null
  readonly endpoint?: string | null
  readonly path?: string | null
  readonly awsAccessKeyId?: string
  readonly awsSecretAccessKey?: string
}

export class S3Provider extends Provider<UpdateInfo> {
  protected baseUrl = newBaseUrl(s3Url(this.configuration.bucket, this.configuration.region, this.configuration.path, this.configuration.endpoint))

  constructor(protected readonly configuration: S3ProviderOptions, protected readonly updater: AppUpdater, runtimeOptions: ProviderRuntimeOptions) {
    super(runtimeOptions)
  }

  get isUseMultipleRangeRequest(): boolean {
    return false
  }

  createRequestOptions(url: URL | string, headers?: OutgoingHttpHeaders): RequestOptions {
    const parsedUrl: URL = url instanceof URL ? url : new URL(url)
    const requestOptions: RequestOptions = super.createRequestOptions(parsedUrl, headers)

    if (!(this.configuration.awsAccessKeyId && this.configuration.awsSecretAccessKey)) {
      return requestOptions
    }

    const opts: any = {
      service: "s3",
      region: this.configuration.region,
      method: "GET",
      host: parsedUrl.hostname,
      path: parsedUrl.pathname,
      headers: {
        ...requestOptions.headers,
        "User-Agent": "Battp",
        "Cache-Control": "no-cache",
      }
    }

    aws4.sign(opts, {
      accessKeyId: this.configuration.awsAccessKeyId,
      secretAccessKey: this.configuration.awsSecretAccessKey
    })

    requestOptions.headers = {...opts.headers}

    delete requestOptions.headers?.Host

    return requestOptions
  }

  protected get channel(): string {
    const result = this.updater.channel || this.configuration.channel
    return result == null ? this.getDefaultChannelName() : this.getCustomChannelName(result)
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    return getGenericLatestVersion(this, this.channel, this.baseUrl);
  }

  resolveFiles(updateInfo: UpdateInfo): Array<ResolvedUpdateFileInfo> {
    return resolveFiles(updateInfo, this.baseUrl)
  }
}