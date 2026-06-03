import { chmod } from "fs-extra"
import * as path from "path"
import { downloadBuilderToolset } from "../util/electronGet"

const VERSION = "24.09"

// SHA-256 checksums per platform archive — populated after the 7zip@24.09 release
// in electron-userland/electron-builder-binaries is cut and checksums are available.
// Until then the download proceeds without checksum verification (a warning is logged).
const checksums: Readonly<Partial<Record<string, string>>> = {
  // "7zip-darwin-arm64.tar.gz":   "...",
  // "7zip-darwin-x86_64.tar.gz":  "...",
  // "7zip-linux-x64.tar.gz":      "...",
  // "7zip-linux-arm64.tar.gz":    "...",
  // "7zip-linux-ia32.tar.gz":     "...",
  // "7zip-win-x64.tar.gz":        "...",
  // "7zip-win-ia32.tar.gz":       "...",
  // "7zip-win-arm64.tar.gz":      "...",
}

function getFilename(): string {
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

let _resolvedPath: Promise<string> | null = null

/** Returns the path to the 7za executable, downloading it on first call. */
export function getPath7za(): Promise<string> {
  return (_resolvedPath ??= resolve())
}

async function resolve(): Promise<string> {
  let bin: string

  const envOverride = process.env.ELECTRON_BUILDER_7ZA_PATH
  if (envOverride) {
    bin = envOverride
  } else {
    const filename = getFilename()
    const checksum = (checksums as Record<string, string>)[filename] ?? null

    const toolDir = await downloadBuilderToolset({
      releaseName: `7zip@${VERSION}`,
      filenameWithExt: filename,
      checksums: checksum != null ? { [filename]: checksum } : undefined,
      githubOrgRepo: "electron-userland/electron-builder-binaries",
    })

    const exe = process.platform === "win32" ? "7za.exe" : "7za"
    bin = path.join(toolDir, "bin", exe)
  }

  if (process.platform !== "win32") {
    await chmod(bin, 0o755)
  }

  return bin
}
