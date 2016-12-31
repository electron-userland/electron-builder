import { Platform } from "electron-builder"
import { app } from "../helpers/packTester"

test.ifLinuxOrDevMac("platform", app({
  targets: Platform.LINUX.createTarget("snap"),
  config: {
    productName: "Sep P",
    snap: {
      ubuntuAppPlatformContent: "ubuntu-app-platform1",
    },
  },
  appMetadata: {
    name: "sep-p",
  },
}))

test.ifLinuxOrDevMac("snap", app({
  targets: Platform.LINUX.createTarget("snap"),
  config: {
    productName: "Sep",
  },
  appMetadata: {
    name: "sep",
  },
}))
