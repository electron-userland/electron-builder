import { Arch } from "app-builder-lib"
import { ToolsetConfig } from "app-builder-lib/internal"
import { testLinux } from "./differentialUpdateHelpers"

const supportedArchs = [
  Arch.x64,
  Arch.arm64,
  // Arch.ia32 // Skipped, electron no longer ships ia32 linux binaries
]

export function registerDifferentialLinuxTests(toolset: Required<Pick<ToolsetConfig, "appimage">>): void {
  const appimage = toolset.appimage
  const toolName = typeof appimage === "object" && appimage != null ? "custom" : appimage

  for (const arch of supportedArchs) {
    test(`${Arch[arch]} - toolset: ${toolName}`, ({ expect }) => testLinux(expect, arch, appimage))
  }
}
