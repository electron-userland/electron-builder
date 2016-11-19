import {
  assertPack, modifyPackageJson, getPossiblePlatforms, app, appThrows, packageJson,
  appTwoThrows, allPlatforms
} from "./helpers/packTester"
import { move, outputJson } from "fs-extra-p"
import BluebirdPromise from "bluebird-lst-c"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { archFromString, BuildOptions, Platform, Arch, PackagerOptions, DIR_TARGET, createTargets } from "out"
import { normalizeOptions } from "out/builder"
import { createYargs } from "out/cliOptions"
import { extractFile } from "asar-electron-builder"
import { ELECTRON_VERSION } from "./helpers/config"

test("cli", async () => {
  const yargs = createYargs()

  function expected(opt: BuildOptions): any {
    return Object.assign({
      publish: undefined,
      draft: undefined,
      prerelease: undefined,
      extraMetadata: undefined,
    }, opt)
  }

  function parse(input: string): BuildOptions {
    return normalizeOptions(yargs.parse(input.split(" ")))
  }

  assertThat(parse("--platform mac")).isEqualTo(expected({targets: Platform.MAC.createTarget()}))

  const all = expected({targets: new Map([...Platform.MAC.createTarget(null, Arch.x64), ...Platform.WINDOWS.createTarget(null, Arch.x64, Arch.ia32), ...Platform.LINUX.createTarget(null, Arch.x64, Arch.ia32)])})
  assertThat(parse("-owl --x64 --ia32")).isEqualTo(all)
  assertThat(parse("-mwl --x64 --ia32")).isEqualTo(all)

  assertThat(parse("--dir")).isEqualTo(expected({targets: Platform.current().createTarget(DIR_TARGET)}))
  assertThat(parse("--mac --dir")).isEqualTo(expected({targets: Platform.MAC.createTarget(DIR_TARGET)}))
  assertThat(parse("--ia32 --dir")).isEqualTo(expected({targets: Platform.current().createTarget(DIR_TARGET, Arch.ia32)}))
  assertThat(parse("--platform linux --dir")).isEqualTo(expected({targets: Platform.LINUX.createTarget(DIR_TARGET)}))

  assertThat(parse("--arch x64")).isEqualTo(expected({targets: Platform.current().createTarget(null, Arch.x64)}))
  assertThat(parse("--ia32 --x64")).isEqualTo(expected({targets: Platform.current().createTarget(null, Arch.x64, Arch.ia32)}))
  assertThat(parse("--linux")).isEqualTo(expected({targets: Platform.LINUX.createTarget()}))
  assertThat(parse("--win")).isEqualTo(expected({targets: Platform.WINDOWS.createTarget()}))
  assertThat(parse("-owl")).isEqualTo(expected({targets: createTargets([Platform.MAC, Platform.WINDOWS, Platform.LINUX])}))
  assertThat(parse("-l tar.gz:ia32")).isEqualTo(expected({targets: Platform.LINUX.createTarget("tar.gz", Arch.ia32)}))
  assertThat(parse("-l tar.gz:x64")).isEqualTo(expected({targets: Platform.LINUX.createTarget("tar.gz", Arch.x64)}))
  assertThat(parse("-l tar.gz")).isEqualTo(expected({targets: Platform.LINUX.createTarget("tar.gz", archFromString(process.arch))}))
  assertThat(parse("-w tar.gz:x64")).isEqualTo(expected({targets: Platform.WINDOWS.createTarget("tar.gz", Arch.x64)}))

  function parseExtraMetadata(input: string) {
    const result = parse(input)
    delete result.targets
    return result
  }
  assertThat(parseExtraMetadata("--em.foo=bar")).isEqualTo(expected({extraMetadata: {
    foo: "bar",
  }}))
})

// only dir - avoid DMG
test("custom buildResources dir", app(allPlatforms(false), {
  projectDirCreated: projectDir => BluebirdPromise.all([
    modifyPackageJson(projectDir, data => {
      data.directories = {
        buildResources: "custom"
      }
    }),
    move(path.join(projectDir, "build"), path.join(projectDir, "custom"))
  ])
}))

test("custom output dir", app(allPlatforms(false), {
  projectDirCreated: packageJson(it => {
    it.directories = {
      output: "customDist",
      // https://github.com/electron-userland/electron-builder/issues/601
      app: ".",
    }
  }),
  packed: async context => {
    await assertThat(path.join(context.projectDir, "customDist")).isDirectory()
  }
}))

test("build in the app package.json", appTwoThrows(/'build' in the application package\.json .+/, allPlatforms(), {
  projectDirCreated: it => modifyPackageJson(it, data => {
    data.build = {
      "iconUrl": "bar",
    }
  }, true)
}))

test("name in the build", appThrows(/'name' in the 'build' is forbidden/, currentPlatform(), {projectDirCreated: packageJson(it => it.build = {"name": "Cool App"})}))

// this test also test appMetadata, so, we must use test-app here
test("empty description", appTwoThrows(/Please specify 'description'/, {
  targets: Platform.LINUX.createTarget(),
  appMetadata: <any>{
    description: "",
  }
}))

test("relative index", () => assertPack("test-app", allPlatforms(false), {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.main = "./index.js"
  }, true)
}))

it.ifDevOrLinuxCi("electron version from electron-prebuilt dependency", app({
  targets: Platform.LINUX.createTarget(DIR_TARGET),
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
  targets: Platform.LINUX.createTarget(DIR_TARGET),
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
  targets: Platform.LINUX.createTarget(DIR_TARGET),
}, {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.devDependencies = {}
    data.build.electronVersion = ELECTRON_VERSION
  })
}))

test("www as default dir", () => assertPack("test-app", currentPlatform(), {
  projectDirCreated: projectDir => move(path.join(projectDir, "app"), path.join(projectDir, "www"))
}))

test("afterPack", () => {
  const targets = process.env.CI ? Platform.fromString(process.platform).createTarget(DIR_TARGET) : getPossiblePlatforms(DIR_TARGET)
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
      expect(called).toEqual(targets.size)
      return BluebirdPromise.resolve()
    }
  })
})

// ifMac("app-executable-deps", () => {
//   return assertPack("app-executable-deps", {
//     targets: Platform.current().createTarget(DIR_TARGET),
//   }, {
//     useTempDir: false,
//     packed: async context => {
//       const data = await readJson(path.join(context.outDir, "mac/app-executable-deps.app/Contents/Resources/app.asar.unpacked", "node_modules", "node-notifier", "package.json"))
//       for (let name of Object.getOwnPropertyNames(data)) {
//         if (name[0] === "_") {
//           throw new Error("Property name starts with _")
//         }
//       }
//     }
//   })
// })

test.ifDevOrLinuxCi("smart unpack", () => {
  return assertPack("test-app-one", {
    targets: Platform.LINUX.createTarget(DIR_TARGET),
  }, {
    npmInstallBefore: true,
    projectDirCreated: packageJson(it => {
      it.dependencies = {
        "debug": "^2.2.0",
        "edge-cs": "^1.0.0"
      }
    }),
    packed: context => {
      assertThat(JSON.parse(extractFile(path.join(context.getResources(Platform.LINUX), "app.asar"), "node_modules/debug/package.json").toString())).hasProperties({
        name: "debug"
      })
      return BluebirdPromise.resolve()
    }
  })
})

function currentPlatform(): PackagerOptions {
  return {
    targets: Platform.fromString(process.platform).createTarget(DIR_TARGET),
  }
}