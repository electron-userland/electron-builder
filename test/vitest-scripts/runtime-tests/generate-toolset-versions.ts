import type { ToolsetConfig } from "app-builder-lib"

// Wine dimension for the Windows-artifact suites (winPackager, assistedInstaller, msiWrapped,
// blackboxWin). These run under `ifWindowsOrWine`: native on Windows, host wine on Linux. They are
// build-only under wine — winHelper.doTest skips install-verification for "0.0.0", so the (often
// interactive) installers never run under wine, which would hang. Keep this at "0.0.0" only; adding
// "1.0.1" flips doTest to run install-verification under wine on Linux and times out.
export const WINE_VERSIONS: ToolsetConfig["wine"][] = ["0.0.0"]
// Bundle-resolution / NsisTarget coverage of the actual wine toolset versions (wineToolset + nsisWine
// suites, mac generator). nsisWine guards its own platform skips; wineToolset asserts path resolution.
export const WINE_TOOLSET_VERSIONS: ToolsetConfig["wine"][] = ["0.0.0", "1.0.1"]
export const WIX_VERSIONS: any /* ToolsetConfig["wix"] */[] = ["0.0.0"]
export const APPIMAGE_VERSIONS: ToolsetConfig["appimage"][] = ["0.0.0", "1.0.2", "1.0.3"]

export const WIN_CODE_SIGN_VERSIONS: ToolsetConfig["winCodeSign"][] = ["0.0.0", "1.0.0", "1.1.0", "1.2.1", "1.3.0"]
export const NSIS_VERSIONS: ToolsetConfig["nsis"][] = ["0.0.0", "1.2.1"]
