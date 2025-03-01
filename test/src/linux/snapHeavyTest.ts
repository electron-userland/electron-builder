import { Arch, Platform } from "app-builder-lib"
import { app, snapTarget } from "../helpers/packTester"

// very slow

test(
  "snap full",
  app({
    targets: snapTarget,
    config: {
      extraMetadata: {
        name: "se-wo-template",
      },
      productName: "Snap Electron App (full build)",
      snap: {
        useTemplateApp: false,
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
test(
  "snap full (armhf)",
  app({
    targets: Platform.LINUX.createTarget("snap", Arch.armv7l),
    config: {
      extraMetadata: {
        name: "se-wo-template",
      },
      productName: "Snap Electron App (full build)",
      snap: {
        useTemplateApp: false,
      },
    },
  })
)
