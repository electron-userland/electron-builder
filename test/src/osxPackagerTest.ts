import test from "./helpers/avaEx"
import { assertPack, platform } from "./helpers/packTester"
// import { deleteFile } from "fs-extra-p"
// import * as path from "path"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test.ifOsx("mac: two-package.json", () => assertPack("test-app", {
  platform: ["darwin"],
  arch: "all",
}))

test.ifOsx("mac: one-package.json", () => assertPack("test-app-one", platform("darwin")))

// test.ifOsx("no background", (t: any) => assertPack("test-app-one", platform("darwin"), {
//   tempDirCreated: projectDir => deleteFile(path.join(projectDir, "build", "background.png"))
// }))