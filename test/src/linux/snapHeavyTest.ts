import { Arch, Platform } from "app-builder-lib"
import { app, EXTENDED_TIMEOUT, snapTarget } from "../helpers/packTester"
import { SnapOptions } from "app-builder-lib/out/options/SnapOptions"

// very slow
const options = { timeout: 3 * EXTENDED_TIMEOUT }

const cores: SnapOptions['core'][] = ["core20", "core24"]

for (const core of cores) {
  describe(`snap core test: ${core}`, () => {
    test("snap full", options, ({ expect }) =>
      app(expect, {
        targets: snapTarget,
        config: {
          extraMetadata: {
            name: "se-wo-template",
          },
          productName: "Snap Electron App (full build)",
          snap: {
            core,
            core24: {
              useGnomeExtension: true,
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
            core,
          },
        },
      })
    )
  })
}
