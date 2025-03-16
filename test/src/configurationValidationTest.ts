import { validateConfiguration } from "app-builder-lib/out/util/config/config"
import { Arch, DebugLogger } from "builder-util"
import { Configuration, Platform } from "electron-builder"
import { CliOptions, configureBuildCommand, createYargs, normalizeOptions } from "electron-builder/out/builder"
import { app, appThrows, linuxDirTarget } from "./helpers/packTester"

test.ifDevOrLinuxCi("validation", ({ expect }) =>
  appThrows(
    expect,
    {
      targets: linuxDirTarget,
      config: {
        foo: 123,
        mac: {
          foo: 12123,
        },
      } as any,
    },
    undefined,
    error => error.message.includes("configuration has an unknown property 'foo'")
  )
)

test.ifDevOrLinuxCi("appId as object", ({ expect }) =>
  appThrows(expect, {
    targets: linuxDirTarget,
    config: {
      appId: {},
    } as any,
  })
)

// https://github.com/electron-userland/electron-builder/issues/1302
test.ifDevOrLinuxCi("extraFiles", ({ expect }) =>
  app(expect, {
    targets: Platform.LINUX.createTarget("appimage", Arch.x64),
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
          filter: ["*.dll"],
        },
        {
          from: "lib/",
          to: ".",
          filter: ["*.exe"],
        },
        "BLClient/BLClient.json",
        {
          from: "include/",
          to: ".",
        },
      ],
    },
  })
)

test.ifDevOrLinuxCi("files", ({ expect }) => {
  return validateConfiguration(
    {
      appId: "com.example.myapp",
      files: [{ from: "dist/app", to: "app", filter: "*.js" }],
      win: {
        target: "NSIS",
        icon: "build/icon.ico",
      },
    },
    new DebugLogger()
  )
})

test.ifDevOrLinuxCi("null string as null", async ({ expect }) => {
  const yargs = configureBuildCommand(createYargs())
  const options = normalizeOptions(yargs.parse(["-c.mac.identity=null", "--config.mac.hardenedRuntime=false"]) as CliOptions)
  const config = options.config as Configuration
  await validateConfiguration(config, new DebugLogger())
  expect(config.mac!.identity).toBeNull()
  expect(config.mac!.hardenedRuntime).toBe(false)
})
