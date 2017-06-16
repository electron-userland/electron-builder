import { DIR_TARGET, Platform } from "electron-builder"
import { app } from "./helpers/packTester"

test.ifAll.ifDevOrLinuxCi("muon linux", app({
  targets: Platform.LINUX.createTarget(DIR_TARGET),
  config: {
    muonVersion: "2.56.9",
  },
}))

test.ifAll.ifMac("muon mac", app({
  targets: Platform.MAC.createTarget(DIR_TARGET),
  config: {
    muonVersion: "2.56.9",
  },
}))

test.ifAll.ifMac("muon win", app({
  targets: Platform.WINDOWS.createTarget(DIR_TARGET),
  config: {
    muonVersion: "2.56.9",
  },
}))