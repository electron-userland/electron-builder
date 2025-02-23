import { log } from "./log"
import { exec } from "./util"
import semver from "semver"

export async function checkSnapcraftVersion() {
  const installMessage = process.platform === "darwin" ? "brew install snapcraft" : "sudo snap install snapcraft --classic"
  const errorMessage = `snapcraft is not installed, please: ${installMessage}`

  const doCheckSnapVersion = (rawVersion: string) => {
    if (rawVersion === "snapcraft, version edge") {
      return
    }

    const s = rawVersion.replace("snapcraft", "").replace(",", "").replace("version", "").trim().replace(/'/g, "")
    if (semver.lt(s, "4.0.0")) {
      const errorMessage = `at least snapcraft 4.0.0 is required, but ${rawVersion} installed, please: ${installMessage}`
      log.error(null, errorMessage)
      throw new Error(errorMessage)
    }
  }

  let out: string
  try {
    out = await exec("snapcraft", ["--version"])
  } catch (err: any) {
    log.error({ message: err.message }, errorMessage)
    throw new Error(errorMessage)
  }
  doCheckSnapVersion(out)
}
