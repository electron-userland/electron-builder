import { exec, loadCscLink, spawn } from "builder-util"
import { SnapStoreOptions } from "builder-util-runtime"
import * as path from "path"
import { PublishContext, UploadTask } from "./index.js"
import { Publisher } from "./publisher.js"

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

    // Credentials are injected via SNAPCRAFT_STORE_CREDENTIALS so that the
    // snapcraft subprocess authenticates without an interactive login session.
    // Generate credentials with: snapcraft export-login -
    // https://documentation.ubuntu.com/snapcraft/stable/how-to/publishing/authenticate/
    const credEnv = await resolveSnapCredentials(this.credentials.cscLink, this.credentials.resourcesDir)

    // Channel format: [<track>/]<risk>[/<branch>]  e.g. "stable", "edge", "lts/stable"
    // Multiple channels are comma-separated: "beta,edge"
    let channels = this.options.channels ?? ["edge"]
    if (typeof channels === "string") {
      channels = channels.split(",")
    }

    // `snapcraft upload <snap-file> --release <channels>` uploads the snap and
    // immediately releases it to the specified channels upon store review.
    // https://documentation.ubuntu.com/snapcraft/stable/reference/commands/upload/
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

// Resolves Snap Store credentials from cscLink / SNAP_CSC_LINK and returns
// them as { SNAPCRAFT_STORE_CREDENTIALS } so they can be injected into the
// snapcraft subprocess environment. The value is the raw export-login output
// (base64-encoded or a file path handled by loadCscLink).
// https://documentation.ubuntu.com/snapcraft/stable/how-to/publishing/authenticate/
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

// Snapcraft 7 introduced SNAPCRAFT_STORE_CREDENTIALS as the standard
// non-interactive credential mechanism. Earlier versions used a different
// auth format that is no longer compatible with this publisher.
// https://documentation.ubuntu.com/snapcraft/stable/how-to/publishing/authenticate/
const REQUIRED_SNAPCRAFT_MAJOR = 7

async function checkSnapcraft(): Promise<void> {
  const installMessage = process.platform === "darwin" ? "brew install snapcraft" : "sudo snap install snapcraft --classic"

  let versionOutput: string
  try {
    versionOutput = await exec("snapcraft", ["--version"])
  } catch {
    throw new Error(`snapcraft is not installed, please: ${installMessage}`)
  }

  const trimmed = versionOutput.trim()
  // Edge-channel installs report "snapcraft, version edge" with no semver — skip the check.
  if (trimmed === "snapcraft, version edge") {
    return
  }

  // Handles both output formats:
  //   "snapcraft, version X.Y.Z"  (snapcraft ≤ 6)
  //   "snapcraft X.Y.Z"           (snapcraft 7+)
  let s = trimmed.replace(/^snapcraft/, "").trim()
  s = s.replace(/^,/, "").trim()
  s = s.replace(/^version/, "").trim()
  s = s.replace(/^'|'$/g, "")

  const major = parseInt(s.split(".")[0], 10)
  if (!Number.isFinite(major) || major < REQUIRED_SNAPCRAFT_MAJOR) {
    throw new Error(`at least snapcraft ${REQUIRED_SNAPCRAFT_MAJOR}.0.0 is required, but ${trimmed} installed, please: ${installMessage}`)
  }
}
