import test from "./helpers/avaEx"
import { assertPack, modifyPackageJson, platform } from "./helpers/packTester"
import { move, mkdirs, outputFile } from "fs-extra-p"
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { Platform, PackagerOptions } from "out"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

if (process.env.TRAVIS !== "true") {
  // we don't use CircleCI, so, we can safely set this env
  process.env.CIRCLE_BUILD_NUM = 42
}

test.ifOsx("mac: two-package.json", async () => {
  await assertPack("test-app", platform("darwin"))
})

test.ifOsx("mac: one-package.json", async () => {
  await assertPack("test-app-one", platform("darwin"))
})

test("custom app dir", async () => {
  await assertPack("test-app-one", allPlatformsAndCurrentArch(), (projectDir) => {
    return BluebirdPromise.all([
      modifyPackageJson(projectDir, data => {
        data.directories = {
          buildResources: "custom"
        }
      }),
      move(path.join(projectDir, "build"), path.join(projectDir, "custom"))
    ])
  })
})

test("productName with space", async () => {
  await assertPack("test-app-one", allPlatformsAndCurrentArch(), projectDir => {
    return modifyPackageJson(projectDir, data => {
      data.productName = "Test App"
    })
  })
})

test("build in the app package.json", t => {
  t.throws(assertPack("test-app", allPlatformsAndCurrentArch(), projectDir => {
    return modifyPackageJson(projectDir, data => {
      data.build = {
        "iconUrl": "bar",
      }
    }, true)
  }), /'build' in the application package\.json .+/)
})

test("copy extra resource", async () => {
  const platform = process.platform
  const osName = Platform.fromNodePlatform(platform).buildConfigurationKey

  await assertPack("test-app", {
    platform: [platform],
    arch: process.arch,
    dist: false
  }, (projectDir) => {
    return BluebirdPromise.all([
      modifyPackageJson(projectDir, data => {
        if (data.build == null) {
          data.build = {}
        }
        data.build.extraResources = [
          "foo",
          "bar/hello.txt",
          "bar/${arch}.txt",
          "${os}/${arch}.txt",
        ]

        data.build[osName] = {
          extraResources: [
            "platformSpecific"
          ]
        }
      }),
      mkdirs(path.join(projectDir, "foo")),
      outputFile(path.join(projectDir, "bar/hello.txt"), "data"),
      outputFile(path.join(projectDir, `bar/${process.arch}.txt`), "data"),
      outputFile(path.join(projectDir, `${osName}/${process.arch}.txt`), "data"),
      outputFile(path.join(projectDir, "platformSpecific"), "platformSpecific"),
      outputFile(path.join(projectDir, "ignoreMe.txt"), "ignoreMe"),
    ])
  }, async (projectDir) => {
    let resourcesDir = path.join(projectDir, "dist", "TestApp-" + platform + "-" + process.arch)
    if (platform === "darwin") {
      resourcesDir = path.join(resourcesDir, "TestApp.app", "Contents", "Resources")
    }
    await assertThat(path.join(resourcesDir, "foo")).isDirectory()
    await assertThat(path.join(resourcesDir, "bar/hello.txt")).isFile()
    await assertThat(path.join(resourcesDir, `bar/${process.arch}.txt`)).isFile()
    await assertThat(path.join(resourcesDir, `${osName}/${process.arch}.txt`)).isFile()
    await assertThat(path.join(resourcesDir, "platformSpecific")).isFile()
    await assertThat(path.join(resourcesDir, "ignoreMe.txt")).doesNotExist()
  })
})

function allPlatformsAndCurrentArch(): PackagerOptions {
  return {
    platform: getPossiblePlatforms(),
    // speed up tests, we don't need check every arch
    arch: process.arch,
  }
}

function getPossiblePlatforms(): Array<string> {
  const isCi = process.env.CI != null
  if (process.platform === "darwin") {
    return isCi ? ["darwin", "linux"] : ["darwin", "linux", "win32"]
  }
  else if (process.platform === "linux") {
    // todo install wine on Linux agent
    return ["linux"]
  }
  else {
    return ["win32"]
  }
}