import * as semver from "semver"
import type { Platform } from "../core.js"
import type { PlatformSpecificBuildOptions } from "../options/PlatformSpecificBuildOptions.js"

/** Default `electronUpdaterCompatibility`: the electron-updater versions the installed apps are assumed to ship. */
export const DEFAULT_ELECTRON_UPDATER_COMPATIBILITY = ">=7"

/** v27 breaking-changes entry on the block map format following `electronUpdaterCompatibility`, linked from the build warning and error. */
export const BLOCK_MAP_FORMAT_DOCS_URL = "https://www.electron.build/docs/migration/v27-build-changes#block-map-format-follows-electronupdatercompatibility"

/** electron-updater versions before this one cannot read the binary block map; for ranges (`electronUpdaterCompatibility`). */
export const BINARY_BLOCK_MAP_MIN_UPDATER = "7.0.0"

/**
 * The first electron-updater release that reads the binary block map: the 7.0.0 prereleases up to 7.0.0-alpha.12 (npm `next`)
 * cannot, though a range such as `>=7` reads as electron-updater 7.
 */
export const BINARY_BLOCK_MAP_MIN_UPDATER_RELEASE = "7.0.0-alpha.13"

/** Whether the `electronUpdaterCompatibility` range includes only electron-updater versions that read the binary block map. */
export function isBinaryBlockMapSupported(range: string): boolean {
  // no includePrerelease: it would make ">=7" intersect "<7.0.0" at the 7.0.0-0 prerelease point
  return !semver.intersects(range, `<${BINARY_BLOCK_MAP_MIN_UPDATER}`)
}

/**
 * Whether a build with the `blockmap` option `value` writes binary `.blockmap` files for `range`, without the validation and
 * warning of `resolveBlockMapFormat`.
 */
export function writesBinaryBlockMap(value: unknown, range: string): boolean {
  return value !== "v2" && isBinaryBlockMapSupported(range)
}

/** The `electronUpdaterCompatibility` range that applies to a platform: the platform option, then the root option, then the default. */
export function resolveElectronUpdaterCompatibility(
  platformOptions: Pick<PlatformSpecificBuildOptions, "electronUpdaterCompatibility"> | null | undefined,
  config: Pick<PlatformSpecificBuildOptions, "electronUpdaterCompatibility">
): string {
  return platformOptions?.electronUpdaterCompatibility || config.electronUpdaterCompatibility || DEFAULT_ELECTRON_UPDATER_COMPATIBILITY
}

type CompatibilityOptions = Pick<PlatformSpecificBuildOptions, "electronUpdaterCompatibility">
type PlatformKey = "mac" | "win" | "linux"

/** What the app's own electron-updater has to read on one platform of a build. */
export interface ElectronUpdaterRequirement {
  readonly platform: string
  /** the `electronUpdaterCompatibility` of the platform */
  readonly range: string
  /** whether the platform publishes binary `.blockmap` files */
  readonly binaryBlockMap: boolean
}

/**
 * The requirement of each platform a build targets, resolved as the targets resolve them (`platformOptions`, then the root option,
 * then the default). Linux publishes no `.blockmap` file: an AppImage embeds the JSON map.
 */
export function electronUpdaterRequirements(
  config: CompatibilityOptions & { readonly blockmap?: unknown } & { readonly [platform in PlatformKey]?: CompatibilityOptions | null },
  platforms: Iterable<Pick<Platform, "name" | "buildConfigurationKey">>
): Array<ElectronUpdaterRequirement> {
  const requirements: Array<ElectronUpdaterRequirement> = []
  for (const { name, buildConfigurationKey: key } of platforms) {
    const range = resolveElectronUpdaterCompatibility(key === "mac" || key === "win" || key === "linux" ? config[key] : null, config)
    requirements.push({ platform: name, range, binaryBlockMap: key !== "linux" && writesBinaryBlockMap(config.blockmap, range) })
  }
  return requirements
}
