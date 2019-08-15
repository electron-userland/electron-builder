import { DIR_TARGET, Platform } from "electron-builder"
import { outputFile } from "fs-extra"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { app, checkDirContents, modifyPackageJson } from "./helpers/packTester"

test.ifDevOrLinuxCi("ignore build resources", app({
  targets: Platform.LINUX.createTarget(DIR_TARGET),
  config: {
    asar: false
  }
}, {
  projectDirCreated: projectDir => {
    return outputFile(path.join(projectDir, "one/build/foo.txt"), "data")
  },
  packed: context => {
    return assertThat(path.join(context.getResources(Platform.LINUX), "app", "one", "build", "foo.txt")).isFile()
  },
}))

test.ifDevOrLinuxCi("2 ignore", app({
  targets: Platform.LINUX.createTarget(DIR_TARGET),
  config: {
    asar: false,
    files: [
      "**/*",
      "!{app,build,electron,mobile,theme,uploads,util,dist,dist-app/aot,dist-app/app.bundle.js,dist-app/dependencies/shim.min.js,dist-app/dependencies/classList.min.js,dist-app/dependencies/web-animations.min.js,main.js,main-aot.js,favicon.ico,index.html,index-aot.html,index-cordova.html,index-aot.js,index-electron.js,index.bundle.js,systemjs.config.js,systemjs-angular-loader.js,package-lock.json}",
      "!*config*.json",
      "!**/*.{ts,scss,map,md,csv,wrapped}",
      "!**/*.{hprof,orig,pyc,pyo,rbc}",
      "!**/._*",
      "!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,__pycache__,thumbs.db,.gitignore,.gitattributes,.flowconfig,.yarn-metadata.json,.idea,appveyor.yml,.travis.yml,circle.yml,npm-debug.log,.nyc_output,yarn.lock,.yarn-integrity}"
    ],
  }
}, {
  projectDirCreated: projectDir => {
    return outputFile(path.join(projectDir, "electron/foo.txt"), "data")
  },
  packed: context => {
    return assertThat(path.join(context.getResources(Platform.LINUX), "app", "electron", "foo.txt")).doesNotExist()
  },
}))

test.ifDevOrLinuxCi("ignore known ignored files", app({
  targets: Platform.LINUX.createTarget(DIR_TARGET),
  config: {
    asar: false
  }
}, {
  projectDirCreated: projectDir => Promise.all([
    outputFile(path.join(projectDir, ".svn", "foo"), "data"),
    outputFile(path.join(projectDir, ".git", "foo"), "data"),
    outputFile(path.join(projectDir, "node_modules", ".bin", "f.txt"), "data"),
    outputFile(path.join(projectDir, "node_modules", ".bin2", "f.txt"), "data"),
  ]),
  packed: context => checkDirContents(path.join(context.getResources(Platform.LINUX), "app")),
}))

// skip on macOS because we want test only / and \
test.ifNotCiMac("ignore node_modules dev dep", app({
  targets: Platform.LINUX.createTarget(DIR_TARGET),
  config: {
    asar: false,
  },
}, {
  projectDirCreated: projectDir => {
    return Promise.all([
      modifyPackageJson(projectDir, data => {
        data.devDependencies = {
          "electron-osx-sign": "*", ...data.devDependencies}
      }),
      outputFile(path.join(projectDir, "node_modules", "electron-osx-sign", "package.json"), "{}"),
    ])
  },
  packed: context => {
    return Promise.all([
      assertThat(path.join(context.getResources(Platform.LINUX), "app", "node_modules", "electron-osx-sign")).doesNotExist(),
      assertThat(path.join(context.getResources(Platform.LINUX), "app", "ignoreMe")).doesNotExist(),
    ])
  },
}))