import { Platform } from "electron-builder"
import { app } from "../helpers/packTester"

// "apk" is very slow, don't test for now
test.ifAll.ifDevOrLinuxCi("targets", app({targets: Platform.LINUX.createTarget(["sh", "freebsd", "pacman", "zip", "7z"])}))

// https://github.com/electron-userland/electron-builder/issues/460
// for some reasons in parallel to fmp we cannot use tar
test.ifAll.ifDevOrLinuxCi("rpm and tar.gz", app({targets: Platform.LINUX.createTarget(["rpm", "tar.gz"])}))