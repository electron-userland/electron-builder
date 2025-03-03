import { Platform } from "electron-builder"
import { app } from "../helpers/packTester"

test.ifNotWindows.ifDevOrLinuxCi("tar", ({ expect }) =>
  app(expect, {
    targets: Platform.LINUX.createTarget(["tar.xz", "tar.lz", "tar.bz2"]),
    config: {
      electronFuses: {
        runAsNode: true,
        enableCookieEncryption: true,
        enableNodeOptionsEnvironmentVariable: true,
        enableNodeCliInspectArguments: true,
        enableEmbeddedAsarIntegrityValidation: true,
        onlyLoadAppFromAsar: true,
        loadBrowserProcessSpecificV8Snapshot: true,
        grantFileProtocolExtraPrivileges: undefined, // unsupported on current electron version in our tests
      },
    },
  })
)
