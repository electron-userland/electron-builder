import { Platform } from "electron-builder"
import { app } from "../helpers/packTester"

const TIMEOUT = 240000

test.ifNotWindows.ifDevOrLinuxCi(
  "targets",
  app({
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
  }),
  { timeout: TIMEOUT }
)

// https://github.com/electron-userland/electron-builder/issues/460
// for some reasons in parallel to fmp we cannot use tar
test.ifNotWindows.ifDevOrLinuxCi(
  "rpm and tar.gz",
  app({
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
  }),
  { timeout: TIMEOUT }
)
