import test from "./helpers/avaEx"
import { assertPack } from "./helpers/packTester"
import { move, writeJson, readJson } from "fs-extra-p"
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

if (process.env.TRAVIS !== "true") {
  // we don't use CircleCI, so, we can safely set this env
  process.env.CIRCLE_BUILD_NUM = 42
}

test.ifOsx("mac: two-package.json", async () => {
  await assertPack("test-app", "darwin")
})

test.ifOsx("mac: one-package.json", async () => {
  await assertPack("test-app-one", "darwin")
})

test("custom app dir", async () => {
  let platforms: Array<string>
  if (process.platform === "darwin") {
    platforms = ["darwin", "linux"]
  }
  else if (process.platform === "linux") {
    // todo install wine on Linux agent
    platforms = ["linux"]
  }
  else {
    platforms = ["win32"]
  }

  await assertPack("test-app-one", platforms, {
    // speed up tests, we don't need check every arch
    arch: process.arch
  }, true, async (projectDir) => {
    const file = path.join(projectDir, "package.json")
    const data = await readJson(file)
    data.directories = {
      buildResources: "custom"
    }

    return await BluebirdPromise.all([
      writeJson(file, data, {spaces: 2}),
      move(path.join(projectDir, "build"), path.join(projectDir, "custom"))
    ])
  })
})

