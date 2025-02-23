import { exec } from "builder-util"
import { checkSnapcraftVersion } from "./snapBuilder"

export async function publishToStore(file: string, channels: string[]): Promise<void> {
  const args = ["upload", file]
  if (channels.length > 0) {
    args.push("--release", channels.join(","))
  }

  await checkSnapcraftVersion()
  await exec("snapcraft", args)
}
