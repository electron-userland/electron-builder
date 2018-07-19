import { DebugLogger } from "builder-util/out/DebugLogger"
import { Platform } from "electron-builder"
import { validateConfig } from "app-builder-lib/out/util/config"
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
  targets: Platform.LINUX.createTarget("appimage"),
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

test.ifAll.ifDevOrLinuxCi("files", () => {
  return validateConfig({
    appId: "com.example.myapp",
    files: [{from: "dist/app", to: "app", filter: "*.js"}],
    win: {
      target: "NSIS",
      icon: "build/icon.ico"
    }
  }, new DebugLogger())
})