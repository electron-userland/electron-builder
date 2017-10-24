import { app } from "../helpers/packTester"
import { Platform } from "electron-builder"

test.ifAll("msi", app({
  targets: Platform.WINDOWS.createTarget("msi"),
  config: {
    extraMetadata: {
      // version: "1.0.0",
    },
    productName: "Test MSI",
  }
}, {
  // signed: true,
}))

test.ifAll("assisted", app({
  targets: Platform.WINDOWS.createTarget("msi"),
  config: {
    extraMetadata: {
      // version: "1.0.0",
    },
    productName: "Test MSI Assisted",
    // test lzx (currently, doesn't work on wine)
    compression: "maximum",
    msi: {
      oneClick: false,
      menuCategory: "TestMenuDirectory"
    },
  }
}))