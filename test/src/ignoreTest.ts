import { DIR_TARGET, Platform, archFromString } from "electron-builder"
import { outputFile } from "fs-extra"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { app, checkDirContents, linuxDirTarget, modifyPackageJson } from "./helpers/packTester"

const currentProcessTarget = Platform.LINUX.createTarget(DIR_TARGET, archFromString(process.arch))

test.ifDevOrLinuxCi("ignore build resources", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
      config: {
        asar: false,
      },
    },
    {
      projectDirCreated: projectDir => {
        return outputFile(path.join(projectDir, "one/build/foo.txt"), "data")
      },
      packed: context => {
        return assertThat(expect, path.join(context.getResources(Platform.LINUX), "app", "one", "build", "foo.txt")).isFile()
      },
    }
  )
)

test.ifDevOrLinuxCi("2 ignore", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
      config: {
        asar: false,
        files: [
          "**/*",
          "!{app,build,electron,mobile,theme,uploads,util,dist,dist-app/aot,dist-app/app.bundle.js,dist-app/dependencies/shim.min.js,dist-app/dependencies/classList.min.js,dist-app/dependencies/web-animations.min.js,main.js,main-aot.js,favicon.ico,index.html,index-aot.html,index-cordova.html,index-aot.js,index-electron.js,index.bundle.js,systemjs.config.js,systemjs-angular-loader.js,package-lock.json}",
          "!*config*.json",
          "!**/*.{ts,scss,map,md,csv,wrapped}",
          "!**/*.{hprof,orig,pyc,pyo,rbc}",
          "!**/._*",
          "!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,__pycache__,thumbs.db,.gitignore,.gitattributes,.flowconfig,.yarn-metadata.json,.idea,appveyor.yml,.travis.yml,circle.yml,npm-debug.log,.nyc_output,yarn.lock,.yarn-integrity}",
        ],
      },
    },
    {
      projectDirCreated: projectDir => {
        return outputFile(path.join(projectDir, "electron/foo.txt"), "data")
      },
      packed: context => {
        return assertThat(expect, path.join(context.getResources(Platform.LINUX), "app", "electron", "foo.txt")).doesNotExist()
      },
    }
  )
)

test.ifDevOrLinuxCi("ignore known ignored files", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
      config: {
        asar: false,
      },
    },
    {
      projectDirCreated: projectDir =>
        Promise.all([
          outputFile(path.join(projectDir, ".svn", "foo"), "data"),
          outputFile(path.join(projectDir, ".git", "foo"), "data"),
          outputFile(path.join(projectDir, "node_modules", ".bin", "f.txt"), "data"),
          outputFile(path.join(projectDir, "node_modules", ".bin2", "f.txt"), "data"),
        ]),
      packed: context => checkDirContents(expect, path.join(context.getResources(Platform.LINUX), "app")),
    }
  )
)

// skip on macOS because we want test only / and \
test.ifNotCiMac.sequential("ignore node_modules dev dep", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
      config: {
        asar: false,
        files: ["**/*", "**/submodule-1-test/node_modules/**"],
      },
    },
    {
      isInstallDepsBefore: true,
      projectDirCreated: projectDir => {
        return Promise.all([
          modifyPackageJson(projectDir, data => {
            data.devDependencies = {
              semver: "6.3.1",
              ...data.devDependencies,
            }
          }),
        ])
      },
      packed: context => {
        return Promise.all([assertThat(expect, path.join(context.getResources(Platform.LINUX), "app", "node_modules", "semver")).doesNotExist()])
      },
    }
  )
)

test.ifDevOrLinuxCi.sequential("copied sub node_modules of the rootDir/node_modules", ({ expect }) =>
  app(
    expect,
    {
      targets: currentProcessTarget,
      config: {
        asar: false,
        files: ["**/*", "**/submodule-1-test/node_modules/**"],
      },
    },
    {
      isInstallDepsBefore: true,
      projectDirCreated: projectDir => {
        return Promise.all([
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
              "electron-updater": "6.3.9",
              semver: "6.3.1",
              ...data.dependencies,
            }
          }),
          outputFile(path.join(projectDir, "submodule-1-test", "node_modules", "package.json"), "{}"),
          outputFile(path.join(projectDir, "others", "node_modules", "package.json"), "{}"),
        ])
      },
      packed: context => {
        return Promise.all([
          assertThat(
            expect,
            path.join(context.getResources(Platform.LINUX, archFromString(process.arch)), "app", "node_modules", "electron-updater", "node_modules")
          ).isDirectory(),
          assertThat(expect, path.join(context.getResources(Platform.LINUX, archFromString(process.arch)), "app", "others", "node_modules")).doesNotExist(),
          assertThat(expect, path.join(context.getResources(Platform.LINUX, archFromString(process.arch)), "app", "submodule-1-test", "node_modules")).isDirectory(),
          assertThat(expect, path.join(context.getResources(Platform.LINUX, archFromString(process.arch)), "app", "submodule-1-test", "node_modules", "package.json")).isFile(),
        ])
      },
    }
  )
)

