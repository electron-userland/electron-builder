import { chmod } from "node:fs/promises"
import * as path from "path"
import { resolveEnvToolsetPath } from "builder-util"
import { downloadBuilderToolset } from "../util/electronGet.js"

const checksums = {
  "7zip-linux-ia32.tar.gz": "24a5d5bfe81506d0bfe21a812588119ae3deb757e8ba084b2339d8e899543686",
  "7zip-darwin-arm64.tar.gz": "496a341abe210aae1a25bc202ee97f6de6c76a3dc80f91d96616be05502d72c1",
  "7zip-darwin-x86_64.tar.gz": "496a341abe210aae1a25bc202ee97f6de6c76a3dc80f91d96616be05502d72c1",
  "7zip-linux-arm64.tar.gz": "5aff5034206b78f8261249ceb922b5c7e04c9bdb733784d8f5b6df9732cf1f79",
  "7zip-win-arm64.tar.gz": "ac3f38f96ce7498096a123bb0862dd6db863a7353c9e9e1c15f73c183adf6620",
  "7zip-win-ia32.tar.gz": "ac3f38f96ce7498096a123bb0862dd6db863a7353c9e9e1c15f73c183adf6620",
  "7zip-win-x64.tar.gz": "be071f15bd6da2f78fe81c6ddef2009b0c4d8a51f36b780cb806c7e6df95e1b3",
  "7zip-linux-x64.tar.gz": "d151bb44b2a9d9bfc52813ce4cac042916394a0ab8a56bd5d221a5dc9ef8d5d7",
} as const

function getFilename(): keyof typeof checksums {
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

let _resolvedPath: Promise<string> | null = null

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
  const envExec = await resolveEnvToolsetPath("ELECTRON_BUILDER_7ZIP_PATH", "file")
  if (envExec != null) {
    return envExec
  }

  const filename = getFilename()
  const toolDir = await downloadBuilderToolset({
    releaseName: `7zip@1.0.0`,
    filenameWithExt: filename,
    checksums: checksums,
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })

  const bin = path.join(toolDir, "bin", process.platform === "win32" ? "7za.exe" : "7za")
  if (process.platform !== "win32") {
    await chmod(bin, 0o755)
  }
  return bin
}
