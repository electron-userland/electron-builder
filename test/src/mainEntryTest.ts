import { createTargets, DIR_TARGET, Platform } from "electron-builder"
import * as fs from "fs/promises"
import * as path from "path"
import { appTwoThrows, assertPack, modifyPackageJson } from "./helpers/packTester"

const packagerOptions = {
  targets: createTargets([Platform.LINUX, Platform.MAC], DIR_TARGET),
}

test.ifLinuxOrDevMac(
  "invalid main in the app package.json",
  appTwoThrows(packagerOptions, {
    projectDirCreated: projectDir =>
      modifyPackageJson(
        projectDir,
        data => {
          data.main = "main.js"
        },
        true
      ),
  })
)

test.ifLinuxOrDevMac(
  "invalid main in the app package.json (no asar)",
  appTwoThrows(packagerOptions, {
    projectDirCreated: projectDir => {
      return Promise.all([
        modifyPackageJson(
          projectDir,
          data => {
            data.main = "main.js"
          },
          true
        ),
        modifyPackageJson(projectDir, data => {
          data.build.asar = false
        }),
      ])
    },
  })
)

test.ifLinuxOrDevMac(
  "invalid main in the app package.json (custom asar)",
  appTwoThrows(packagerOptions, {
    projectDirCreated: projectDir => {
      return Promise.all([
        modifyPackageJson(
          projectDir,
          data => {
            data.main = "path/app.asar/main.js"
          },
          true
        ),
        modifyPackageJson(projectDir, data => {
          data.build.asar = false
        }),
      ])
    },
  })
)

test.ifLinuxOrDevMac("main in the app package.json (no asar)", () =>
  assertPack("test-app", packagerOptions, {
    projectDirCreated: projectDir => {
      return Promise.all([
        fs.rename(path.join(projectDir, "app", "index.js"), path.join(projectDir, "app", "main.js")),
        modifyPackageJson(
          projectDir,
          data => {
            data.main = "main.js"
          },
          true
        ),
        modifyPackageJson(projectDir, data => {
          data.build.asar = false
        }),
      ])
    },
  })
)

test.ifLinuxOrDevMac("main in the app package.json (custom asar)", () =>
  assertPack("test-app", packagerOptions, {
    projectDirCreated: projectDir => {
      return Promise.all([
        modifyPackageJson(
          projectDir,
          data => {
            data.main = "path/app.asar/index.js"
          },
          true
        ),
        modifyPackageJson(projectDir, data => {
          data.build.asar = false
        }),
      ])
    },
  })
)
