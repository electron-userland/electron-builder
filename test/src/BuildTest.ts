import { checkBuildRequestOptions } from "app-builder-lib"
import { doMergeConfigs } from "app-builder-lib/out/util/config/config"
import { Arch, createTargets, DIR_TARGET, Platform } from "electron-builder"
import { createYargs } from "electron-builder/out/builder"
import { promises as fs } from "fs"
import { outputFile, outputJson } from "fs-extra"
import * as path from "path"
import { app, appTwo, appTwoThrows, assertPack, getFixtureDir, linuxDirTarget, modifyPackageJson, packageJson, toSystemIndependentPath } from "./helpers/packTester"
import { ELECTRON_VERSION } from "./helpers/testConfig"
import { verifySmartUnpack } from "./helpers/verifySmartUnpack"
import { spawn } from "builder-util/out/util"

test("cli", ({ expect }) => {
  // because these methods are internal
  const { configureBuildCommand, normalizeOptions } = require("electron-builder/out/builder")
  const yargs = createYargs()
  configureBuildCommand(yargs)

  function parse(input: string): any {
    const options = normalizeOptions(yargs.parse(input))
    checkBuildRequestOptions(options)
    return options
  }

  expect(parse("-owl --x64 --ia32"))
  expect(parse("-mwl --x64 --ia32"))

  expect(parse("--dir")).toMatchObject({ targets: Platform.current().createTarget(DIR_TARGET) })
  expect(parse("--mac --dir")).toMatchSnapshot()
  expect(parse("--x64 --dir")).toMatchObject({ targets: Platform.current().createTarget(DIR_TARGET, Arch.x64) })

  expect(parse("--ia32 --x64")).toMatchObject({ targets: Platform.current().createTarget(null, Arch.x64, Arch.ia32) })
  expect(parse("--linux")).toMatchSnapshot()
  expect(parse("--win")).toMatchSnapshot()
  expect(parse("-owl")).toMatchSnapshot()
  expect(parse("-l tar.gz:ia32")).toMatchSnapshot()
  expect(parse("-l tar.gz:x64")).toMatchSnapshot()
  expect(parse("-l tar.gz")).toMatchSnapshot()
  expect(parse("-w tar.gz:x64")).toMatchSnapshot()
  expect(parse("-p always -w --x64")).toMatchSnapshot()
  expect(parse("--prepackaged someDir -w --x64")).toMatchSnapshot()
  expect(parse("--project someDir -w --x64")).toMatchSnapshot()

  expect(parse("-c.compress=store -c.asar -c ./config.json")).toMatchObject({
    config: {
      asar: true,
      compress: "store",
      extends: "./config.json",
    },
  })
})

test("merge configurations", ({ expect }) => {
  const result = doMergeConfigs([
    {
      files: [
        {
          from: "dist/renderer",
        },
        {
          from: "dist/renderer-dll",
        },
      ],
    },
    {
      files: [
        {
          from: ".",
          filter: ["package.json"],
        },
        {
          from: "dist/main",
        },
      ],
    },
    {
      files: ["**/*", "!webpack", "!.*", "!config/jsdoc.json", "!package.*"],
    },
    {
      files: [
        {
          from: ".",
          filter: ["!docs"],
        },
      ],
    },
    {
      files: ["!private"],
    },
  ])

  // console.log("data: " + JSON.stringify(result, null, 2))
  expect(result).toMatchObject({
    directories: {
      output: "dist",
      buildResources: "build",
    },
    files: [
      {
        filter: ["package.json", "**/*", "!webpack", "!.*", "!config/jsdoc.json", "!package.*", "!docs", "!private"],
      },
      {
        from: "dist/main",
      },
      {
        from: "dist/renderer",
      },
      {
        from: "dist/renderer-dll",
      },
    ],
  })
})

test("build in the app package.json", ({ expect }) =>
  appTwoThrows(
    expect,
    { targets: linuxDirTarget },
    {
      projectDirCreated: it =>
        modifyPackageJson(
          it,
          data => {
            data.build = {
              productName: "bar",
            }
          },
          true
        ),
    }
  ))

test("relative index", ({ expect }) =>
  appTwo(
    expect,
    {
      targets: linuxDirTarget,
    },
    {
      projectDirCreated: projectDir =>
        modifyPackageJson(
          projectDir,
          data => {
            data.main = "./index.js"
          },
          true
        ),
    }
  ))

