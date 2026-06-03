import type { ToolsetConfig } from "app-builder-lib/src/configuration"

export const WIN_CODE_SIGN_VERSIONS: ToolsetConfig["winCodeSign"][] = ["0.0.0", "1.0.0", "1.1.0", "1.2.1"]
export const NSIS_VERSIONS: ToolsetConfig["nsis"][] = ["0.0.0", "1.2.1", "2.0.0"]
export const WINE_VERSIONS: ToolsetConfig["wine"][] = ["0.0.0", "1.0.1"]
export const WIX_VERSIONS: any /* ToolsetConfig["wix"] */[] = ["0.0.0"]
export const APPIMAGE_VERSIONS: ToolsetConfig["appimage"][] = ["0.0.0", "1.0.2", "1.0.3"]
