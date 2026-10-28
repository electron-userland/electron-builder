import type { PlatformSpecificBuildOptions } from "../options/PlatformSpecificBuildOptions.js"

/** Default `electronUpdaterCompatibility`: the electron-updater versions the installed apps are assumed to ship. */
export const DEFAULT_ELECTRON_UPDATER_COMPATIBILITY = ">=7"

/** v27 breaking-changes entry on the block map format following `electronUpdaterCompatibility`, linked from the build warning and error. */
export const BLOCK_MAP_FORMAT_DOCS_URL = "https://www.electron.build/docs/migration/v27-build-changes#block-map-format-follows-electronupdatercompatibility"

/** The `electronUpdaterCompatibility` range that applies to a platform: the platform option, then the root option, then the default. */
export function resolveElectronUpdaterCompatibility(
  platformOptions: Pick<PlatformSpecificBuildOptions, "electronUpdaterCompatibility"> | null | undefined,
  config: Pick<PlatformSpecificBuildOptions, "electronUpdaterCompatibility">
): string {
  return platformOptions?.electronUpdaterCompatibility || config.electronUpdaterCompatibility || DEFAULT_ELECTRON_UPDATER_COMPATIBILITY
}

type CompatibilityOptions = Pick<PlatformSpecificBuildOptions, "electronUpdaterCompatibility">

/** Every `electronUpdaterCompatibility` range a configuration declares: the root option (or the default) and each platform's own. */
export function declaredElectronUpdaterCompatibility(
  config: CompatibilityOptions & {
    [platform in "mac" | "mas" | "win" | "linux"]?: CompatibilityOptions | null
  }
): Array<string> {
  const ranges = new Set([resolveElectronUpdaterCompatibility(null, config)])
  for (const platformOptions of [config.mac, config.mas, config.win, config.linux]) {
    if (platformOptions?.electronUpdaterCompatibility) {
      ranges.add(platformOptions.electronUpdaterCompatibility)
    }
  }
  return [...ranges]
}
