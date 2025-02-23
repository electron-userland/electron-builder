import { log } from "./log"
import { exec } from "./util"
import semver from "semver"

export async function checkSnapcraftVersion() {
  const installMessage = process.platform === "darwin" ? "brew install snapcraft" : "sudo snap install snapcraft --classic"
  const errorMessage = `snapcraft is not installed, please: ${installMessage}`

  const doCheckSnapVersion = (rawVersion: string, installMessage: string) => {
    if (rawVersion === "snapcraft, version edge") {
      return
    }

    const s = rawVersion.replace("snapcraft", "").replace(",", "").replace("version", "").trim().replace(/'/g, "")
    if (semver.lt(s, "4.0.0")) {
      throw new Error(`at least snapcraft 4.0.0 is required, but ${rawVersion} installed, please: ${installMessage}`)
    }
  }

  try {
    const out = await exec("snapcraft", ["--version"])
    doCheckSnapVersion(out, installMessage)
  } catch (err: any) {
    log.error({ message: err.message }, errorMessage)
    throw new Error(errorMessage)
  }
}