import { chmod } from "fs-extra"
import * as path from "path"
import { resolveEnvToolsetPath } from "builder-util"
import { downloadBuilderToolset } from "../util/electronGet"

const VERSION = "24.09"

// SHA-256 checksums for each platform archive in the 7zip@24.09 release of
// electron-userland/electron-builder-binaries.
const checksums = {
  "7zip-darwin-arm64.tar.gz":  "61df1ce2a2923d712491c6dca323a2eaaf8c12007627e8e88b09a5b7c9537481",
  "7zip-darwin-x86_64.tar.gz": "61df1ce2a2923d712491c6dca323a2eaaf8c12007627e8e88b09a5b7c9537481",
  "7zip-linux-x64.tar.gz":     "5a0da6c702b7fef2612d7926e5e9d4e9aec5e4843b58973af627301738f5808b",
  "7zip-linux-arm64.tar.gz":   "7a9c1fa88168fc5930f59e8f47d1d7f9adf8551a0909819d6eeda9e91ce1b93c",
  "7zip-linux-ia32.tar.gz":    "2d4d86dc2e17eee887836b62852d57626382e2184d7928433f3180ec1727815d",
  "7zip-win-x64.tar.gz":       "929a7a25e7f30c26ce37427a1da7630c9abafde25f560222eecf235fed166109",
  "7zip-win-arm64.tar.gz":     "929a7a25e7f30c26ce37427a1da7630c9abafde25f560222eecf235fed166109",
  "7zip-win-ia32.tar.gz":      "a33a27ebf1d361151f9d27bb25ba40f8f5a7d42390077d77382a90d928d28b84",
} as const

function getFilename(): keyof typeof checksums {
  const { platform, arch } = process
  if (platform === "darwin") {
    return arch === "arm64" ? "7zip-darwin-arm64.tar.gz" : "7zip-darwin-x86_64.tar.gz"
  }
  if (platform === "linux") {
    if (arch === "arm64") return "7zip-linux-arm64.tar.gz"
    if (arch === "ia32") return "7zip-linux-ia32.tar.gz"
    return "7zip-linux-x64.tar.gz"
  }
  if (platform === "win32") {
    if (arch === "arm64") return "7zip-win-arm64.tar.gz"
    if (arch === "ia32") return "7zip-win-ia32.tar.gz"
    return "7zip-win-x64.tar.gz"
  }
  throw new Error(`Unsupported platform for 7zip toolset: ${platform}/${arch}`)
}

function binName(): string {
  return process.platform === "win32" ? "7za.exe" : "7za"
}

let _resolvedPath: Promise<string> | null = null

/** Returns the path to the 7za executable, downloading it on first call. */
export function getPath7za(): Promise<string> {
  return (_resolvedPath ??= resolve())
}

async function resolve(): Promise<string> {
  // Directory override — mirrors the LINUX_TOOLS_MAC_PATH pattern in linux.ts.
  // Set ELECTRON_BUILDER_7ZIP_PATH to a pre-extracted bundle dir (containing bin/7za).
  const envDir = await resolveEnvToolsetPath("ELECTRON_BUILDER_7ZIP_PATH", "directory")
  if (envDir != null) {
    const bin = path.join(envDir, "bin", binName())
    if (process.platform !== "win32") {
      await chmod(bin, 0o755)
    }
    return bin
  }

  const filename = getFilename()
  const toolDir = await downloadBuilderToolset({
    releaseName: `7zip@${VERSION}`,
    filenameWithExt: filename,
    checksums: { [filename]: checksums[filename] },
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })

  const bin = path.join(toolDir, "bin", binName())
  if (process.platform !== "win32") {
    await chmod(bin, 0o755)
  }
  return bin
}
