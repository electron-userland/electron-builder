import { assertPack, platform, modifyPackageJson, app, appThrows } from "../helpers/packTester"
import { Platform, createTargets } from "out"
import { DIR_TARGET } from "out/targets/targetFactory"

test.ifMac("two-package", () => assertPack("test-app", {targets: createTargets([Platform.MAC], null, "all")}, {signed: true, useTempDir: true}))

test.ifMac("one-package", app(platform(Platform.MAC), {signed: true}))

test.ifMac("electronDist", appThrows(/ENOENT: no such file or directory/, {
  targets: Platform.OSX.createTarget(DIR_TARGET),
}, {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.build.electronDist = "foo"
  })
}))

test.ifWinCi("Build macOS on Windows is not supported", appThrows(/Build for macOS is supported only on macOS.+/, platform(Platform.MAC)))