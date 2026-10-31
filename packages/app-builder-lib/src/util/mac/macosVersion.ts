import { release as osRelease } from "os"
import * as semver from "semver"

export function isMacOsHighSierra(): boolean {
  // 17.7.0 === 10.13.6
  return process.platform === "darwin" && semver.gte(osRelease(), "17.7.0")
}
