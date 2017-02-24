import { Platform } from "electron-builder"
import { app } from "../helpers/packTester"

test.ifAll.ifDevOrLinuxCi("tar", app({targets: Platform.LINUX.createTarget(["tar.xz", "tar.lz", "tar.bz2"])}))