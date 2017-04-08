import { Platform } from "electron-builder"
import { app } from "../helpers/packTester"

test.ifNotCiMac("portable", app({
  targets: Platform.WINDOWS.createTarget(["portable"]),
  config: {
    nsis: {
    }
  }
}))

test.ifAll.ifNotCiMac("portable - artifactName and request execution level", app({
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