import test from "./helpers/avaEx"
import { assertPack, platform, modifyPackageJson } from "./helpers/packTester"
import { move } from "fs-extra-p"
import * as path from "path"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test.ifNotTravis("win", () => assertPack("test-app-one", {
  platform: ["win32"],
}, {
  tempDirCreated: it => modifyPackageJson(it, data => {
    // data.build.win = {
    //   remoteReleases: "https://github.com/develar/__test-app-releases",
    // }
  })
}))

test.ifNotTravis("icon < 256", (t: any) => t.throws(assertPack("test-app-one", platform("win32"), {
  tempDirCreated: projectDir => move(path.join(projectDir, "build", "incorrect.ico"), path.join(projectDir, "build", "icon.ico"), {clobber: true})
}), /Windows icon image size must be at least 256x256/))