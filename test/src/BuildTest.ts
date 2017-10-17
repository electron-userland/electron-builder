import BluebirdPromise from "bluebird-lst"
import { walk } from "builder-util/out/fs"
import { checkWineVersion } from "builder-util/out/wine"
import { Arch, createTargets, DIR_TARGET, Platform } from "electron-builder"
import { readAsar } from "electron-builder/out/asar/asar"
import { move, outputJson, readJson } from "fs-extra-p"
import * as path from "path"
import { app, appTwo, appTwoThrows, assertPack, linuxDirTarget, modifyPackageJson, packageJson } from "./helpers/packTester"
import { ELECTRON_VERSION } from "./helpers/testConfig"

test("cli", async () => {
  // because these methods are internal
  const { configureBuildCommand, normalizeOptions } = require("electron-builder/out/builder")
  const yargs = require("yargs")
  configureBuildCommand(yargs)

  function parse(input: string): any {
    return normalizeOptions(yargs.parse(input.split(" ")))
  }

  function expected(opt: any): object {
    return {
      publish: undefined,
      draft: undefined,
      prerelease: undefined, ...opt}
  }

  expect(parse("--platform mac")).toMatchSnapshot()

  expect(parse("-owl --x64 --ia32"))
  expect(parse("-mwl --x64 --ia32"))

  expect(parse("--dir")).toMatchObject(expected({targets: Platform.current().createTarget(DIR_TARGET)}))
  expect(parse("--mac --dir")).toMatchSnapshot()
  expect(parse("--x64 --dir")).toMatchObject(expected({targets: Platform.current().createTarget(DIR_TARGET, Arch.x64)}))
  expect(parse("--platform linux --dir")).toMatchSnapshot()

  expect(parse("--arch x64")).toMatchObject(expected({targets: Platform.current().createTarget(null, Arch.x64)}))
  expect(parse("--ia32 --x64")).toMatchObject(expected({targets: Platform.current().createTarget(null, Arch.x64, Arch.ia32)}))
  expect(parse("--linux")).toMatchSnapshot()
  expect(parse("--win")).toMatchSnapshot()
  expect(parse("-owl")).toMatchSnapshot()
  expect(parse("-l tar.gz:ia32")).toMatchSnapshot()
  expect(parse("-l tar.gz:x64")).toMatchSnapshot()
  expect(parse("-l tar.gz")).toMatchSnapshot()
  expect(parse("-w tar.gz:x64")).toMatchSnapshot()

  expect(parse("-c.compress=store -c.asar -c ./config.json")).toMatchObject({
    config: {
      asar: true,
      compress: "store",
      extends: "./config.json"
    }
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

test("extraMetadata and config as path", app(Object.assign(require("electron-builder/out/builder").normalizeOptions({
  extraMetadata: {
    field: "bar.js"
  },
  config: "foo.json",
}), {
  targets: linuxDirTarget,
}), {
  projectDirCreated: projectDir => {
    return outputJson(path.join(projectDir, "foo.json"), {
      asar: false
    })
  },
  packed: async context => {
    const resourceDir = context.getResources(Platform.LINUX)
    expect(await readJson(path.join(resourceDir, "app", "package.json"))).toMatchSnapshot()
  }
}))

it.ifDevOrLinuxCi("electron version from electron-prebuilt dependency", app({
  targets: linuxDirTarget,
}, {
  projectDirCreated: projectDir => BluebirdPromise.all([
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
  projectDirCreated: projectDir => BluebirdPromise.all([
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
  projectDirCreated: projectDir => move(path.join(projectDir, "app"), path.join(projectDir, "www"))
}))

test.ifLinuxOrDevMac("afterPack", () => {
  let called = 0
  return assertPack("test-app-one", {
    targets: createTargets([Platform.LINUX, Platform.MAC], DIR_TARGET),
    config: {
      afterPack: () => {
        called++
        return BluebirdPromise.resolve()
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
test.ifDevOrLinuxCi("win smart unpack", app({
  targets: Platform.WINDOWS.createTarget(DIR_TARGET),
  config: {
    npmRebuild: true,
  },
}, {
  projectDirCreated: packageJson(it => {
    it.dependencies = {
      debug: "^2.2.0",
      "edge-cs": "1.2.1",
      "@electron-builder/test-smart-unpack": "1.0.0",
      "@electron-builder/test-smart-unpack-empty": "1.0.0",
    }
  }),
  packed: context => verifySmartUnpack(context.getResources(Platform.WINDOWS))
}))

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
  const fs = await readAsar(path.join(resourceDir, "app.asar"))
  expect(await fs.readJson("node_modules/debug/package.json")).toMatchObject({
    name: "debug"
  })
  expect(removeUnstableProperties(fs.header)).toMatchSnapshot()

  expect((await walk(resourceDir, file => !path.basename(file).startsWith("."))).map(it => it.substring(resourceDir.length + 1))).toMatchSnapshot()
}

// https://github.com/electron-userland/electron-builder/issues/1738
test.ifAll.ifDevOrLinuxCi("posix smart unpack", app({
  targets: linuxDirTarget,
  config: {
    npmRebuild: true,
  }
}, {
  projectDirCreated: packageJson(it => {
    it.dependencies = {
      debug: "^2.2.0",
      "edge-cs": "1.2.1",
      "lzma-native": "3.0.1",
      // test that prebuild-install is not copied
      "keytar-prebuild": "4.0.4",
    }
    it.resolutions = {
      "node-abi": "^2.1.1"
    }
  }),
  packed: context => verifySmartUnpack(context.getResources(Platform.LINUX))}))

test("wine version", async () => {
  await checkWineVersion(BluebirdPromise.resolve("1.9.23 (Staging)"))
  await checkWineVersion(BluebirdPromise.resolve("2.0-rc2"))
})
