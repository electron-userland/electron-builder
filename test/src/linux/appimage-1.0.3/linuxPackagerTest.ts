import { ToolsetConfig } from "app-builder-lib/src"
import { registerLinuxPackagerTests } from "../linuxPackagerTestSuite"

const appimage: ToolsetConfig["appimage"] = "1.0.3"

describe.ifNotWindows("LinuxPackager", () => {
  describe(`AppImage toolset ${appimage}`, () => {
    registerLinuxPackagerTests({ appimage })
  })
})
