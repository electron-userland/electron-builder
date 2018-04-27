import { app } from "../helpers/packTester"
import { Platform } from "electron-builder"

test.ifAll.ifDevOrWinCi("msi", app({
  targets: Platform.WINDOWS.createTarget("msi"),
  config: {
    appId: "build.electron.test.msi.oneClick.perMachine",
    extraMetadata: {
      // version: "1.0.0",
    },
    productName: "Test MSI",
  }
}, {
  // signed: true,
}))

test.ifAll.ifDevOrWinCi("msi no asar", app({
  targets: Platform.WINDOWS.createTarget("msi"),
  config: {
    appId: "build.electron.test.msi.oneClick.perMachine",
    extraMetadata: {
      // version: "1.0.0",
    },
    productName: "Test MSI",
    asar: false,
  }
}, {
  // signed: true,
}))

test.ifAll.ifDevOrWinCi("per-user", app({
  targets: Platform.WINDOWS.createTarget("msi"),
  config: {
    appId: "build.electron.test.msi.oneClick.perUser",
    extraMetadata: {
      // version: "1.0.0",
    },
    productName: "Test MSI Per User",
    msi: {
      perMachine: false,
    }
  }
}, {
  // signed: true,
}))

test.skip.ifAll("assisted", app({
  targets: Platform.WINDOWS.createTarget("msi"),
  config: {
    appId: "build.electron.test.msi.assisted",
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