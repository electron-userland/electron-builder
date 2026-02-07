import { Arch, Platform } from "app-builder-lib"
import { app, EXTENDED_TIMEOUT, snapTarget } from "../helpers/packTester"
import * as which from "which"

// very slow

const hasSnapInstalled = () => which.sync("snap", { nothrow: true }) != null

describe.heavy.ifEnv(hasSnapInstalled())("snap heavy", { sequential: true, timeout: EXTENDED_TIMEOUT }, () => {
  test("snap full", ({ expect }) =>
    app(expect, {
      targets: snapTarget,
      config: {
        extraMetadata: {
          name: "se-wo-template",
        },
        productName: "Snap Electron App (full build)",
        snap: {
          core: "core24",
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
    }))

  // very slow
  test("snap full (armhf)", ({ expect }) =>
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
    }))
})
