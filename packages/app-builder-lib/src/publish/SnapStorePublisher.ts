import { Publisher, UploadTask, PublishContext } from "electron-publish"
import { executeAppBuilder } from "builder-util"
import * as path from "path"
import { SnapStoreOptions } from "builder-util-runtime/out/publishOptions"

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
    } else {
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
