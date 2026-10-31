import { InvalidConfigurationError, isEmptyOrSpaces } from "builder-util"
import { SpacesOptions } from "builder-util-runtime"
import { PublishContext } from "../index.js"
import { BaseS3Publisher, S3UploadConfig } from "./baseS3Publisher.js"

// DigitalOcean region slugs (nyc3, ams3, fra1, ...). The region becomes the endpoint host, so nothing else may get through.
const SPACES_REGION_PATTERN = /^[a-z]{3}[0-9]{1,2}$/

export class SpacesPublisher extends BaseS3Publisher {
  readonly providerName = "spaces"

  constructor(
    context: PublishContext,
    private readonly info: SpacesOptions
  ) {
    super(context, info)
  }

  static checkAndResolveOptions(options: SpacesOptions, channelFromAppVersion: string | null, _errorIfCannot: boolean) {
    if (options.name == null) {
      throw new InvalidConfigurationError(`Please specify "name" for "spaces" publish provider (see https://www.electron.build/docs/publish#spaces)`)
    }
    if (options.region == null) {
      throw new InvalidConfigurationError(`Please specify "region" for "spaces" publish provider (see https://www.electron.build/docs/publish#spaces)`)
    }
    SpacesPublisher.checkRegion(options.region)

    if (options.channel == null && channelFromAppVersion != null) {
      options.channel = channelFromAppVersion
    }
    return Promise.resolve()
  }

  private static checkRegion(region: string) {
    if (!SPACES_REGION_PATTERN.test(region)) {
      throw new InvalidConfigurationError(
        `Invalid "region" ${JSON.stringify(region)} for "spaces" publish provider: expected a DigitalOcean region slug such as "nyc3" (see https://www.electron.build/docs/publish#spaces)`
      )
    }
  }

  protected getBucketName(): string {
    return this.info.name
  }

  public getS3UploadConfig(): S3UploadConfig {
    SpacesPublisher.checkRegion(this.info.region)
    const accessKey = process.env.DO_KEY_ID
    const secretKey = process.env.DO_SECRET_KEY
    if (isEmptyOrSpaces(accessKey)) {
      throw new InvalidConfigurationError("Please set env DO_KEY_ID (see https://www.electron.build/docs/publish#spaces)")
    }
    if (isEmptyOrSpaces(secretKey)) {
      throw new InvalidConfigurationError("Please set env DO_SECRET_KEY (see https://www.electron.build/docs/publish#spaces)")
    }
    return {
      region: this.info.region,
      endpoint: `https://${this.info.region}.digitaloceanspaces.com`,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    }
  }
}
