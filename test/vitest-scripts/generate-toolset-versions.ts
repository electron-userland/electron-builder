import type { ToolsetConfig } from "app-builder-lib/src/configuration"

// Toolset versions the generated Windows test matrix (generate-toolset-tests-windows.ts) is built against.
// Kept in their own module so test suites can gate a case to the newest toolset combination (see isLatestToolset).
export const WIN_CODE_SIGN_VERSIONS: ToolsetConfig["winCodeSign"][] = ["0.0.0", "1.0.0", "1.1.0"]
export const NSIS_VERSIONS: ToolsetConfig["nsis"][] = ["0.0.0", "1.2.1"]