it.ifDevOrLinuxCi("electron version from electron-prebuilt dependency", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
    },
    {
      projectDirCreated: projectDir =>
        Promise.all([
          outputJson(path.join(projectDir, "node_modules", "electron-prebuilt", "package.json"), {
            version: ELECTRON_VERSION,
          }),
          modifyPackageJson(projectDir, data => {
            delete data.build.electronVersion
            data.devDependencies = {}
          }),
        ]),
    }
  )
)

test.ifDevOrLinuxCi("electron version from electron dependency", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
    },
    {
      projectDirCreated: projectDir =>
        Promise.all([
          outputJson(path.join(projectDir, "node_modules", "electron", "package.json"), {
            version: ELECTRON_VERSION,
          }),
          modifyPackageJson(projectDir, data => {
            delete data.build.electronVersion
            data.devDependencies = {}
          }),
        ]),
    }
  )
)

test.ifDevOrLinuxCi("electron version from build", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
    },
    {
      projectDirCreated: projectDir =>
        modifyPackageJson(projectDir, data => {
          data.devDependencies = {}
          data.build.electronVersion = ELECTRON_VERSION
        }),
    }
  )
)

test("www as default dir", ({ expect }) =>
  appTwo(
    expect,
    {
      targets: Platform.LINUX.createTarget(DIR_TARGET),
    },
    {
      projectDirCreated: projectDir => fs.rename(path.join(projectDir, "app"), path.join(projectDir, "www")),
    }
  ))

test.ifLinuxOrDevMac("hooks as functions", ({ expect }) => {
  let artifactBuildStartedCalled = 0
  let artifactBuildCompletedCalled = 0
  let beforePackCalled = 0
  let afterPackCalled = 0
  let afterExtractCalled = 0
  return assertPack(
    expect,
    "test-app-one",
    {
      targets: createTargets([Platform.LINUX, Platform.MAC], "zip", "x64"),
      config: {
        artifactBuildStarted: () => {
          artifactBuildStartedCalled++
        },
        artifactBuildCompleted: () => {
          artifactBuildCompletedCalled++
        },
        beforePack: () => {
          beforePackCalled++
          return Promise.resolve()
        },
        afterExtract: () => {
          afterExtractCalled++
          return Promise.resolve()
        },
        afterPack: () => {
          afterPackCalled++
          return Promise.resolve()
        },
      },
    },
    {
      packed: async () => {
        expect(artifactBuildStartedCalled).toEqual(2)
        expect(artifactBuildCompletedCalled).toEqual(3) // 2 artifacts + blockmap
        expect(beforePackCalled).toEqual(2)
        expect(afterExtractCalled).toEqual(2)
        expect(afterPackCalled).toEqual(2)
        expect(afterPackCalled).toEqual(2)
        return Promise.resolve()
      },
    }
  )
})

test.ifLinuxOrDevMac("hooks as file - cjs", async ({ expect }) => {
  const hookScript = path.join(getFixtureDir(), "build-hook.cjs")
  return assertPack(expect, "test-app-one", {
    targets: createTargets([Platform.LINUX, Platform.MAC], "zip", "x64"),
    config: {
      artifactBuildStarted: hookScript,
      artifactBuildCompleted: hookScript,
      beforePack: hookScript,
      afterExtract: hookScript,
      afterPack: hookScript,
    },
  })
})

// test.only("hooks as file - mjs exported functions", async ({ expect }) => {
//   const hookScript = path.join(getFixtureDir(), "build-hook.mjs")
//   return assertPack(expect,"test-app-one", {
//     targets: createTargets([Platform.LINUX, Platform.MAC], "zip", "x64"),
//     config: {
//       artifactBuildStarted: hookScript,
//       artifactBuildCompleted: hookScript,
//       beforePack: hookScript,
//       afterExtract: hookScript,
//       afterPack: hookScript,
//     },
//   })
// })

test.ifWindows("afterSign", ({ expect }) => {
  let called = 0
  return assertPack(
    expect,
    "test-app-one",
    {
      targets: createTargets([Platform.LINUX, Platform.WINDOWS], DIR_TARGET),
      config: {
        afterSign: () => {
          called++
          return Promise.resolve()
        },
      },
    },
    {
      packed: async () => {
        // afterSign is only called when an app is actually signed and ignored otherwise.
        expect(called).toEqual(1)
        return Promise.resolve()
      },
    }
  )
})

