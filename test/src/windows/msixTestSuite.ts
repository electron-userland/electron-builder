import { Arch, Platform } from "electron-builder"
import { readFile } from "fs-extra"
import { mkdir } from "fs/promises"
import * as path from "path"
import { app, appThrows, copyTestAsset } from "../helpers/packTester"
import { ToolsetConfig } from "app-builder-lib"

const target = Platform.WINDOWS.createTarget(["msix"], Arch.x64)

export function registerMsixTests(toolsets: ToolsetConfig): void {
  test("MSIX", ({ expect }) =>
    app(
      expect,
      {
        targets: target,
        config: {
          toolsets,
          electronFuses: {
            runAsNode: true,
            enableCookieEncryption: true,
            enableNodeOptionsEnvironmentVariable: true,
            enableNodeCliInspectArguments: true,
            enableEmbeddedAsarIntegrityValidation: true,
            onlyLoadAppFromAsar: true,
            loadBrowserProcessSpecificV8Snapshot: true,
            grantFileProtocolExtraPrivileges: undefined,
          },
        },
      },
      {
        projectDirCreated: async projectDir => {
          const targetDir = path.join(projectDir, "build", "appx")
          await mkdir(targetDir, { recursive: true })
          await Promise.all(
            ["BadgeLogo.scale-100.png", "BadgeLogo.scale-140.png", "BadgeLogo.scale-180.png"].map(it => copyTestAsset(`appx-assets/${it}`, path.join(targetDir, it)))
          )
        },
        signedWin: true,
      }
    ))

  test("msix auto launch extension", ({ expect }) =>
    app(
      expect,
      {
        targets: target,
        config: {
          toolsets,
          msix: {
            addAutoLaunchExtension: true,
          },
        },
      },
      {}
    ))

  test("msix application id", ({ expect }) =>
    app(
      expect,
      {
        targets: target,
        config: {
          toolsets,
          msix: {
            identityName: "01234Test.ApplicationDataSample",
          },
        },
      },
      {}
    ))

  test("msix languages and not signed (windows store only)", ({ expect }) =>
    app(expect, {
      targets: Platform.WINDOWS.createTarget(["msix"], Arch.ia32, Arch.x64),
      config: {
        toolsets,
        msix: {
          languages: ["de-DE", "ru-RU"],
          minVersion: "10.0.17763.0",
          maxVersionTested: "10.0.17763.0",
        },
      },
    }))

  test("msix custom template manifest", ({ expect }) =>
    app(expect, {
      targets: target,
      config: {
        toolsets,
        msix: {
          customManifestPath: "custom-template-manifest.xml",
        },
        appxManifestCreated: async filepath => {
          const fileContent = await readFile(filepath, "utf-8")
          expect(fileContent).toMatchSnapshot()
        },
      },
    }))

  test("msix enforcePackageIntegrity manifest contains uap10 element", ({ expect }) =>
    app(expect, {
      targets: target,
      config: {
        toolsets,
        msix: {
          enforcePackageIntegrity: true,
        },
        appxManifestCreated: async filepath => {
          const fileContent = await readFile(filepath, "utf-8")
          expect(fileContent).toContain('<uap10:PackageIntegrity><uap10:Content Enforcement="on" /></uap10:PackageIntegrity>')
          expect(fileContent).toContain("xmlns:uap10=")
        },
      },
    }))

  test("msix windowsServices manifest contains desktop6 elements", ({ expect }) =>
    app(expect, {
      targets: target,
      config: {
        toolsets,
        msix: {
          windowsServices: [
            {
              name: "MyBackgroundService",
            },
          ],
        },
        appxManifestCreated: async filepath => {
          const fileContent = await readFile(filepath, "utf-8")
          expect(fileContent).toContain("desktop6:Extension")
          expect(fileContent).toContain("MyBackgroundService")
          expect(fileContent).toContain('StartupType="manual"')
          // StartAccount is required by the desktop6:Service schema; it defaults to localSystem
          expect(fileContent).toContain('StartAccount="localSystem"')
          expect(fileContent).toContain("xmlns:desktop6=")
        },
      },
    }))

  test("msix valid capabilities", ({ expect }) =>
    app(expect, {
      targets: target,
      config: {
        toolsets,
        msix: {
          capabilities: ["internetClient", "picturesLibrary", "webcam"],
        },
        appxManifestCreated: async filepath => {
          const fileContent = await readFile(filepath, "utf-8")
          expect(fileContent).toContain('<rescap:Capability Name="runFullTrust"/>')
          expect(fileContent).toContain('<Capability Name="internetClient"/>')
          expect(fileContent).toContain('<uap:Capability Name="picturesLibrary"/>')
          expect(fileContent).toContain('<DeviceCapability Name="webcam"/>')
        },
      },
    }))

  test("msix invalid capabilities throws", ({ expect }) =>
    appThrows(
      expect,
      {
        targets: target,
        config: {
          toolsets,
          msix: {
            capabilities: ["invalid01", "invalid02"],
          },
        },
      },
      {},
      error => {
        expect(error.message).toContain("invalid windows capabilities")
      }
    ))

  test("msix multi-arch build creates msixbundle and msixupload", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget(["msix"], Arch.ia32, Arch.x64),
        config: {
          toolsets,
          msix: {
            createMsixbundle: true,
            createMsixupload: true,
          },
        },
      },
      {}
    ))
}