test.ifDevOrLinuxCi("Don't copy sub node_modules of the other dir instead of rootDir", ({ expect }) =>
  app(
    expect,
    {
      targets: currentProcessTarget,
      config: {
        asar: false,
      },
    },
    {
      projectDirCreated: projectDir => {
        return Promise.all([
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
              ...data.dependencies,
            }
          }),
          outputFile(path.join(projectDir, "others", "node_modules", "package.json"), "{}"),
          outputFile(path.join(projectDir, "others", "test1", "package.json"), "{}"),
          outputFile(path.join(projectDir, "others", "submodule-2-test", "node_modules", "package.json"), "{}"),
          outputFile(path.join(projectDir, "others", "submodule-2-test", "test2", "package.json"), "{}"),
        ])
      },
      packed: context => {
        return Promise.all([
          assertThat(expect, path.join(context.getResources(Platform.LINUX, archFromString(process.arch)), "app", "others", "node_modules")).doesNotExist(),
          assertThat(expect, path.join(context.getResources(Platform.LINUX, archFromString(process.arch)), "app", "others", "test1")).isDirectory(),
          assertThat(expect, path.join(context.getResources(Platform.LINUX, archFromString(process.arch)), "app", "others", "test1", "package.json")).isFile(),
          assertThat(expect, path.join(context.getResources(Platform.LINUX, archFromString(process.arch)), "app", "others", "submodule-2-test", "node_modules")).doesNotExist(),
          assertThat(expect, path.join(context.getResources(Platform.LINUX, archFromString(process.arch)), "app", "others", "submodule-2-test", "test2")).isDirectory(),
          assertThat(expect, path.join(context.getResources(Platform.LINUX, archFromString(process.arch)), "app", "others", "submodule-2-test", "test2", "package.json")).isFile(),
        ])
      },
    }
  )
)

test.ifDevOrLinuxCi("copied select submodule node_modules", ({ expect }) =>
  app(
    expect,
    {
      targets: currentProcessTarget,
      config: {
        asar: false,
        // should use **/ instead of */,
        // we use the related path to match, so the relative path is submodule-1-test/node_modules
        // */ will not match submodule-1-test/node_modules
        files: ["**/*", "**/submodule-1-test/node_modules/**"],
      },
    },
    {
      projectDirCreated: projectDir => {
        return Promise.all([
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
              ...data.dependencies,
            }
          }),
          outputFile(path.join(projectDir, "submodule-1-test", "node_modules", "package.json"), "{}"),
          outputFile(path.join(projectDir, "submodule-2-test", "node_modules", "package.json"), "{}"),
        ])
      },
      packed: context => {
        return Promise.all([
          assertThat(expect, path.join(context.getResources(Platform.LINUX, archFromString(process.arch)), "app", "submodule-1-test", "node_modules")).isDirectory(),
          assertThat(expect, path.join(context.getResources(Platform.LINUX, archFromString(process.arch)), "app", "submodule-1-test", "node_modules", "package.json")).isFile(),
          assertThat(expect, path.join(context.getResources(Platform.LINUX, archFromString(process.arch)), "app", "submodule-2-test", "node_modules")).doesNotExist(),
        ])
      },
    }
  )
)

test.ifDevOrLinuxCi("cannot copied select submodule node_modules by */", ({ expect }) =>
  app(
    expect,
    {
      targets: currentProcessTarget,
      config: {
        asar: false,
        files: ["**/*", "*/submodule-1-test/node_modules/**"],
      },
    },
    {
      projectDirCreated: projectDir => {
        return Promise.all([
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
              ...data.dependencies,
            }
          }),
          outputFile(path.join(projectDir, "submodule-1-test", "node_modules", "package.json"), "{}"),
        ])
      },
      packed: context => {
        return Promise.all([
          assertThat(expect, path.join(context.getResources(Platform.LINUX, archFromString(process.arch)), "app", "submodule-1-test", "node_modules")).doesNotExist(),
        ])
      },
    }
  )
)

test.ifDevOrLinuxCi("cannot copied select submodule node_modules by **/submodule-1-test/node_modules", ({ expect }) =>
  app(
    expect,
    {
      targets: currentProcessTarget,
      config: {
        asar: false,
        files: ["**/*", "**/submodule-1-test/node_modules"],
      },
    },
    {
      projectDirCreated: projectDir => {
        return Promise.all([
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
              ...data.dependencies,
            }
          }),
          outputFile(path.join(projectDir, "submodule-1-test", "node_modules", "package.json"), "{}"),
        ])
      },
      packed: context => {
        return Promise.all([
          assertThat(expect, path.join(context.getResources(Platform.LINUX, archFromString(process.arch)), "app", "submodule-1-test", "node_modules")).doesNotExist(),
        ])
      },
    }
  )
)
