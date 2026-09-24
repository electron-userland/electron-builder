import { Arch, Platform } from "electron-builder"
import { app, EXTENDED_TIMEOUT } from "../helpers/packTester.js"
import { checkHelpers, doTest, expectUpdateMetadata } from "../helpers/winHelper.js"

// Installer-building tests (custom includes, licenses, menuCategory, …) live in oneClickInstaller.e2e.ts.

test("one-click", { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
      config: {
        win: {
          sign: {
            type: "signtool" as const,
            // An explicit publisherName must now include at least one name matching the signing
            // certificate (the ephemeral test identity, CN=EB Test Code Signing) — extra names for
            // certificate rotation still pass through to app-update.yml verbatim.
            publisherName: ["Foo, Inc", "CN=EB Test Code Signing"],
          },
        },
        publish: {
          provider: "generic",
          // tslint:disable:no-invalid-template-strings
          url: "https://develar.s3.amazonaws.com/test/${os}/${arch}",
        },
        nsis: {
          deleteAppDataOnUninstall: true,
          packElevateHelper: false,
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
    },
    {
      signedWin: true,
      // Everything asserted here lives in win-unpacked (app-update.yml written by afterPack, no elevate.exe), so stop
      // before the NSIS installer is built. The nsis target stays configured so app-update.yml is generated.
      // The full installer build is covered by "one-click (e2e)" in oneClickInstaller.e2e.ts.
      afterPackTestHook: async () => true,
      packed: async context => {
        await checkHelpers(expect, context.getResources(Platform.WINDOWS, Arch.x64), false)
        await doTest(expect, context.outDir, true, "TestApp Setup", "TestApp", null, false)
        await expectUpdateMetadata(expect, context, Arch.x64, true)
      },
    }
  )
)
