import { extractFile } from "asar"
import BluebirdPromise from "bluebird-lst"
import { Arch, BuildOptions, DIR_TARGET, Platform } from "electron-builder"
import { build, normalizeOptions } from "electron-builder/out/builder"
import { createYargs } from "electron-builder/out/cli/cliOptions"
import { checkWineVersion } from "electron-builder/out/packager"
import { move, outputJson } from "fs-extra-p"
import isCi from "is-ci"
import * as path from "path"
import { ELECTRON_VERSION } from "./helpers/config"
import { assertThat } from "./helpers/fileAssert"
import { allPlatforms, app, appThrows, appTwo, appTwoThrows, assertPack, getPossiblePlatforms, modifyPackageJson, packageJson } from "./helpers/packTester"

const linuxDirTarget = Platform.LINUX.createTarget(DIR_TARGET)

test("cli", async () => {
  const yargs = createYargs()

  function parse(input: string): BuildOptions {
    return normalizeOptions(yargs.parse(input.split(" ")))
  }

  function expected(opt: BuildOptions): any {
    return Object.assign({
      publish: undefined,
      draft: undefined,
      prerelease: undefined,
      extraMetadata: undefined,
    }, opt)
  }

  expect(parse("--platform mac")).toMatchSnapshot()

  expect(parse("-owl --x64 --ia32"))
  expect(parse("-mwl --x64 --ia32"))

  expect(parse("--dir")).toMatchObject(expected({targets: Platform.current().createTarget(DIR_TARGET)}))
  expect(parse("--mac --dir")).toMatchSnapshot()
  expect(parse("--ia32 --dir")).toMatchObject(expected({targets: Platform.current().createTarget(DIR_TARGET, Arch.ia32)}))
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

  function parseExtraMetadata(input: string) {
    const result = parse(input)
    delete result.targets
    return result
  }

  expect(parseExtraMetadata("--em.foo=bar"))
})

function createBuildResourcesTest(platform: Platform) {
  return app({
    // only dir - avoid DMG
    targets: platform.createTarget(platform === Platform.MAC ? DIR_TARGET : null),
    config: {
      directories: {
        buildResources: "custom",
        output: "customDist",
        // https://github.com/electron-userland/electron-builder/issues/601
        app: ".",
      }
    },
  }, {
    packed: async context => {
      await assertThat(path.join(context.projectDir, "customDist")).isDirectory()
    },
    projectDirCreated: projectDir => move(path.join(projectDir, "build"), path.join(projectDir, "custom"))
  })
}

test("build in the app package.json", appTwoThrows(linuxDirTarget, {
  projectDirCreated: it => modifyPackageJson(it, data => {
    data.build = {
      "iconUrl": "bar",
    }
  }, true)
}))

test("relative index", appTwo(allPlatforms(false), {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.main = "./index.js"
  }, true)
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
  targets: Platform.current().createTarget(DIR_TARGET),
}, {
  projectDirCreated: projectDir => move(path.join(projectDir, "app"), path.join(projectDir, "www"))
}))

test("afterPack", () => {
  const targets = isCi ? Platform.current().createTarget(DIR_TARGET) : getPossiblePlatforms(DIR_TARGET)
  let called = 0
  return assertPack("test-app-one", {
    targets: targets,
    config: {
      afterPack: () => {
        called++
        return BluebirdPromise.resolve()
      }
    }
  }, {
    packed: async () => {
      expect(called).toEqual(targets.size)
    }
  })
})

test("beforeBuild", () => {
  const targets = isCi ? Platform.current().createTarget(DIR_TARGET) : getPossiblePlatforms(DIR_TARGET)
  let called = 0
  return assertPack("test-app-one", {
    targets: targets,
    config: {
      npmRebuild: true,
      beforeBuild: () => {
        called++
        return BluebirdPromise.resolve()
      }
    }
  }, {
    packed: async () => {
      expect(called).toEqual(targets.size)
    }
  })
})

test.ifDevOrLinuxCi("smart unpack", app({
  targets: linuxDirTarget,
}, {
  npmInstallBefore: true,
  projectDirCreated: packageJson(it => {
    it.dependencies = {
      "debug": "^2.2.0",
      "edge-cs": "^1.0.0"
    }
  }),
  packed: context => {
    expect(JSON.parse(extractFile(path.join(context.getResources(Platform.LINUX), "app.asar"), "node_modules/debug/package.json").toString())).toMatchObject({
      name: "debug"
    })
    return BluebirdPromise.resolve()
  }
}))

test("wine version", async () => {
  await checkWineVersion(BluebirdPromise.resolve("1.9.23 (Staging)"))
  await checkWineVersion(BluebirdPromise.resolve("2.0-rc2"))
})

describe.ifAll("sign", () => {
  test.ifNotWindows("custom buildResources and output dirs: mac", createBuildResourcesTest(Platform.MAC))
  test.ifNotCiMac("custom buildResources and output dirs: win", createBuildResourcesTest(Platform.WINDOWS))
  test.ifNotWindows("custom buildResources and output dirs: linux", createBuildResourcesTest(Platform.LINUX))

  test.ifDevOrLinuxCi("prepackaged", app({
    targets: linuxDirTarget,
  }, {
    packed: async (context) => {
      await build(normalizeOptions({
        prepackaged: path.join(context.outDir, "linux-unpacked"),
        project: context.projectDir,
        linux: ["deb"]
      }))
      await assertThat(path.join(context.projectDir, "dist", "TestApp_1.1.0_amd64.deb")).isFile()
    }
  }))

  test.ifDevOrLinuxCi("scheme validation", appThrows({
    targets: linuxDirTarget,
    config: <any>{
      foo: 123,
      mac: {
        foo: 12123,
      },
    },
  }))

  test.ifDevOrLinuxCi("scheme validation 2", appThrows({
    targets: linuxDirTarget,
    config: <any>{
      appId: 123,
    },
  }))
})
