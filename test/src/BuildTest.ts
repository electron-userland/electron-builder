import test from "./helpers/avaEx"
import { assertPack, modifyPackageJson, platform, getPossiblePlatforms, currentPlatform } from "./helpers/packTester"
import { move, outputJson } from "fs-extra-p"
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { archFromString, BuildOptions, Platform, Arch, PackagerOptions, DIR_TARGET, createTargets, PublishOptions } from "out"
import { normalizeOptions } from "out/builder"
import { createYargs } from "out/cliOptions"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter")

test("cli", () => {
  const yargs = createYargs()

  const base: PublishOptions = {
    publish: undefined,
    draft: undefined,
    prerelease: undefined,
  }

  function expected(opt: PackagerOptions): any {
    return Object.assign(base, opt)
  }

  function parse(input: string): BuildOptions {
    return normalizeOptions(yargs.parse(input.split(" ")))
  }

  assertThat(parse("--platform osx")).isEqualTo(expected({targets: Platform.MAC.createTarget()}))
  assertThat(parse("--platform mac")).isEqualTo(expected({targets: Platform.MAC.createTarget()}))

  const all = expected({targets: new Map([...Platform.MAC.createTarget(null, Arch.x64), ...Platform.WINDOWS.createTarget(null, Arch.x64, Arch.ia32), ...Platform.LINUX.createTarget(null, Arch.x64, Arch.ia32)])})
  assertThat(parse("-owl --x64 --ia32")).isEqualTo(all)
  assertThat(parse("-mwl --x64 --ia32")).isEqualTo(all)

  assertThat(parse("--dir")).isEqualTo(expected({targets: Platform.current().createTarget(DIR_TARGET)}))
  assertThat(parse("--mac --dir")).isEqualTo(expected({targets: Platform.MAC.createTarget(DIR_TARGET)}))
  assertThat(parse("--ia32 --dir")).isEqualTo(expected({targets: Platform.current().createTarget(DIR_TARGET, Arch.ia32)}))
  assertThat(parse("--platform linux --dir")).isEqualTo(expected({targets: Platform.LINUX.createTarget(DIR_TARGET)}))

  assertThat(parse("--osx")).isEqualTo(expected({targets: Platform.MAC.createTarget()}))
  assertThat(parse("--arch x64")).isEqualTo(expected({targets: Platform.current().createTarget(null, Arch.x64)}))
  assertThat(parse("--ia32 --x64")).isEqualTo(expected({targets: Platform.current().createTarget(null, Arch.x64, Arch.ia32)}))
  assertThat(parse("--linux")).isEqualTo(expected({targets: Platform.LINUX.createTarget()}))
  assertThat(parse("--win")).isEqualTo(expected({targets: Platform.WINDOWS.createTarget()}))
  assertThat(parse("-owl")).isEqualTo(expected({targets: createTargets([Platform.MAC, Platform.WINDOWS, Platform.LINUX])}))
  assertThat(parse("-l tar.gz:ia32")).isEqualTo(expected({targets: Platform.LINUX.createTarget("tar.gz", Arch.ia32)}))
  assertThat(parse("-l tar.gz:x64")).isEqualTo(expected({targets: Platform.LINUX.createTarget("tar.gz", Arch.x64)}))
  assertThat(parse("-l tar.gz")).isEqualTo(expected({targets: Platform.LINUX.createTarget("tar.gz", archFromString(process.arch))}))
  assertThat(parse("-w tar.gz:x64")).isEqualTo(expected({targets: Platform.WINDOWS.createTarget("tar.gz", Arch.x64)}))
})

test("custom buildResources dir", () => assertPack("test-app-one", allPlatforms(), {
  tempDirCreated: projectDir => BluebirdPromise.all([
    modifyPackageJson(projectDir, data => {
      data.directories = {
        buildResources: "custom"
      }
    }),
    move(path.join(projectDir, "build"), path.join(projectDir, "custom"))
  ])
}))

