import { ToolsetConfig } from "app-builder-lib/src"
import { registerLinuxPackagerTests } from "../linuxPackagerTestSuite"

const appimage: ToolsetConfig["appimage"] = "0.0.0"

describe.ifNotWindows("LinuxPackager", () => {
  describe(`AppImage toolset ${appimage}`, () => {
    registerLinuxPackagerTests({ appimage })
  })
})
