import { exec, executeAppBuilder } from "builder-util"
import { checkSnapcraftVersion } from "builder-util/out/snap"
import { SnapStoreOptions } from "builder-util-runtime/out/publishOptions"
import * as path from "path"
import { PublishContext, UploadTask } from "."
import { Publisher } from "./publisher"

export class SnapStorePublisher extends Publisher {
  readonly providerName = "snapStore"

  constructor(
    context: PublishContext,
    private options: SnapStoreOptions
  ) {
    super(context)
  }

  upload(task: UploadTask): Promise<any> {
    this.createProgressBar(path.basename(task.file), -1)

    let channels = this.options.channels
    if (channels == null) {
      channels = ["edge"]
    } else {
      if (typeof channels === "string") {
        channels = channels.split(",")
      }
    }

    return this.publishToStore(task.file, channels)
  }

  toString(): string {
    return "Snap Store"
  }

  async publishToStore(file: string, channels: string[]): Promise<void> {
    const args = ["upload", file]
    if (channels.length > 0) {
      args.push("--release", channels.join(","))
    }

    await checkSnapcraftVersion()
    await exec("snapcraft", args)
  }
}
