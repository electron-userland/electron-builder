import { DIR_TARGET, Platform } from "electron-builder"
import { app } from "./helpers/packTester"

test.ifAll.ifMac("mac", app({
  targets: Platform.MAC.createTarget(DIR_TARGET),
  config: {
    protonNodeVersion: "9.8.0",
  },
}))