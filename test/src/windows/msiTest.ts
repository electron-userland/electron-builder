import { app } from "../helpers/packTester"
import { Platform } from "electron-builder"

test.ifAll.ifNotCi("msi", app({
  targets: Platform.WINDOWS.createTarget("msi"),
}))