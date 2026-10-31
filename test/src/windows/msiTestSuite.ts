import { Arch, Platform } from "electron-builder"
import { execFileSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import { app } from "../helpers/packTester"
import { ToolsetConfig } from "app-builder-lib"
import { resolveWixVersion } from "app-builder-lib/src/toolsets/wix"

const target = Platform.WINDOWS.createTarget("msi", Arch.x64)

/** The Template property (platform;languages) of an MSI's summary information, read with the Windows Installer COM API. */
function readMsiTemplate(msiFile: string): string {
  const script = [
    "$installer = New-Object -ComObject WindowsInstaller.Installer",
    `$info = $installer.GetType().InvokeMember("SummaryInformation", "GetProperty", $null, $installer, @('${msiFile.replace(/'/g, "''")}', 0))`,
    '$info.GetType().InvokeMember("Property", "GetProperty", $null, $info, @(7))',
  ].join("; ")
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" }).trim()
}

function findMsi(outDir: string): string {
  const msi = fs.readdirSync(outDir).find(it => it.endsWith(".msi"))
  if (msi == null) {
    throw new Error(`no .msi in ${outDir}`)
  }
  return path.join(outDir, msi)
}

export function registerMsiTests(toolsets: ToolsetConfig): void {
  // only the legacy (WiX 4 preview) bundle reads v4 namespaces; WiX 3 extensions have their own
  const isWix3 = typeof toolsets.wix === "object" || resolveWixVersion(toolsets.wix) !== "0.0.0"
  const utilNamespace = isWix3 ? "http://schemas.microsoft.com/wix/UtilExtension" : "http://wixtoolset.org/schemas/v4/wxs/util"

  test("msi", ({ expect }) =>
    app(
      expect,
      {
        targets: target,
        config: {
          toolsets,
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
    ))

  test("msi no asar", ({ expect }) =>
    app(
      expect,
      {
        targets: target,
        config: {
          toolsets,
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
    ))

  test("per-user", ({ expect }) =>
    app(
      expect,
      {
        targets: target,
        config: {
          toolsets,
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
    ))

  const wixArgsProductName = "Test WiX Args"
  test("wix args", ({ expect }) =>
    app(
      expect,
      {
        targets: target,
        config: {
          toolsets,
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
                `<util:CloseApplication xmlns:util="${utilNamespace}"
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
    ))

  // WiX 3 builds a native arm64 MSI; the legacy bundle has no arm64 and packages the arm64 app in an x64 MSI
  test("arm64", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget("msi", Arch.arm64),
        config: {
          toolsets,
          appId: "build.electron.test.msi.arm64",
          productName: "Test MSI arm64",
        },
      },
      {
        packed: async context => {
          expect(readMsiTemplate(findMsi(context.outDir))).toBe(isWix3 ? "Arm64;1033" : "x64;1033")
        },
      }
    ))

  // two files of the same name in different directories: WiX 3 derives an omitted File/@Id from the file name alone (LGHT0091)
  test("same file name in two directories", ({ expect }) =>
    app(
      expect,
      {
        targets: target,
        config: {
          toolsets,
          appId: "build.electron.test.msi.sameName",
          productName: "Test MSI Same Name",
          fileOptions: {
            extraResources: [{ from: "same-name", to: "same-name" }],
          },
        },
      },
      {
        projectDirCreated: async projectDir => {
          for (const dir of ["a", "b", path.join("b", "c")]) {
            await fs.promises.mkdir(path.join(projectDir, "same-name", dir), { recursive: true })
            await fs.promises.writeFile(path.join(projectDir, "same-name", dir, "index.txt"), dir)
          }
        },
      }
    ))

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
