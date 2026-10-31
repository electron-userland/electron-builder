import { InvalidConfigurationError } from "builder-util"
import * as path from "path"
import { ToolsetConfig } from "../configuration.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { getCustomToolsetPath } from "./custom.js"
import { resolveToolsetVersion } from "./version.js"

// Newest FPM bundle — selected when the config is unset / null / "latest".
const FPM_LATEST = "2.3.1"

// Archive names carry the bundled fpm and Ruby versions, so they differ between releases: the keys of each
// version's entry are its archive names, and `getFpmArchiveName` picks the one for the host platform.
export const fpmChecksums = {
  "2.2.1": {
    "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z": "2ef73acbcbfd26503369cb3a9b0345aa7fae251d69130537ee6ff47b402f828e",
    "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z": "50eff4214e3e30e2a8bbc35854f80acabb3260ea9e87f5835c60f898eedb320e",
    "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z": "553f047eacbc63423bae1eca5958bcdc720c1f6f4135cb815f5ec99f48d3bd55",
    "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z": "e44b60765367cd11b0b9fa5f1966762137ee45ec02d49a3e9668475031e97873",
    "fpm-1.17.0-ruby-3.4.3-linux-i386.7z": "f4091110728de8259dcab181761e74141b4b65d409a26e642c7271bd0b61eab4",
  },
  // fpm 1.18.0, Ruby 3.4.12; Linux bundles link a static OpenSSL 3.5.9 (glibc floor still 2.28)
  "2.3.1": {
    "fpm-1.18.0-ruby-3.4.12-darwin-arm64.7z": "40846b25ece8b24f30b6cbe3838a7cf3fd05b7e8f2133a50b6ef6f1ee12ba7c3",
    "fpm-1.18.0-ruby-3.4.12-darwin-x86_64.7z": "4299d345d906be224b47885ca1bb87b6a2cf688e1b04024d480987b051c68f76",
    "fpm-1.18.0-ruby-3.4.12-linux-amd64.7z": "25c7518f5187047fbd0268c8150f9fb795058f851c3954a0407bee7ed199ff87",
    "fpm-1.18.0-ruby-3.4.12-linux-arm64v8.7z": "ffa94aff17e68137867a4d2e63cebb4ff041ab7d360ec429430f0369162db983",
    "fpm-1.18.0-ruby-3.4.12-linux-i386.7z": "7b53b41729dbbcd75d3f4da16ae310d9dae6892b276c9d443e4e3e64990540c0",
  },
} as const

type FpmVersion = keyof typeof fpmChecksums

/**
 * The platform/arch suffix of an fpm archive name (`fpm-<fpm>-ruby-<ruby>-<suffix>.7z`), or `null` for a host no
 * release publishes a bundle for. Every release uses the same suffixes.
 */
function fpmArchiveSuffix(platform: NodeJS.Platform, arch: string): string | null {
  if (platform === "linux") {
    if (arch === "x64") {
      return "linux-amd64"
    } else if (arch === "arm64") {
      return "linux-arm64v8"
    }
    return "linux-i386"
  }
  if (platform === "darwin") {
    return arch === "arm64" ? "darwin-arm64" : "darwin-x86_64"
  }
  return null
}

/**
 * Resolve the archive of fpm bundle `version` for a host platform and arch, from that version's own checksum entry.
 *
 * Throws an {@link InvalidConfigurationError} for a version that has no checksum entry, or a host the release publishes
 * no archive for, instead of downloading without a checksum to verify against.
 */
export function getFpmArchiveName(version: string, platform: NodeJS.Platform, arch: string): string {
  // The `toolsets.fpm` type and scheme.json only admit known versions, but a programmatic config bypasses both.
  if (!Object.prototype.hasOwnProperty.call(fpmChecksums, version)) {
    throw new InvalidConfigurationError(
      `Unknown toolsets.fpm version "${version}". Known versions: ${Object.keys(fpmChecksums).join(", ")} (or "latest"). ` +
        `To use a custom bundle, set toolsets.fpm to a ToolsetCustom object (url + checksum) instead.`
    )
  }
  const suffix = fpmArchiveSuffix(platform, arch)
  const filename = suffix == null ? undefined : Object.keys(fpmChecksums[version as FpmVersion]).find(it => it.endsWith(`-${suffix}.7z`))
  if (filename == null) {
    throw new InvalidConfigurationError(
      `fpm@${version} has no bundle for ${platform}-${arch}. ` +
        `Configure a custom toolset pointing at the directory containing your fpm executable, e.g. toolsets: { fpm: { url: "file:///absolute/path/to/fpm/dir" } }`
    )
  }
  return filename
}

export async function getFpmPath(toolset: ToolsetConfig["fpm"], resourcesDir: string) {
  const exec = "fpm"
  // A custom toolset is an explicit user override — honored on every platform, before any platform default/fallback.
  if (typeof toolset === "object" && toolset != null) {
    const vendorPath = await getCustomToolsetPath(toolset, resourcesDir)
    return path.resolve(vendorPath, exec)
  }

  if (process.platform === "win32") {
    // No fpm binary is bundled for Windows. Rather than resolving a bare `fpm` from $PATH (a binary-hijack
    // vector), require an explicit custom toolset pointing at the directory that contains the fpm executable.
    throw new InvalidConfigurationError(
      `fpm is not bundled for Windows. Configure a custom toolset pointing at the directory containing your fpm executable, e.g. toolsets: { fpm: { url: "file:///absolute/path/to/fpm/dir" } }`
    )
  }

  const version = resolveToolsetVersion(toolset, FPM_LATEST)
  const filename = getFpmArchiveName(version, process.platform, process.arch)
  const fpmPath = await downloadBuilderToolset({
    releaseName: `fpm@${version}`,
    filenameWithExt: filename,
    checksums: fpmChecksums[version],
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })
  return path.resolve(fpmPath, exec)
}
