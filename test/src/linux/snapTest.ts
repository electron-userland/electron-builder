import { Platform } from "electron-builder"
import { app } from "../helpers/packTester"
import isCi from "is-ci"

if (!((isCi && process.platform === "linux") || process.env.SNAP_TEST === "true")) {
  fit("Skip snapTest suite — not Linux CI or env SNAP_TEST not set to true", () => {
    console.warn("[SKIP] Skip snapTest suite — not Linux CI or env SNAP_TEST not set to true")
  })
}

test("platform", app({
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

test("snap", app({
  targets: Platform.LINUX.createTarget("snap"),
  config: {
    productName: "Sep",
  },
  appMetadata: {
    name: "sep",
  },
}))
