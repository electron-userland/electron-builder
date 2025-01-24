import { Platform, Arch } from "electron-builder"
import * as path from "path"
import { app, copyTestAsset, getFixtureDir } from "../helpers/packTester"
import { outputFile } from "fs-extra"

// build in parallel - https://github.com/electron-userland/electron-builder/issues/1340#issuecomment-286061789
test.ifAll.ifNotCiMac(
  "portable",
  app(
    {
      targets: Platform.WINDOWS.createTarget(["portable", "nsis"]),
      config: {
        publish: null,
        nsis: {
          differentialPackage: false,
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
      },
    },
    {
      projectDirCreated: async projectDir => {
        await outputFile(path.join(projectDir, "build", "test-snapshot.bin"), "data")
      },
    }
  )
)

test.ifAll.ifDevOrWinCi(
  "portable zip",
  app({
    targets: Platform.WINDOWS.createTarget("portable"),
    config: {
      publish: null,
      portable: {
        useZip: true,
        unpackDirName: "0ujssxh0cECutqzMgbtXSGnjorm",
      },
      compression: "normal",
    },
  })
)

test.ifAll.ifNotCi(
  "portable zip several archs",
  app({
    targets: Platform.WINDOWS.createTarget("portable", Arch.ia32, Arch.x64),
    config: {
      publish: null,
      portable: {
        useZip: true,
        unpackDirName: false,
      },
      compression: "store",
    },
  })
)

test.ifNotCiMac(
  "portable - artifactName and request execution level",
  app(
    {
      targets: Platform.WINDOWS.createTarget(["portable"]),
      config: {
        nsis: {
          //tslint:disable-next-line:no-invalid-template-strings
          artifactName: "${productName}Installer.${version}.${ext}",
          installerIcon: "foo test space.ico",
        },
        portable: {
          unpackDirName: true,
          requestExecutionLevel: "admin",
          //tslint:disable-next-line:no-invalid-template-strings
          artifactName: "${productName}Portable.${version}.${ext}",
        },
      },
    },
    {
      projectDirCreated: projectDir => {
        return copyTestAsset("headerIcon.ico", path.join(projectDir, "build", "foo test space.ico"))
      },
    }
  )
)

test.ifDevOrWinCi(
  "portable - splashImage",
  app({
    targets: Platform.WINDOWS.createTarget(["portable"]),
    config: {
      publish: null,
      portable: {
        //tslint:disable-next-line:no-invalid-template-strings
        artifactName: "${productName}Portable.${version}.${ext}",
        splashImage: path.resolve(getFixtureDir(), "installerHeader.bmp"),
      },
    },
  })
)
