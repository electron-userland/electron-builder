import { Platform } from "electron-builder"
import * as path from "path"
import { app, copyTestAsset } from "../helpers/packTester"

// build in parallel - https://github.com/electron-userland/electron-builder/issues/1340#issuecomment-286061789
test.ifAll.ifNotCiMac("portable", app({
  targets: Platform.WINDOWS.createTarget(["portable", "nsis"]),
  config: {
    publish: null,
    nsis: {}
  }
}))

test.ifNotCiMac("portable - artifactName and request execution level", app({
  targets: Platform.WINDOWS.createTarget(["portable"]),
  config: {
    nsis: {
      artifactName: "${productName}Installer.${version}.${ext}",
      installerIcon: "foo test space.ico",
    },
    portable: {
      requestExecutionLevel: "admin",
      artifactName: "${productName}Portable.${version}.${ext}"
    }
  },
}, {
  projectDirCreated: projectDir => {
    return copyTestAsset("headerIcon.ico", path.join(projectDir, "build", "foo test space.ico"))
  },
}))