import { InvalidConfigurationError, log } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { constants as fsConstants } from "fs"
import { access, stat } from "fs/promises"
import * as path from "path"
import { ToolsetConfig } from "../configuration.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { getDarwinRelease, getGlibcRuntimeVersion } from "../util/hostOsVersion.js"
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

/** Oldest glibc the published Linux bundles run on (they are built against it). */
export const RPM_BUNDLE_MIN_GLIBC = "2.28"
/** Oldest Darwin kernel the published macOS arm64 bundle runs on: Darwin 24 is macOS 15 Sequoia. */
export const RPM_BUNDLE_MIN_DARWIN_MAJOR = 24

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
 * Why the published bundle cannot run on this host, which is below the bundle's OS or libc floor, or `null` when it can (and on
 * hosts with no bundle at all, which {@link getRpmBundleFilename} covers). Checked before the download: an old host would
 * otherwise download the bundle and then fail with an opaque dynamic loader error.
 */
export function getRpmBundleHostIssue(platform: NodeJS.Platform = process.platform): string | null {
  if (platform === "darwin") {
    const release = getDarwinRelease()
    const major = Number.parseInt(release, 10)
    if (Number.isNaN(major) || major < RPM_BUNDLE_MIN_DARWIN_MAJOR) {
      return `requires macOS 15 or newer (Darwin ${RPM_BUNDLE_MIN_DARWIN_MAJOR}), but this host is ${describeDarwinRelease(release, major)}`
    }
  } else if (platform === "linux") {
    const glibc = getGlibcRuntimeVersion()
    if (glibc == null) {
      return `requires glibc ${RPM_BUNDLE_MIN_GLIBC} or newer, but this host has no glibc (musl or another libc)`
    }
    if (compareDottedVersions(glibc, RPM_BUNDLE_MIN_GLIBC) < 0) {
      return `requires glibc ${RPM_BUNDLE_MIN_GLIBC} or newer, but this host has glibc ${glibc}`
    }
  }
  return null
}

function describeDarwinRelease(release: string, major: number): string {
  if (Number.isNaN(major)) {
    return `Darwin ${release}`
  }
  // Darwin 20 is macOS 11, Darwin 24 is macOS 15; Darwin 19 and older are macOS 10.x (Darwin 19 is 10.15)
  const macos = major >= 20 ? `${major - 9}` : `10.${major - 4}`
  return `macOS ${macos} (Darwin ${release})`
}

// Numeric comparison of dotted versions such as glibc's "2.28" / "2.9" (not semver: no patch component)
function compareDottedVersions(a: string, b: string): number {
  const left = a.split(".").map(part => Number.parseInt(part, 10) || 0)
  const right = b.split(".").map(part => Number.parseInt(part, 10) || 0)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) {
      return diff
    }
  }
  return 0
}

function describeSelection(toolset: Exclude<ToolsetConfig["rpm"], object> | Nullish, version: string): string {
  return toolset == null ? `defaults to the bundled rpmbuild (rpm@${version}) in v27` : `"${toolset}" selects the bundled rpmbuild (rpm@${version})`
}

const SYSTEM_HINT = 'Set toolsets.rpm: "system" to build the rpm target with the rpmbuild installed on this machine.'

/**
 * fpm finds `rpmbuild` on `PATH` only: a bundle without an executable `bin/rpmbuild` would make it run the host one silently,
 * which is the fallback the bundle exists to avoid.
 *
 * @param explain why the bundle lacks it and what to do, given the path that was looked for
 */
async function assertRpmbuildInBundle(binDir: string, explain: (rpmbuild: string) => string): Promise<string> {
  const rpmbuild = path.join(binDir, "rpmbuild")
  const isExecutableFile = await stat(rpmbuild)
    .then(s => s.isFile() && access(rpmbuild, fsConstants.X_OK).then(() => true))
    .catch(() => false)
  if (!isExecutableFile) {
    throw new InvalidConfigurationError(`${explain(rpmbuild)} See ${RPM_TOOLSET_MIGRATION_URL}`)
  }
  return binDir
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
    const bundleDir = await getCustomToolsetPath(toolset, resourcesDir)
    return assertRpmbuildInBundle(
      path.join(bundleDir, "bin"),
      rpmbuild =>
        `The custom toolsets.rpm bundle (${toolset.url}) has no executable bin/rpmbuild (looked for ${rpmbuild}). A custom rpm toolset must have the ` +
        `published bundle's layout: bin/rpmbuild at the root of the archive or directory, with no top-level directory. Without it fpm would silently ` +
        `run the host rpmbuild; to build with the host rpmbuild, set toolsets.rpm: "system".`
    )
  }
  if (toolset === "system") {
    return null
  }

  const version = resolveToolsetVersion<RpmBundleVersion>(toolset, RPM_LATEST)
  const filename = getRpmBundleFilename()
  if (filename == null) {
    // No silent fallback to the host rpmbuild: the output would then depend on the build host again, which is what the bundle avoids.
    throw new InvalidConfigurationError(
      `toolsets.rpm ${describeSelection(toolset, version)}, which is not published for ${process.platform} ${process.arch} (published for Linux x64, Linux arm64 and macOS arm64). ` +
        `${SYSTEM_HINT} See ${RPM_TOOLSET_MIGRATION_URL}`
    )
  }
  const hostIssue = getRpmBundleHostIssue()
  if (hostIssue != null) {
    throw new InvalidConfigurationError(`toolsets.rpm ${describeSelection(toolset, version)}, which ${hostIssue}. ${SYSTEM_HINT} See ${RPM_TOOLSET_MIGRATION_URL}`)
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
  return assertRpmbuildInBundle(
    path.join(bundleDir, "bin"),
    rpmbuild =>
      `The downloaded rpm@${version} bundle has no executable bin/rpmbuild (looked for ${rpmbuild}): the cached bundle is incomplete or damaged. ` +
      `Delete ${bundleDir} to download it again. ${SYSTEM_HINT}`
  )
}