test("custom output dir", () => assertPack("test-app-one", allPlatforms(false), {
  tempDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.directories = {
      output: "customDist"
    }
  }),
  packed: async (projectDir) => {
    await assertThat(path.join(projectDir, "customDist")).isDirectory()
  }
}))

test("build in the app package.json", t => t.throws(assertPack("test-app", allPlatforms(), {
  tempDirCreated: it => modifyPackageJson(it, data => {
    data.build = {
      "iconUrl": "bar",
    }
  }, true)
}), /'build' in the application package\.json .+/))

test("name in the build", t => t.throws(assertPack("test-app-one", currentPlatform(), {
  tempDirCreated: it => modifyPackageJson(it, data => {
    data.build = {
      "name": "Cool App",
    }
  })
}), /'name' in the 'build' is forbidden/))

// this test also test appMetadata, so, we must use test-app here
test("empty description", t => t.throws(assertPack("test-app", {
  targets: Platform.LINUX.createTarget(),
  appMetadata: <any>{
    description: "",
  }
}), /Please specify 'description'/))

test("invalid main in the app package.json", t => t.throws(assertPack("test-app", allPlatforms(false), {
  tempDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.main = "main.js"
  }, true)
}), /Application entry file "main.js" in the /))

test("invalid main in the app package.json (no asar)", t => t.throws(assertPack("test-app", allPlatforms(false), {
  tempDirCreated: projectDir => {
    return BluebirdPromise.all([
      modifyPackageJson(projectDir, data => {
        data.main = "main.js"
      }, true),
      modifyPackageJson(projectDir, data => {
        data.build.asar = false
      })
    ])
  }
}), `Application entry file "main.js" does not exist. Seems like a wrong configuration.`))

test("main in the app package.json (no asar)", () => assertPack("test-app", allPlatforms(false), {
  tempDirCreated: projectDir => {
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

test("relative index", () => assertPack("test-app", allPlatforms(false), {
  tempDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.main = "./index.js"
  }, true)
}))

const electronVersion = "1.2.6"

test.ifNotWindows("electron version from electron-prebuilt dependency", () => assertPack("test-app-one", {
  targets: Platform.LINUX.createTarget(DIR_TARGET),
}, {
  tempDirCreated: projectDir => BluebirdPromise.all([
    outputJson(path.join(projectDir, "node_modules", "electron-prebuilt", "package.json"), {
      version: electronVersion
    }),
    modifyPackageJson(projectDir, data => {
      data.devDependencies = {}
    })
  ])
}))

test.ifNotWindows("electron version from build", () => assertPack("test-app-one", {
  targets: Platform.LINUX.createTarget(DIR_TARGET),
}, {
  tempDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.devDependencies = {}
    data.build.electronVersion = electronVersion
  })
}))

test("www as default dir", () => assertPack("test-app", currentPlatform(), {
  tempDirCreated: projectDir => move(path.join(projectDir, "app"), path.join(projectDir, "www"))
}))

test("afterPack", t => {
  const targets = process.env.CI ? Platform.fromString(process.platform).createTarget(DIR_TARGET) : getPossiblePlatforms()
  let called = 0
  return assertPack("test-app-one", {
    targets: targets,
    devMetadata: {
      build: {
        afterPack: () => {
          called++
          return BluebirdPromise.resolve()
        }
      }
    }
  }, {
    packed: () => {
      t.is(called, targets.size)
      return BluebirdPromise.resolve()
    }
  })
})

test.ifWinCi("Build MacOS on Windows is not supported", (t: any) => t.throws(assertPack("test-app-one", platform(Platform.MAC)), /Build for MacOS is supported only on MacOS.+/))

function allPlatforms(dist: boolean = true): PackagerOptions {
  return {
    targets: getPossiblePlatforms(dist ? null : DIR_TARGET),
  }
}