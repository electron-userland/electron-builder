// "apk" is very slow, don't test for now
import { Platform } from "out"
import { app } from "../helpers/packTester"

test.ifDevOrLinuxCi("targets", app({targets: Platform.LINUX.createTarget(["sh", "freebsd", "pacman", "zip", "7z"])}))

// https://github.com/electron-userland/electron-builder/issues/460
// for some reasons in parallel to fmp we cannot use tar
test.ifDevOrLinuxCi("rpm and tar.gz", app({targets: Platform.LINUX.createTarget(["rpm", "tar.gz"])}))