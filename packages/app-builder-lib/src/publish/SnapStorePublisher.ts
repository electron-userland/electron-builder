import { Publisher, UploadTask, PublishContext } from "electron-publish"
import { executeAppBuilder } from "builder-util"
import * as path from "path"
import { PublishConfiguration } from "builder-util-runtime"

export class SnapStorePublisher extends Publisher {
  readonly providerName = "snapStore"

  constructor(context: PublishContext, private options: SnapStoreOptions) {
    super(context)
  }

  upload(task: UploadTask): Promise<any> {
    this.createProgressBar(path.basename(task.file), -1)

    const args = ["publish-snap", "-f", task.file]

    let channels = this.options.channels
    if (channels == null) {
      channels = ["edge"]
    }
    else {
      if (typeof channels === "string") {
        channels = channels.split(",")
      }
    }

    for (const channel of channels) {
      args.push("-c", channel)
    }

    return executeAppBuilder(args)
  }

  toString(): string {
    return "Snap Store"
  }
}

/**
 * [Snap Store](https://snapcraft.io/) options.
 */
export interface SnapStoreOptions extends PublishConfiguration {
  /**
   * The list of channels the snap would be released.
   * @default ["edge"]
   */
  readonly channels?: string | Array<string> | null
}