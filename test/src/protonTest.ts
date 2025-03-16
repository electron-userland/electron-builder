import { copyDir } from "builder-util"
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

test.ifMac("mac", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.MAC.createTarget(),
      config: {
        framework: "proton",
      },
    },
    checkOptions
  )
)

test.ifLinuxOrDevMac("linux", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.LINUX.createTarget("appimage"),
      config: {
        framework: "proton",
      },
    },
    checkOptions
  )
)

test.ifDevOrWinCi("win", { retry: 2 }, ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget("nsis"),
      config: {
        framework: "proton",
      },
    },
    checkOptions
  )
)

test.ifDevOrWinCi("win ia32", { retry: 2 }, ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget("nsis", Arch.ia32),
      config: {
        framework: "proton",
      },
    },
    checkOptions
  )
)
