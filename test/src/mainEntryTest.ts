import { assertPack, modifyPackageJson, appTwoThrows, allPlatforms } from "./helpers/packTester"
import { move } from "fs-extra-p"
import BluebirdPromise from "bluebird-lst-c"
import * as path from "path"

test("invalid main in the app package.json", appTwoThrows(/Application entry file "main.js" in the /, allPlatforms(false), {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.main = "main.js"
  }, true)
}))

test("invalid main in the app package.json (no asar)", appTwoThrows(`Application entry file "main.js" does not exist. Seems like a wrong configuration.`, allPlatforms(false), {
  projectDirCreated: projectDir => {
    return BluebirdPromise.all([
      modifyPackageJson(projectDir, data => {
        data.main = "main.js"
      }, true),
      modifyPackageJson(projectDir, data => {
        data.build.asar = false
      })
    ])
  }
}))

test("invalid main in the app package.json (custom asar)", appTwoThrows(/Application entry file "main.js" in the ("[^"]*") does not exist\. Seems like a wrong configuration\./, allPlatforms(false), {
  projectDirCreated: projectDir => {
    return BluebirdPromise.all([
      modifyPackageJson(projectDir, data => {
        data.main = "path/app.asar/main.js"
      }, true),
      modifyPackageJson(projectDir, data => {
        data.build.asar = false
      })
    ])
  }
}))

test("main in the app package.json (no asar)", () => assertPack("test-app", allPlatforms(false), {
  projectDirCreated: projectDir => {
    return BluebirdPromise.all([
      move(path.join(projectDir, "app", "index.js"), path.join(projectDir, "app", "main.js")),
      modifyPackageJson(projectDir, data => {
        data.main = "main.js"
      }, true),
      modifyPackageJson(projectDir, data => {
        data.build.asar = false
      })
    ])
  }
}))

test("main in the app package.json (custom asar)", () => assertPack("test-app", allPlatforms(false), {
  projectDirCreated: projectDir => {
    return BluebirdPromise.all([
      modifyPackageJson(projectDir, data => {
        data.main = "path/app.asar/index.js"
      }, true),
      modifyPackageJson(projectDir, data => {
        data.build.asar = false
      })
    ])
  }
}))