import { copyDir } from "builder-util/out/fs"
import { Arch, Platform } from "electron-builder"
import { app, AssertPackOptions } from "./helpers/packTester"

const checkOptions: AssertPackOptions = {
  projectDirCreated: async projectDir => {
    const src = process.env.PROTON_NATIVE_TEST_NODE_MODULES
    if (src != null) {
      await copyDir(src, projectDir + "/node_modules")
    }
  },
  isInstallDepsBefore: false,
}

test.ifAll.ifMac("mac", app({
  targets: Platform.MAC.createTarget(),
  config: {
    protonNodeVersion: "current",
  },
}, checkOptions))

test.ifAll.ifLinuxOrDevMac("linux", app({
  targets: Platform.LINUX.createTarget("appimage"),
  config: {
    protonNodeVersion: "current",
  },
}, checkOptions))

test.ifAll.ifDevOrWinCi("win", app({
  targets: Platform.WINDOWS.createTarget("nsis"),
  config: {
    protonNodeVersion: "current",
  },
}, checkOptions))

test.ifAll.ifDevOrWinCi("win ia32", app({
  targets: Platform.WINDOWS.createTarget("nsis", Arch.ia32),
  config: {
    protonNodeVersion: "current",
  },
}, checkOptions))