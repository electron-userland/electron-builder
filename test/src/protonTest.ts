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
}

test.ifMac("mac", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.MAC.createTarget("dir", Arch.x64),
      config: {
        framework: "proton",
      },
    },
    checkOptions
  )
)

test.ifNotWindows("linux", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.LINUX.createTarget("appimage", Arch.x64),
      config: {
        framework: "proton",
      },
    },
    checkOptions
  )
)

test.ifWindows("win", { retry: 2 }, ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget("nsis", Arch.x64),
      config: {
        framework: "proton",
      },
    },
    checkOptions
  )
)

test.ifWindows("win ia32", { retry: 2 }, ({ expect }) =>
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
