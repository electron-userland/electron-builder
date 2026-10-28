import * as semver from "semver"
import { DEFAULT_TARGET, type Platform } from "../core.js"
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

/** The targets whose `.blockmap` file electron-updater reads, by platform; `DEFAULT_TARGET` (an NSIS installer, a zip and a dmg) among them. */
const BLOCK_MAP_FILE_TARGETS: Readonly<Record<PlatformKey, ReadonlyArray<string>>> = {
  // not the portable executable, nor nsis-web, whose package embeds its map
  win: [DEFAULT_TARGET, "nsis"],
  // MacUpdater downloads only the zip, so a dmg's map is never read
  mac: [DEFAULT_TARGET, "zip"],
  // an AppImage embeds its map
  linux: [],
}

/** What the app's own electron-updater has to read on one platform of a build. */
export interface ElectronUpdaterRequirement {
  readonly platform: string
  /** the `electronUpdaterCompatibility` of the platform */
  readonly range: string
  /** whether the platform publishes binary `.blockmap` files that electron-updater reads */
  readonly binaryBlockMap: boolean
}

/**
 * The requirement of each platform a build targets, resolved as the targets resolve them (`platformOptions`, then the root option,
 * then the default). `builtTargets`: the target names each platform builds (see `resolveTargetNames`).
 */
export function electronUpdaterRequirements(
  config: CompatibilityOptions & { readonly blockmap?: unknown } & { readonly [platform in PlatformKey]?: CompatibilityOptions | null },
  builtTargets: Iterable<readonly [Pick<Platform, "name" | "buildConfigurationKey">, Iterable<string>]>
): Array<ElectronUpdaterRequirement> {
  const requirements: Array<ElectronUpdaterRequirement> = []
  for (const [{ name, buildConfigurationKey: key }, targetNames] of builtTargets) {
    const isKnown = key === "mac" || key === "win" || key === "linux"
    const range = resolveElectronUpdaterCompatibility(isKnown ? config[key] : null, config)
    const writesBlockMapFile = isKnown && [...targetNames].some(it => BLOCK_MAP_FILE_TARGETS[key].includes(it))
    requirements.push({ platform: name, range, binaryBlockMap: writesBlockMapFile && writesBinaryBlockMap(config.blockmap, range) })
  }
  return requirements
}
