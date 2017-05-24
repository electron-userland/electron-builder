import { Platform } from "electron-builder"
import { app } from "../helpers/packTester"

// build in parallel - https://github.com/electron-userland/electron-builder/issues/1340#issuecomment-286061789
test.ifAll.ifNotCiMac("portable", app({
  targets: Platform.WINDOWS.createTarget(["portable", "nsis"]),
  config: {
    publish: null,
    nsis: {
    }
  }
}))

test.ifNotCiMac("portable - artifactName and request execution level", app({
  targets: Platform.WINDOWS.createTarget(["portable"]),
  config: {
    "nsis": {
      "artifactName": "${productName}Installer.${version}.${ext}"
    },
    portable: {
      requestExecutionLevel: "admin",
      artifactName: "${productName}Portable.${version}.${ext}"
    }
  }
}))