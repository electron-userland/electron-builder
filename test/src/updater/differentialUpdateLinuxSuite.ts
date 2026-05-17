import { Arch } from "app-builder-lib"
import { ToolsetConfig } from "app-builder-lib/src/configuration"
import { testLinux } from "./differentialUpdateHelpers"

const supportedArchs = [
  Arch.x64,
  Arch.arm64,
  // Arch.ia32 // Skipped, electron no longer ships ia32 linux binaries
]

export function registerDifferentialLinuxTests(appimage: ToolsetConfig["appimage"]): void {
  for (const arch of supportedArchs) {
    test(`${Arch[arch]} - toolset: ${appimage}`, ({ expect }) => testLinux(expect, arch, appimage))
  }
}
