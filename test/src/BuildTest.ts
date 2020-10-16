import { checkBuildRequestOptions } from "app-builder-lib"
import { readAsar } from "app-builder-lib/out/asar/asar"
import { doMergeConfigs } from "app-builder-lib/out/util/config"
import { walk } from "builder-util/out/fs"
import { Arch, createTargets, DIR_TARGET, Platform } from "electron-builder"
import { promises as fs, readFileSync } from "fs"
import { outputJson } from "fs-extra"
import * as path from "path"
import { createYargs } from "electron-builder/out/builder"
import { app, appTwo, appTwoThrows, assertPack, linuxDirTarget, modifyPackageJson, packageJson, toSystemIndependentPath } from "./helpers/packTester"
import { ELECTRON_VERSION } from "./helpers/testConfig"

test("cli", async () => {
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

  expect(parse("--dir")).toMatchObject({targets: Platform.current().createTarget(DIR_TARGET)})
  expect(parse("--mac --dir")).toMatchSnapshot()
  expect(parse("--x64 --dir")).toMatchObject({targets: Platform.current().createTarget(DIR_TARGET, Arch.x64)})

  expect(parse("--ia32 --x64")).toMatchObject({targets: Platform.current().createTarget(null, Arch.x64, Arch.ia32)})
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
      extends: "./config.json"
    }
  })
})

test("merge configurations", () => {
  const result = doMergeConfigs({
    files: [
      "**/*",
      "!webpack",
      "!.*",
      "!config/jsdoc.json",
      "!package.*",
      "!docs",
      "!private"
    ],
  }, {
    files: [
      {
        from: ".",
        filter: [
          "package.json"
        ]
      },
      {
        from: "dist/main"
      },
      {
        from: "dist/renderer"
      },
      {
        from: "dist/renderer-dll"
      }
    ],
  })

  // console.log("data: " + JSON.stringify(result, null, 2))
  expect(result).toMatchObject({
    directories: {
      output: "dist",
      buildResources: "build"
    },
    files: [
      {
        filter: [
          "package.json",
          "**/*",
          "!webpack",
          "!.*",
          "!config/jsdoc.json",
          "!package.*",
          "!docs",
          "!private"
        ]
      },
      {
        from: "dist/main"
      },
      {
        from: "dist/renderer"
      },
      {
        from: "dist/renderer-dll"
      }
    ]
  })
})

test("build in the app package.json", appTwoThrows({targets: linuxDirTarget}, {
  projectDirCreated: it => modifyPackageJson(it, data => {
    data.build = {
      productName: "bar",
    }
  }, true)
}))

test("relative index", appTwo({
  targets: linuxDirTarget,
}, {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.main = "./index.js"
  }, true)
}))

it.ifDevOrLinuxCi("electron version from electron-prebuilt dependency", app({
  targets: linuxDirTarget,
}, {
  projectDirCreated: projectDir => Promise.all([
    outputJson(path.join(projectDir, "node_modules", "electron-prebuilt", "package.json"), {
      version: ELECTRON_VERSION
    }),
    modifyPackageJson(projectDir, data => {
      delete data.build.electronVersion
      data.devDependencies = {}
    })
  ])
}))

test.ifDevOrLinuxCi("electron version from electron dependency", app({
  targets: linuxDirTarget,
}, {
  projectDirCreated: projectDir => Promise.all([
    outputJson(path.join(projectDir, "node_modules", "electron", "package.json"), {
      version: ELECTRON_VERSION
    }),
    modifyPackageJson(projectDir, data => {
      delete data.build.electronVersion
      data.devDependencies = {}
    })
  ])
}))

test.ifDevOrLinuxCi("electron version from build", app({
  targets: linuxDirTarget,
}, {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.devDependencies = {}
    data.build.electronVersion = ELECTRON_VERSION
  })
}))

test("www as default dir", appTwo({
  targets: Platform.LINUX.createTarget(DIR_TARGET),
}, {
  projectDirCreated: projectDir => fs.rename(path.join(projectDir, "app"), path.join(projectDir, "www"))
}))

