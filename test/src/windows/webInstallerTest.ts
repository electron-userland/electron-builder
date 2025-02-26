import { Arch, Platform } from "electron-builder"
import { app } from "../helpers/packTester"

// tests are heavy, to distribute tests across CircleCI machines evenly, these tests were moved from oneClickInstallerTest

test.ifNotCiMac("web installer", ({ expect }) =>
  app(expect, {
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
        loadBrowserProcessSpecificV8Snapshot: true,
        grantFileProtocolExtraPrivileges: undefined, // unsupported on current electron version in our tests
      },
    },
  })
)

test.ifNotCiMac("web installer (default github)", ({ expect }) =>
  app(expect, {
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

test.ifNotCiMac("web installer, safe name on github", ({ expect }) =>
  app(expect, {
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
