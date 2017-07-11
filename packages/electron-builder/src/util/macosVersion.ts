import { debug, Lazy } from "electron-builder-util"
import { readFile } from "fs-extra-p"
import * as semver from "semver"

const macOsVersion = new Lazy<string>(async () => {
  const file = await readFile("/System/Library/CoreServices/SystemVersion.plist", "utf8")
  const matches = /<key>ProductVersion<\/key>[\s\S]*<string>([\d.]+)<\/string>/.exec(file)
  if (!matches) {
    throw new Error("Couldn't find the macOS version")
  }
  debug(`macOS version: ${matches[1]}`)
  return clean(matches[1])
})

function clean(version: string) {
  return version.split(".").length === 2 ? `${version}.0` : version
}

async function isOsVersionGreaterThanOrEqualTo(input: string) {
  return semver.gte(await macOsVersion.value, clean(input))
}

/** @internal */
export async function isMacOsSierra() {
  return process.platform === "darwin" && await isOsVersionGreaterThanOrEqualTo("10.12.0")
}
