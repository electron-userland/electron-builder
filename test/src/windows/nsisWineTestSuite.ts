import type { ToolsetConfig } from "app-builder-lib/internal"
import { Arch, Platform } from "electron-builder"
import fsExtra from "fs-extra"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert.js"
import { app, copyTestAsset, EXTENDED_TIMEOUT, modifyPackageJson } from "../helpers/packTester.js"
import { checkHelpers, doTest, expectUpdateMetadata } from "../helpers/winHelper.js"

/**
 * Wine × NSIS test matrix. Registered once per wine version by the generated toolset test files.
 *
 * Coverage:
 *  - NsisTarget uninstaller extraction via WineVmManager (every oneClick build triggers this)
 *  - perMachine and perUser install paths via doTest
 *  - x64 uninstaller extraction (build-only; proves WineVmManager works for x64 targets)
 *  - Non-oneClick assisted installer (menuCategory variants)
 *  - File associations, multi-language license, custom NSIS include
 */
export function registerNsisWineTests(toolsets: ToolsetConfig): void {
  const { wine } = toolsets

  // The legacy wine-4.0.1-mac bundle (0.0.0) is incompatible with modern macOS (version mismatch)
  // and CI Linux environments don't ship a host wine binary.  Toolset-resolution coverage for 0.0.0
  // is already in wineToolsetSuite; skip the full build matrix here.
  if (wine === "0.0.0") {
    return
  }

  // --- oneClick: triggers NsisTarget → WineVmManager for uninstaller extraction ---

  test.ifNotWindows("perMachine oneClick — build + install", { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
        config: {
          // ASCII product name: wine produces garbled unicode registry entries
          productName: "TestApp",
          fileAssociations: [{ ext: "foo", name: "Test Foo" }],
          nsis: { perMachine: true, runAfterFinish: false },
          publish: {
            provider: "generic",
            // tslint:disable-next-line:no-invalid-template-strings
            url: "https://develar.s3.amazonaws.com/test/${os}/${arch}",
          },
          win: { electronUpdaterCompatibility: ">=2.16" },
          toolsets,
        },
      },
      {
        projectDirCreated: projectDir =>
          Promise.all([
            copyTestAsset("headerIcon.ico", path.join(projectDir, "build", "foo test space.ico")),
            copyTestAsset("license.txt", path.join(projectDir, "build", "license.txt")),
          ]),
        packed: async context => {
          await expectUpdateMetadata(expect, context)
          await checkHelpers(expect, context.getResources(Platform.WINDOWS, Arch.ia32), true)
          await doTest(expect, context.outDir, false, undefined, undefined, null, true, toolsets)
        },
      }
    )
  )

  test.ifNotWindows("perUser oneClick — build + install", { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
        config: {
          productName: "TestApp",
          nsis: { perMachine: false },
          toolsets,
        },
      },
      {
        packed: async context => {
          await doTest(expect, context.outDir, true, undefined, undefined, null, true, toolsets)
        },
      }
    )
  )

  // x64 build: exercises WineVmManager for 64-bit uninstaller extraction
  test.ifNotWindows("x64 oneClick — build", { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
    app(expect, {
      targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
      config: { productName: "TestApp", toolsets },
    })
  )

  // --- Non-oneClick / assisted installer ---

  test.ifNotWindows("menuCategory — build + install", { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
        config: {
          extraMetadata: { name: "test-menu-category", productName: "Test Menu Category" },
          publish: null,
          nsis: {
            oneClick: false,
            menuCategory: true,
            // tslint:disable-next-line:no-invalid-template-strings
            artifactName: "${productName} CustomName ${version}.${ext}",
          },
          toolsets,
        },
      },
      {
        projectDirCreated: projectDir => modifyPackageJson(projectDir, data => (data.name = "test-menu-category")),
        packed: context => doTest(expect, context.outDir, false, "Test Menu Category", "test-menu-category", "Foo Bar", true, toolsets),
      }
    )
  )

  test.ifNotWindows("string menuCategory — build + install", { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
        config: {
          extraMetadata: { name: "test-menu-category", productName: "Test Menu Category '" },
          publish: null,
          nsis: {
            oneClick: false,
            runAfterFinish: false,
            menuCategory: "Foo/Bar",
            // tslint:disable-next-line:no-invalid-template-strings
            artifactName: "${productName} CustomName ${version}.${ext}",
          },
          toolsets,
        },
      },
      {
        projectDirCreated: projectDir => modifyPackageJson(projectDir, data => (data.name = "test-menu-category")),
        packed: async context => {
          await doTest(expect, context.outDir, false, "Test Menu Category", "test-menu-category", "Foo Bar", true, toolsets)
        },
      }
    )
  )

  // --- File associations ---

  test.ifNotWindows("perUser file associations — build + install", { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
        config: {
          productName: "TestApp",
          publish: null,
          fileAssociations: [{ ext: "foo", name: "Test Foo" }],
          nsis: { perMachine: false },
          toolsets,
        },
      },
      {
        packed: async context => {
          await doTest(expect, context.outDir, true, undefined, undefined, null, true, toolsets)
        },
      }
    )
  )

  // --- License page (build only — verifies NSIS license processing doesn't break under wine) ---

  test.ifNotWindows("multi-language license — build", { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
        config: {
          publish: null,
          nsis: { uninstallDisplayName: "Hi!!!", createDesktopShortcut: false },
          toolsets,
        },
      },
      {
        projectDirCreated: projectDir =>
          Promise.all([
            fsExtra.writeFile(path.join(projectDir, "build", "license_en.txt"), "Hi"),
            fsExtra.writeFile(path.join(projectDir, "build", "license_ru.txt"), "Привет"),
            fsExtra.writeFile(path.join(projectDir, "build", "license_fi.txt"), "Привет"),
          ]),
      }
    )
  )

  // --- Custom NSIS include (build only — verifies NsisTarget hook processing) ---

  test.ifNotWindows("custom include — build", { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
        config: { toolsets },
      },
      {
        projectDirCreated: projectDir => copyTestAsset("installer.nsh", path.join(projectDir, "build", "installer.nsh")),
        packed: context =>
          Promise.all([
            assertThat(expect, path.join(context.projectDir, "build", "customHeader")).isFile(),
            assertThat(expect, path.join(context.projectDir, "build", "customInit")).isFile(),
            assertThat(expect, path.join(context.projectDir, "build", "customInstall")).isFile(),
          ]),
      }
    )
  )
}