test.ifLinuxOrDevMac("afterPack", () => {
  let called = 0
  return assertPack("test-app-one", {
    targets: createTargets([Platform.LINUX, Platform.MAC], DIR_TARGET),
    config: {
      afterPack: () => {
        called++
        return Promise.resolve()
      }
    }
  }, {
    packed: async () => {
      expect(called).toEqual(2)
    }
  })
})

test.ifLinuxOrDevMac("afterSign", () => {
  let called = 0
  return assertPack("test-app-one", {
    targets: createTargets([Platform.LINUX, Platform.MAC], DIR_TARGET),
    config: {
      afterSign: () => {
        called++
        return Promise.resolve()
      }
    }
  }, {
    packed: async () => {
      expect(called).toEqual(2)
    }
  })
})

test.ifLinuxOrDevMac("beforeBuild", () => {
  let called = 0
  return assertPack("test-app-one", {
    targets: createTargets([Platform.LINUX, Platform.MAC], DIR_TARGET),
    config: {
      npmRebuild: true,
      beforeBuild: async () => {
        called++
      }
    }
  }, {
    packed: async () => {
      expect(called).toEqual(2)
    }
  })
})

// https://github.com/electron-userland/electron-builder/issues/1738
test.ifDevOrLinuxCi("win smart unpack", () => {
  // test onNodeModuleFile hook
  const nodeModuleFiles: Array<string> = []
  let p = ""
  return app({
    targets: Platform.WINDOWS.createTarget(DIR_TARGET),
    config: {
      npmRebuild: true,
      onNodeModuleFile: file => {
        const name = toSystemIndependentPath(path.relative(p, file))
        if (!name.startsWith(".") && !name.endsWith(".dll") && name.includes(".")) {
          nodeModuleFiles.push(name)
        }
      },
    },
  }, {
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
      await verifySmartUnpack(context.getResources(Platform.WINDOWS))
      expect(nodeModuleFiles).toMatchSnapshot()
    }
  })()
})

export function removeUnstableProperties(data: any) {
  return JSON.parse(JSON.stringify(data, (name, value) => {
    if (name === "offset") {
      return undefined
    }
    else if (name.endsWith(".node") && value.size != null) {
      // size differs on various OS
      value.size = "<size>"
      return value
    }
    return value
  }))
}

async function verifySmartUnpack(resourceDir: string) {
  const asarFs = await readAsar(path.join(resourceDir, "app.asar"))
  expect(await asarFs.readJson(`node_modules${path.sep}debug${path.sep}package.json`)).toMatchObject({
    name: "debug"
  })
  expect(removeUnstableProperties(asarFs.header)).toMatchSnapshot()

  const files = (await walk(resourceDir, file => !path.basename(file).startsWith(".") && !file.endsWith(`resources${path.sep}inspector`)))
    .map(it => {
      const name = toSystemIndependentPath(it.substring(resourceDir.length + 1))
      if (it.endsWith("package.json")) {
        return {name, content: readFileSync(it, "utf-8")}
      }
      return name
    })
  expect(files).toMatchSnapshot()
}

// https://github.com/electron-userland/electron-builder/issues/1738
test.ifAll.ifDevOrLinuxCi("posix smart unpack", app({
  targets: linuxDirTarget,
  config: {
    // https://github.com/electron-userland/electron-builder/issues/3273
    // tslint:disable-next-line:no-invalid-template-strings
    copyright: "Copyright © 2018 ${author}",
    npmRebuild: true,
    files: [
      // test ignore pattern for node_modules defined as file set filter
      {
        filter: "!node_modules/napi-build-utils/napi-build-utils-1.0.0.tgz",
      }
    ]
  }
}, {
  projectDirCreated: packageJson(it => {
    it.dependencies = {
      debug: "4.1.1",
      "edge-cs": "1.2.1",
      // no prebuilt for electron 3
      // "lzma-native": "3.0.10",
      keytar: "5.6.0",
    }
  }),
  packed: context => {
    expect(context.packager.appInfo.copyright).toBe("Copyright © 2018 Foo Bar")
    return verifySmartUnpack(context.getResources(Platform.LINUX))
  }}))