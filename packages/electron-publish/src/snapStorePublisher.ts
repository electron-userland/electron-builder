import { exec, loadCscLink, spawn } from "builder-util"
import { SnapStoreOptions } from "builder-util-runtime/out/publishOptions"
import * as path from "path"
import { PublishContext, UploadTask } from "."
import { Publisher } from "./publisher"

export class SnapStorePublisher extends Publisher {
  readonly providerName = "snapStore"

  constructor(
    readonly context: PublishContext,
    private readonly options: SnapStoreOptions,
    private readonly credentials: {
      cscLink: string | undefined
      resourcesDir: string
    }
  ) {
    super(context)
  }

  async upload(task: UploadTask): Promise<any> {
    this.createProgressBar(path.basename(task.file), -1)

    await checkSnapcraft()

    const credEnv = await resolveSnapCredentials(this.credentials.cscLink, this.credentials.resourcesDir)

    let channels = this.options.channels ?? ["edge"]
    if (typeof channels === "string") {
      channels = channels.split(",")
    }

    const args = ["upload", task.file]
    if (channels.length > 0) {
      args.push("--release", channels.join(","))
    }

    return spawn("snapcraft", args, {
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, ...credEnv },
    })
  }

  toString(): string {
    return "Snap Store"
  }
}

export async function resolveSnapCredentials(cscLink: string | undefined, resourcesDir: string | undefined): Promise<Record<string, string>> {
  const link = (cscLink ?? process.env.SNAP_CSC_LINK)?.trim()
  if (!link) {
    return {}
  }

  const credentials = await loadCscLink(link, resourcesDir)
  const trimmed = credentials.trim()
  if (!trimmed) {
    throw new Error("Resolved snap store credentials are empty")
  }
  return { SNAPCRAFT_STORE_CREDENTIALS: trimmed }
}

async function checkSnapcraft(): Promise<void> {
  const installMessage = process.platform === "darwin" ? "brew install snapcraft" : "sudo snap install snapcraft --classic"

  let versionOutput: string
  try {
    versionOutput = await exec("snapcraft", ["--version"])
  } catch {
    throw new Error(`snapcraft is not installed, please: ${installMessage}`)
  }

  const trimmed = versionOutput.trim()
  if (trimmed === "snapcraft, version edge") {
    return
  }

  // Parse "snapcraft, version X.Y.Z" or "snapcraft X.Y.Z"
  let s = trimmed.replace(/^snapcraft/, "").trim()
  s = s.replace(/^,/, "").trim()
  s = s.replace(/^version/, "").trim()
  s = s.replace(/^'|'$/g, "")

  const major = parseInt(s.split(".")[0], 10)
  if (major < 4) {
    throw new Error(`at least snapcraft 4.0.0 is required, but ${trimmed} installed, please: ${installMessage}`)
  }
}
