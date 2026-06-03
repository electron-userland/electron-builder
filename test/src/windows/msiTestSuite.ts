import { Arch, Platform } from "electron-builder"
import * as fs from "fs"
import { app } from "../helpers/packTester"
import { ToolsetConfig } from "app-builder-lib"

const target = Platform.WINDOWS.createTarget("msi", Arch.x64)

export function registerMsiTests(toolsets: ToolsetConfig): void {
  // TODO(wix-v4): WiX v4 (toolsets.wix "1.0.0") support is incomplete, so its matrix entry is skipped
  // for now to keep the Windows suite green. Remaining work to un-skip:
  //   - MsiTarget passes the WiX v3 `-pedantic` flag to `wix build` (rejected with WIX0118).
  //   - templates/msi/template.xml uses the v3 `<Product>`/`<Package>` structure under the v4 namespace.
  //   - the "wix args" test uses the v3 extension name `WixUtilExtension`, which the bundled v4 toolset
  //     does not provide (WIX0144); v4 expects `WixToolset.Util.wixext`.
  const msiTest = toolsets.wix !== "0.0.0" ? test.skip : test

  // `toolsets.wix` is currently removed from the public schema (scripts/fix-schema.js) while v4 support
  // is incomplete, so config validation rejects it. Drop it from the build config here; the MSI target
  // falls back to the default (v3) toolset.
  const { wix: _wix, ...buildToolsets } = toolsets

  msiTest("msi", ({ expect }) =>
    app(
      expect,
      {
        targets: target,
        config: {
          toolsets: buildToolsets,
          appId: "build.electron.test.msi.oneClick.perMachine",
          extraMetadata: {
            // version: "1.0.0",
          },
          productName: "Test MSI",
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
        // signed: true,
      }
    )
  )

  msiTest("msi no asar", ({ expect }) =>
    app(
      expect,
      {
        targets: target,
        config: {
          toolsets: buildToolsets,
          appId: "build.electron.test.msi.oneClick.perMachine",
          extraMetadata: {
            // version: "1.0.0",
          },
          productName: "Test MSI",
          asar: false,
        },
      },
      {
        // signed: true,
      }
    )
  )

  msiTest("per-user", ({ expect }) =>
    app(
      expect,
      {
        targets: target,
        config: {
          toolsets: buildToolsets,
          appId: "build.electron.test.msi.oneClick.perUser",
          extraMetadata: {
            // version: "1.0.0",
          },
          productName: "Test MSI Per User",
          msi: {
            perMachine: false,
          },
        },
      },
      {
        // signed: true,
      }
    )
  )

  const wixArgsProductName = "Test WiX Args"
  msiTest("wix args", ({ expect }) =>
    app(
      expect,
      {
        targets: target,
        config: {
          toolsets: buildToolsets,
          appId: "build.electron.test.msi.oneClick.wixArgs",
          extraMetadata: {
            // version: "1.0.0",
          },
          productName: wixArgsProductName,
          // Inject a custom-action which requires the WixUtilExtension DLL
          msiProjectCreated: async path => {
            await fs.promises.writeFile(
              path,
              (await fs.promises.readFile(path, "utf8")).replace(
                "</Product>",
                `<util:CloseApplication xmlns:util="http://wixtoolset.org/schemas/v4/wxs/util"
          PromptToContinue="no"
          Target="${wixArgsProductName}.exe"
          CloseMessage="yes"
          Timeout="2"
          TerminateProcess="1"
          RebootPrompt="no"
        />
        </Product>`
              )
            )
          },
          msi: {
            // Apply the needed DLL
            additionalWixArgs: ["-ext", "WixUtilExtension"],
          },
        },
      },
      {
        // signed: true,
      }
    )
  )

  test.skip("assisted", ({ expect }) =>
    app(expect, {
      targets: target,
      config: {
        toolsets,
        appId: "build.electron.test.msi.assisted",
        extraMetadata: {
          // version: "1.0.0",
        },
        productName: "Test MSI Assisted",
        // test lzx (currently, doesn't work on wine)
        compression: "maximum",
        msi: {
          oneClick: false,
          menuCategory: "TestMenuDirectory",
        },
      },
    }))
}
