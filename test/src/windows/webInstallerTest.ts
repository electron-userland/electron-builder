import { Arch, Platform } from "electron-builder"
import { app } from "../helpers/packTester"
import { outputFile } from "fs-extra"
import { join } from "path"

// tests are heavy, to distribute tests across CircleCI machines evenly, these tests were moved from oneClickInstallerTest

test.ifNotCiMac(
  "web installer",
  app(
    {
      targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64, Arch.arm64),
      config: {
        publish: {
          provider: "s3",
          bucket: "develar",
          path: "test",
        },
        electronFuses: {
          runAsNode: true,
          enableCookieEncryption: true,
          enableNodeOptionsEnvironmentVariable: true,
          enableNodeCliInspectArguments: true,
          enableEmbeddedAsarIntegrityValidation: true,
          onlyLoadAppFromAsar: true,
          loadBrowserProcessSpecificV8Snapshot: {
            mainProcessSnapshotPath: undefined,
            browserProcessSnapshotPath: "test-snapshot.bin",
          },
          grantFileProtocolExtraPrivileges: undefined, // unsupported on current electron version in our tests
        },
        nsisWeb: {
          buildUniversalInstaller: false,
        },
      },
    },
    {
      projectDirCreated: async projectDir => outputFile(join(projectDir, "build", "test-snapshot.bin"), "data"),
    }
  )
)

test.ifAll.ifNotCiMac(
  "web installer (default github)",
  app({
    targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.ia32, Arch.x64, Arch.arm64),
    config: {
      publish: {
        provider: "github",
        // test form without owner
        repo: "foo/bar",
      },
    },
  })
)

test.ifAll.ifNotCiMac(
  "web installer, safe name on github",
  app({
    targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
    config: {
      productName: "WorkFlowy",
      publish: {
        provider: "github",
        repo: "foo/bar",
      },
      nsisWeb: {
        //tslint:disable-next-line:no-invalid-template-strings
        artifactName: "${productName}.${ext}",
      },
    },
  })
)
