import { InvalidConfigurationError } from "builder-util"
import * as path from "path"
import { ToolsetConfig } from "../configuration.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { getCustomToolsetPath } from "./custom.js"
import { resolveToolsetVersion } from "./version.js"

// Newest archive bundle — selected when the config is unset / null / "latest".
const ARCHIVE_LATEST = "1.0.0"

// Each archive has a root bin/ with xz, lzip, GNU tar (tar, gtar), GNU ar (ar, gar) and bsdtar,
// plus rpm and rpmbuild (rpm 6.1.0) on linux-amd64, linux-arm64v8 and darwin-arm64 only.
export const archiveChecksums = {
  "1.0.0": {
    "archive-linux-amd64.7z": "e8c2f1d611492cf51dfc1703f48a2b8804e15fde44d09c0e5d3d9b0b4410abb6",
    "archive-linux-arm64v8.7z": "a473505a58f7f059051587a84405e2e13382820b64893fa82fe16ceb1b80c392",
    "archive-linux-i386.7z": "09209547ba629c6b8c18bad4e4c24b55c8c6c407cf8ec0e4662a0816aa597640",
    "archive-darwin-arm64.7z": "07505ce02339a9ca01a1d47b14bbed95e6bc26fdfe284a2cdea1e54f92753057",
    "archive-darwin-x86_64.7z": "a0d55100cd2bcd5175ea5deae1d458885e1f478b4917994501d3e1bcb4f6b8c4",
  },
} as const

const hostSuffixes: Record<string, string> = {
  "linux-x64": "linux-amd64",
  "linux-arm64": "linux-arm64v8",
  "linux-ia32": "linux-i386",
  "darwin-arm64": "darwin-arm64",
  "darwin-x64": "darwin-x86_64",
}

/** @returns the toolset's `bin` directory, which electron-builder puts first on `PATH` for fpm. */
export async function getArchiveToolsetBinDir(toolset: ToolsetConfig["archive"], resourcesDir: string): Promise<string> {
  if (typeof toolset === "object" && toolset != null) {
    return path.join(await getCustomToolsetPath(toolset, resourcesDir), "bin")
  }

  // Unset / null / "latest" → newest; an explicit pin selects exactly that release.
  const version = resolveToolsetVersion(toolset, ARCHIVE_LATEST)
  const checksums: Record<string, string> | undefined = (archiveChecksums as Record<string, Record<string, string>>)[version]
  const filenameWithExt = `archive-${hostSuffixes[`${process.platform}-${process.arch}`]}.7z`
  // Never download without a checksum entry: the downloader would run with integrity verification disabled.
  if (checksums?.[filenameWithExt] == null) {
    throw new InvalidConfigurationError(
      `No toolsets.archive "${version}" bundle for ${process.platform}-${process.arch}. Set toolsets.archive to a ToolsetCustom object (url + checksum) instead.`
    )
  }
  const bundleDir = await downloadBuilderToolset({
    releaseName: `archive@${version}`,
    filenameWithExt,
    checksums,
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })
  return path.join(bundleDir, "bin")
}
