import { Arch, Platform } from "electron-builder"
import { app } from "../helpers/packTester"

// tests are heavy, to distribute tests across CircleCI machines evenly, these tests were moved from oneClickInstallerTest

test.ifNotCiMac("web installer", app({
  targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
  config: {
    publish: {
      provider: "s3",
      bucket: "develar",
      path: "test",
    },
  }
}))

test.ifAll.ifNotCiMac("web installer (default github)", app({
  targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.ia32, Arch.x64, Arch.arm64),
  config: {
    publish: {
      provider: "github",
      // test form without owner
      repo: "foo/bar",
    },
  },
}))

test.ifAll.ifNotCiMac("web installer, safe name on github", app({
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
}))
