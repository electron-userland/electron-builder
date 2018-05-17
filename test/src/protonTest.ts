import { Platform } from "electron-builder"
import { app } from "./helpers/packTester"

test.ifAll.ifMac("mac", app({
  targets: Platform.MAC.createTarget(),
  config: {
    protonNodeVersion: "current",
  },
}))

test.ifAll.ifLinuxOrDevMac("linux", app({
  targets: Platform.LINUX.createTarget("appimage"),
  config: {
    protonNodeVersion: "current",
  },
}))