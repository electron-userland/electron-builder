import { Platform } from "out"
import { app } from "../helpers/packTester"

test.ifLinux("platform", app({
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

test.ifLinux("snap", app({
  targets: Platform.LINUX.createTarget("snap"),
  config: {
    productName: "Sep",
  },
  appMetadata: {
    name: "sep",
  },
}))
