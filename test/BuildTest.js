import test from "./helpers/avaEx"
import { assertPack } from "./helpers/packTester"
import fse from "fs-extra"
import Promise from "bluebird"
import * as path from "path"
import { readText } from "out/promisifed-fs"
import { parse as parseJson } from "json-parse-helpfulerror"

const writeFile = Promise.promisify(fse.writeFile)
const moveFile = Promise.promisify(fse.move)

if (process.env.TRAVIS !== "true") {
  // we don't use CircleCI, so, we can safely set this env
  process.env.CIRCLE_BUILD_NUM = 42
}

test.ifOsx("mac: two-package.json", async function () {
  await assertPack("test-app", "darwin")
})

test.ifOsx("mac: one-package.json", async function () {
  await assertPack("test-app-one", "darwin")
})

test("custom app dir", async function () {
  let platforms
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

  await assertPack("test-app-one", platforms, [], true, async projectDir => {
    const file = path.join(projectDir, "package.json")
    const data = parseJson(await readText(file))
    data.directories = {
      buildResources: "custom"
    }

    return Promise.all([
      writeFile(file, JSON.stringify(data, null, 2)),
      moveFile(path.join(projectDir, "build"), path.join(projectDir, "custom"))
    ])
  })
})

