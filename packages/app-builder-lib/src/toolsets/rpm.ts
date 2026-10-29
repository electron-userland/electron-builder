import { InvalidConfigurationError } from "builder-util"
import * as path from "path"
import { ToolsetConfig } from "../configuration.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { getCustomToolsetPath } from "./custom.js"
import { resolveToolsetVersion } from "./version.js"

// Newest rpm bundle — selected when the config is unset / null / "latest".
const RPM_LATEST = "1.0.0"

// Portable rpmbuild (rpm 6.1.0) from electron-builder-binaries `packages/rpm`; `bin/rpmbuild` sits at the archive root.
export const rpmChecksums = {
  "1.0.0": {
    "rpm-6.1.0-linux-amd64.7z": "e17b704b65b9192ca9fa1eaca3e5e4d80b0d430e6273286d065b8e75cea52d16",
    "rpm-6.1.0-linux-arm64v8.7z": "1a284057e5151c467cb71e36222f21754f5554249f0d562ce2ecaae63d8ec83b",
    "rpm-6.1.0-darwin-arm64.7z": "e3398a76ac22846faa238ed68c72d829811c89c7c9962d49eaff4f6db30cb774",
  },
} as const

// Release asset suffix for each build host (`platform-arch`) a bundle is published for.
const hostSuffixes: Record<string, string> = { "linux-x64": "linux-amd64", "linux-arm64": "linux-arm64v8", "darwin-arm64": "darwin-arm64" }

/** The bundle archive of `version` for the build host, or `undefined` when none is published. */
export function getRpmBundleFilename(version: string, platform: string = process.platform, arch: string = process.arch): string | undefined {
  const checksums: Record<string, string> = (rpmChecksums as Record<string, Record<string, string>>)[version] ?? {}
  const suffix = hostSuffixes[`${platform}-${arch}`]
  return suffix == null ? undefined : Object.keys(checksums).find(name => name.endsWith(`-${suffix}.7z`))
}

/** @returns the `bin` directory holding `rpmbuild`, to put first on fpm's `PATH`, or `null` for `"system"` (the host `rpmbuild`). */
export async function getRpmToolsetBinDir(toolset: ToolsetConfig["rpm"] | null, resourcesDir: string): Promise<string | null> {
  if (toolset === "system") {
    return null
  }
  if (typeof toolset === "object" && toolset != null) {
    return path.join(await getCustomToolsetPath(toolset, resourcesDir), "bin")
  }

  const version = resolveToolsetVersion(toolset, RPM_LATEST)
  const filenameWithExt = getRpmBundleFilename(version)
  // Never download without a checksum entry: the downloader would run with integrity verification disabled.
  if (filenameWithExt == null) {
    throw new InvalidConfigurationError(`No toolsets.rpm "${version}" bundle for ${process.platform} ${process.arch}. Set toolsets.rpm to "system" to use the host rpmbuild.`)
  }
  const bundleDir = await downloadBuilderToolset({
    releaseName: `rpm@${version}`,
    filenameWithExt,
    checksums: rpmChecksums[version],
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })
  return path.join(bundleDir, "bin")
}
