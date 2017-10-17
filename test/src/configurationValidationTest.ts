import { Platform } from "electron-builder"
import { app, appThrows, linuxDirTarget } from "./helpers/packTester"

test.ifAll.ifDevOrLinuxCi("validation", appThrows({
  targets: linuxDirTarget,
  config: {
    foo: 123,
    mac: {
      foo: 12123,
    },
  } as any,
}))

test.skip.ifDevOrLinuxCi("appId as object", appThrows({
  targets: linuxDirTarget,
  config: {
    appId: {},
  } as any,
}))

// https://github.com/electron-userland/electron-builder/issues/1302
test.ifAll.ifDevOrLinuxCi("extraFiles", app({
  targets: Platform.LINUX.createTarget([]),
  config: {
    linux: {
      target: "zip:ia32",
    },
    extraFiles: [
      "lib/*.jar",
      "lib/Proguard/**/*",
      {
        from: "lib/",
        to: ".",
        filter: [
          "*.dll"
        ]
      },
      {
        from: "lib/",
        to: ".",
        filter: [
          "*.exe"
        ]
      },
      "BLClient/BLClient.json",
      {
        from: "include/",
        to: "."
      }
    ],
  },
}))