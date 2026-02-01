import { Arch, Platform } from "app-builder-lib"
import { app, EXTENDED_TIMEOUT, snapTarget } from "../helpers/packTester"

// very slow
const options = { timeout: 2 * EXTENDED_TIMEOUT }

test("snap full", options, ({ expect }) =>
  app(expect, {
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "se-wo-template",
      },
      productName: "Snap Electron App (full build)",
      snap: {
        core: "core24",
        core24: {
          useGnomeExtension: true,
          // useDestructiveMode: true,
          // useMultipass: true
        },
      },
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

// very slow
test("snap full (armhf)", options, ({ expect }) =>
  app(expect, {
    targets: Platform.LINUX.createTarget("snap", Arch.armv7l),
    config: {
      extraMetadata: {
        name: "se-wo-template",
      },
      productName: "Snap Electron App (full build)",
      snap: {
        core: "core24",
      },
    },
  })
)
