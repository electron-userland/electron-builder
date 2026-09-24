import { Nullish } from "builder-util-runtime"
import { chmod } from "node:fs/promises"
import * as path from "path"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { resolveToolsetVersion } from "./version.js"

// Newest 7-Zip bundle — selected when the config is unset / null / "latest".
const SEVEN_ZIP_LATEST = "1.0.1"

const sevenZipChecksums = {
  // shipped the 32-bit 7za.exe for every Windows arch — 1.75 GiB memory cap, no LZMA2 multithreading on x64/arm64 (electron-builder-binaries#222)
  "1.0.0": {
    "7zip-linux-ia32.tar.gz": "24a5d5bfe81506d0bfe21a812588119ae3deb757e8ba084b2339d8e899543686",
    "7zip-darwin-arm64.tar.gz": "496a341abe210aae1a25bc202ee97f6de6c76a3dc80f91d96616be05502d72c1",
    "7zip-darwin-x86_64.tar.gz": "496a341abe210aae1a25bc202ee97f6de6c76a3dc80f91d96616be05502d72c1",
    "7zip-linux-arm64.tar.gz": "5aff5034206b78f8261249ceb922b5c7e04c9bdb733784d8f5b6df9732cf1f79",
    "7zip-win-arm64.tar.gz": "ac3f38f96ce7498096a123bb0862dd6db863a7353c9e9e1c15f73c183adf6620",
    "7zip-win-ia32.tar.gz": "ac3f38f96ce7498096a123bb0862dd6db863a7353c9e9e1c15f73c183adf6620",
    "7zip-win-x64.tar.gz": "be071f15bd6da2f78fe81c6ddef2009b0c4d8a51f36b780cb806c7e6df95e1b3",
    "7zip-linux-x64.tar.gz": "d151bb44b2a9d9bfc52813ce4cac042916394a0ab8a56bd5d221a5dc9ef8d5d7",
  },
  // correct per-arch Windows binaries (x64, ia32, arm64)
  "1.0.1": {
    "7zip-linux-ia32.tar.gz": "f9e4084ef21d790bfe6147f0306118b0136b0824a7113f053b712824db19988f",
    "7zip-darwin-arm64.tar.gz": "8e307a68bb75a7d1b7366a4e34cb4b442fa678d01b421d6db2314567010d2876",
    "7zip-darwin-x86_64.tar.gz": "8e307a68bb75a7d1b7366a4e34cb4b442fa678d01b421d6db2314567010d2876",
    "7zip-linux-arm64.tar.gz": "9ac9acd3f8fe1d9175dd279e715e36e188373581db320d9e520f2aaafa360ce5",
    "7zip-win-arm64.tar.gz": "1b6273d377d5ef7e2a9bb7f9b64b5cb7678ba7d0e503aa5c93305012ffa299d2",
    "7zip-win-ia32.tar.gz": "2beef271bd1b3eb42021acfb24f47d268d03139e794f41628b89e728fa58bed6",
    "7zip-win-x64.tar.gz": "db50b64348d9560b875a00bd7e02f02b5f7f4b54ff5efa5908c38858c89c9f33",
    "7zip-linux-x64.tar.gz": "c6c2d744f5e71f100e7631786bca78b6f1738734454e8dd4bf6078d4895765f7",
  },
} as const

export type SevenZipVersion = keyof typeof sevenZipChecksums

function getFilename(): keyof (typeof sevenZipChecksums)[SevenZipVersion] {
  const { platform, arch } = process
  if (platform === "darwin") {
    return arch === "arm64" ? "7zip-darwin-arm64.tar.gz" : "7zip-darwin-x86_64.tar.gz"
  }
  if (platform === "linux") {
    if (arch === "arm64") {
      return "7zip-linux-arm64.tar.gz"
    }
    if (arch === "ia32") {
      return "7zip-linux-ia32.tar.gz"
    }
    return "7zip-linux-x64.tar.gz"
  }
  if (platform === "win32") {
    if (arch === "arm64") {
      return "7zip-win-arm64.tar.gz"
    }
    if (arch === "ia32") {
      return "7zip-win-ia32.tar.gz"
    }
    return "7zip-win-x64.tar.gz"
  }
  throw new Error(`Unsupported platform for 7zip toolset: ${platform}/${arch}`)
}

let _customPath: string | null = null
let _version: SevenZipVersion = SEVEN_ZIP_LATEST
let _resolvedPath: Promise<string> | null = null

/**
 * Override the 7za binary path with a pre-resolved absolute path.
 * Called by the packager when `toolsets.sevenZip` is a `ToolsetCustom` config.
 * Resets the resolution cache so the next `getPath7za()` call uses this path.
 */
export function setSevenZipPath(customPath: string): void {
  _customPath = customPath
  _resolvedPath = null
}

/**
 * Pin the 7-Zip bundle version.
 * Called by the packager when `toolsets.sevenZip` is a version string (unset / null / `"latest"`
 * resolve to the newest bundle). Resets the resolution cache so the next `getPath7za()` call
 * downloads the pinned version.
 */
export function setSevenZipVersion(version: SevenZipVersion | "latest" | Nullish): void {
  _version = resolveToolsetVersion(version, SEVEN_ZIP_LATEST)
  _resolvedPath = null
}

/** Returns the path to the 7za executable, downloading it on first call. Resets on failure so callers can retry. */
export function getPath7za(): Promise<string> {
  if (_resolvedPath == null) {
    _resolvedPath = resolve().catch(err => {
      _resolvedPath = null
      throw err
    })
  }
  return _resolvedPath
}

async function resolve(): Promise<string> {
  if (_customPath != null) {
    if (process.platform !== "win32") {
      await chmod(_customPath, 0o755)
    }
    return _customPath
  }

  const filename = getFilename()
  const toolDir = await downloadBuilderToolset({
    releaseName: `7zip@${_version}`,
    filenameWithExt: filename,
    checksums: sevenZipChecksums[_version],
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })

  const bin = path.join(toolDir, "bin", process.platform === "win32" ? "7za.exe" : "7za")
  if (process.platform !== "win32") {
    await chmod(bin, 0o755)
  }
  return bin
}
