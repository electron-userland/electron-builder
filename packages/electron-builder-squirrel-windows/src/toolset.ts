import { ToolsetConfig } from "app-builder-lib"
import { downloadBuilderToolset, getCustomToolsetPath, resolveToolsetVersion } from "app-builder-lib/internal"

// Newest squirrel.windows bundle — selected when `toolsets.squirrel` is unset / null / "latest".
const SQUIRREL_LATEST = "1.1.1"

export const squirrelWindowsChecksums = {
  "1.1.1": {
    "squirrel.windows-2.0.1-patched.zip": "77cc2c451639c3b0bd68fde67111f726a236e6750d15f521c79e606fd7119e72",
  },
} as const

/**
 * Returns the path to the squirrel.windows toolset directory. It contains an
 * `electron-winstaller/vendor/` subtree with the Squirrel vendor executables (Squirrel.exe,
 * nuget.exe, SyncReleases.exe, 7z, …).
 *
 * Honors `toolsets.squirrel`: a pinned version (or unset / `"latest"`) downloads the maintained
 * electron-builder-binaries bundle; a {@link ToolsetCustom} object supplies a custom or local bundle
 * (which must mirror the same `electron-winstaller/vendor/` layout).
 */
export async function getSquirrelToolsetPath(toolset: ToolsetConfig["squirrel"], resourcesDir: string): Promise<string> {
  if (typeof toolset === "object" && toolset != null) {
    return getCustomToolsetPath(toolset, resourcesDir)
  }
  const version = resolveToolsetVersion(toolset, SQUIRREL_LATEST)
  return downloadBuilderToolset({
    releaseName: `squirrel.windows@${version}`,
    filenameWithExt: "squirrel.windows-2.0.1-patched.zip",
    checksums: squirrelWindowsChecksums[version],
  })
}

// Squirrel's createMsiPackage (msi: true) runs candle.exe/light.exe with `-ext WixNetFxExtension` from
// its own vendor dir. The squirrel.windows bundle omits the WiX toolchain, so reuse the shared WiX
// toolset (the same candle/light electron-builder's MSI target uses) and merge it into the vendor dir.
// This is a transitional WiX 4 (4.0.0.5512): it accepts the v3-style element structure but requires the
// v4 namespace, so template.wxs is authored against http://wixtoolset.org/schemas/v4/wxs.
const WIX_TOOLSET_FILE = "wix-4.0.0.5512.2.7z"
const WIX_TOOLSET_SHA256 = "fe677fcd837b18c9b912985d91636bbd8a1e800c3b3a6a841b6f96e89624e839"

/**
 * Returns the path to the WiX toolset directory (candle.exe, light.exe, WixNetFxExtension.dll, …).
 * Only needed when building an MSI.
 */
export async function getWixToolsetPath(): Promise<string> {
  return downloadBuilderToolset({
    releaseName: "wix-4.0.0.5512.2",
    filenameWithExt: WIX_TOOLSET_FILE,
    checksums: { [WIX_TOOLSET_FILE]: WIX_TOOLSET_SHA256 },
  })
}