test.ifLinuxOrDevMac("beforeBuild", ({ expect }) => {
  let called = 0
  return assertPack(
    expect,
    "test-app-one",
    {
      targets: createTargets([Platform.LINUX, Platform.MAC], DIR_TARGET),
      config: {
        npmRebuild: true,
        beforeBuild: async () => {
          called++
          return Promise.resolve()
        },
      },
    },
    {
      packed: async () => {
        expect(called).toEqual(2)
        return Promise.resolve()
      },
    }
  )
})

// https://github.com/electron-userland/electron-builder/issues/1738
test.ifDevOrLinuxCi("win smart unpack", ({ expect }) => {
  // test onNodeModuleFile hook
  const nodeModuleFiles: Array<string> = []
  let p = ""
  return app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget(DIR_TARGET, Arch.x64),
      config: {
        npmRebuild: true,
        onNodeModuleFile: file => {
          const name = toSystemIndependentPath(path.relative(p, file))
          if (!name.startsWith(".") && !name.endsWith(".dll") && name.includes(".")) {
            nodeModuleFiles.push(name)
          }
        },
        win: {
          signAndEditExecutable: false, // setting `true` will fail on arm64 macs, even within docker container since rcedit doesn't work within wine on arm64
        },
      },
    },
    {
      isInstallDepsBefore: true,
      projectDirCreated: projectDir => {
        p = projectDir
        return packageJson(it => {
          it.dependencies = {
            debug: "3.1.0",
            "edge-cs": "1.2.1",
            "@electron-builder/test-smart-unpack": "1.0.0",
            "@electron-builder/test-smart-unpack-empty": "1.0.0",
          }
        })(projectDir)
      },
      packed: async context => {
        await verifySmartUnpack(expect, context.getResources(Platform.WINDOWS))
        expect(nodeModuleFiles).toMatchSnapshot()
      },
    }
  )
})

test.ifDevOrWinCi("smart unpack local module with dll file", ({ expect }) => {
  return app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget(DIR_TARGET, Arch.x64),
    },
    {
      isInstallDepsBefore: true,
      projectDirCreated: async (projectDir, tmpDir) => {
        const tempDir = await tmpDir.getTempDir()
        const localPath = path.join(tempDir, "foo")
        await outputFile(path.join(localPath, "package.json"), `{"name":"foo","version":"9.0.0","main":"index.js","license":"MIT"}`)
        await outputFile(path.join(localPath, "test.dll"), `test`)
        await modifyPackageJson(projectDir, data => {
          data.dependencies = {
            debug: "3.1.0",
            "edge-cs": "1.2.1",
            foo: `file:${localPath}`,
          }
        })

        // we can't use `isInstallDepsBefore` as `localPath` is dynamic and changes for every which causes `--frozen-lockfile` and `npm ci` to fail
        await spawn("npm", ["install"], {
          cwd: projectDir,
        })
      },
      packed: async context => {
        await verifySmartUnpack(expect, context.getResources(Platform.WINDOWS))
      },
    }
  )
})

// https://github.com/electron-userland/electron-builder/issues/1738
test.ifDevOrLinuxCi("posix smart unpack", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
      config: {
        // https://github.com/electron-userland/electron-builder/issues/3273
        // tslint:disable-next-line:no-invalid-template-strings
        copyright: "Copyright © 2018 ${author}",
        npmRebuild: true,
        onNodeModuleFile: filePath => {
          // Force include this directory in the package
          return filePath.includes("node_modules/three/examples")
        },
        files: [
          // test ignore pattern for node_modules defined as file set filter
          {
            filter: ["!node_modules/napi-build-utils/napi-build-utils-1.0.0.tgz", "!node_modules/node-abi/*", "!node_modules/**/eslint-format.js"],
          },
        ],
      },
    },
    {
      isInstallDepsBefore: true,
      projectDirCreated: packageJson(it => {
        it.dependencies = {
          debug: "4.1.1",
          "edge-cs": "1.2.1",
          keytar: "7.9.0",
          three: "0.160.0",
        }
      }),
      packed: async context => {
        expect(context.packager.appInfo.copyright).toBe("Copyright © 2018 Foo Bar")
        await verifySmartUnpack(expect, context.getResources(Platform.LINUX), async asarFs => {
          return expect(await asarFs.readFile(`node_modules${path.sep}three${path.sep}examples${path.sep}fonts${path.sep}README.md`)).toMatchSnapshot()
        })
      },
    }
  )
)
