import { readFile } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as semver from "semver"
import { debug } from "./util"

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

export function getMacOsVersion() {
  return macOsVersion.value
}

export async function isMacOsSierra() {
  return process.platform === "darwin" && await isOsVersionGreaterThanOrEqualTo("10.12.0")
}

export async function isMacOsHighSierra() {
  return process.platform === "darwin" && await isOsVersionGreaterThanOrEqualTo("10.13.0")
}

export async function isCanSignDmg() {
  return process.platform === "darwin" && await isOsVersionGreaterThanOrEqualTo("10.11.5")
}
