import { InvalidConfigurationError, log } from "builder-util"
import { Nullish } from "builder-util-runtime"
import * as path from "path"
import { ToolsetConfig } from "../configuration.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { getCustomToolsetPath } from "./custom.js"
import { resolveToolsetVersion } from "./version.js"

// Newest rpm bundle — selected when the config is unset / "latest".
const RPM_LATEST = "1.0.0"

export const RPM_TOOLSET_MIGRATION_URL = "https://www.electron.build/docs/migration/v27-build-changes#rpm-builds-use-a-bundled-rpmbuild"

/**
 * Portable `rpmbuild` (rpm 6.1.0) built by electron-builder-binaries `packages/rpm`. The archive has no top-level directory:
 * `bin/rpmbuild` and `bin/rpm` are wrappers that set `RPM_CONFIGDIR`/`MAGIC` relative to the bundle and load only the bundled
 * macros (host `/etc/rpm`, `~/.rpmmacros` are ignored), with electron-builder's pinned `_rpmformat 4` / `_build_id_links none`.
 */
export const rpmChecksums = {
  "1.0.0": {
    "rpm-6.1.0-linux-amd64.7z": "e17b704b65b9192ca9fa1eaca3e5e4d80b0d430e6273286d065b8e75cea52d16",
    "rpm-6.1.0-linux-arm64v8.7z": "1a284057e5151c467cb71e36222f21754f5554249f0d562ce2ecaae63d8ec83b",
    "rpm-6.1.0-darwin-arm64.7z": "e3398a76ac22846faa238ed68c72d829811c89c7c9962d49eaff4f6db30cb774",
  },
} as const

type RpmBundleVersion = keyof typeof rpmChecksums

/** The bundle archive for the build host, or `null` when none is published (Intel macOS, 32-bit Linux, Windows, …). */
export function getRpmBundleFilename(platform: NodeJS.Platform = process.platform, arch: string = process.arch): keyof (typeof rpmChecksums)[RpmBundleVersion] | null {
  if (platform === "linux") {
    if (arch === "x64") {
      return "rpm-6.1.0-linux-amd64.7z"
    }
    if (arch === "arm64") {
      return "rpm-6.1.0-linux-arm64v8.7z"
    }
  } else if (platform === "darwin" && arch === "arm64") {
    return "rpm-6.1.0-darwin-arm64.7z"
  }
  return null
}

/**
 * Resolves `toolsets.rpm` for the `rpm` target.
 *
 * @returns the bundle's `bin` directory (holding the `rpmbuild` wrapper), to put first on the `PATH` fpm runs with, or `null` for
 * `"system"`: fpm then finds the host `rpmbuild` on `PATH`, as before v27.
 */
export async function getRpmToolsetBinDir(toolset: ToolsetConfig["rpm"] | Nullish, resourcesDir: string): Promise<string | null> {
  // A custom toolset is an explicit user override — honored on every platform.
  if (typeof toolset === "object" && toolset != null) {
    return path.join(await getCustomToolsetPath(toolset, resourcesDir), "bin")
  }
  if (toolset === "system") {
    return null
  }

  const version = resolveToolsetVersion<RpmBundleVersion>(toolset, RPM_LATEST)
  const filename = getRpmBundleFilename()
  if (filename == null) {
    // No silent fallback to the host rpmbuild: the output would then depend on the build host again, which is what the bundle avoids.
    const selected = toolset == null ? `defaults to the bundled rpmbuild (rpm@${version}) in v27` : `"${toolset}" selects the bundled rpmbuild (rpm@${version})`
    throw new InvalidConfigurationError(
      `toolsets.rpm ${selected}, which is not published for ${process.platform} ${process.arch} (published for Linux x64, Linux arm64 and macOS arm64). ` +
        `Set toolsets.rpm: "system" to build the rpm target with the rpmbuild installed on this machine. See ${RPM_TOOLSET_MIGRATION_URL}`
    )
  }

  if (toolset == null) {
    // v27 default change, announced once per process; an explicit "latest" or version is the user's own choice and is not announced.
    log
      .once("toolset-rpm-default")
      .info(
        { toolset: `rpm@${version}`, optOut: 'toolsets.rpm: "system"', docs: RPM_TOOLSET_MIGRATION_URL },
        'v27: the rpm target now builds with the bundled rpmbuild instead of the one installed on this machine, so host rpm macros (~/.rpmmacros, /etc/rpm) no longer apply. Set toolsets.rpm: "system" to keep using the host rpmbuild'
      )
  }

  const bundleDir = await downloadBuilderToolset({
    releaseName: `rpm@${version}`,
    filenameWithExt: filename,
    checksums: rpmChecksums[version],
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })
  return path.join(bundleDir, "bin")
}
