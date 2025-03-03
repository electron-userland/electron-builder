import { Platform } from "electron-builder"
import { app } from "../helpers/packTester"

// "apk" is very slow, don't test for now
test.ifDevOrLinuxCi("targets", ({ expect }) =>
  app(expect, {
    targets: Platform.LINUX.createTarget(["sh", "freebsd", "pacman", "zip", "7z"]),
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

// https://github.com/electron-userland/electron-builder/issues/460
// for some reasons in parallel to fmp we cannot use tar
test.ifDevOrLinuxCi("rpm and tar.gz", ({ expect }) =>
  app(expect, {
    targets: Platform.LINUX.createTarget(["rpm", "tar.gz"]),
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
