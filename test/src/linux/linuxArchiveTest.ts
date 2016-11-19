import { Platform } from "out"
import { app } from "../helpers/packTester"

test.ifDevOrLinuxCi("tar", app({targets: Platform.LINUX.createTarget(["tar.xz", "tar.lz", "tar.bz2"])}))