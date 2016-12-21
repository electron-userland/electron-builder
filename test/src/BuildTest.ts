import {
  assertPack,
  modifyPackageJson,
  getPossiblePlatforms,
  app,
  appThrows,
  packageJson,
  appTwoThrows,
  allPlatforms
} from "./helpers/packTester"
import { move, outputJson } from "fs-extra-p"
import BluebirdPromise from "bluebird-lst-c"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { BuildOptions, Platform, PackagerOptions, DIR_TARGET } from "out"
import { normalizeOptions } from "out/builder"
import { createYargs } from "out/cli/cliOptions"
import { extractFile } from "asar-electron-builder"
import { ELECTRON_VERSION } from "./helpers/config"
import isCi from "is-ci"
import { checkWineVersion } from "out/packager"
import { Arch } from "out/metadata"

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
  const targets = isCi ? Platform.fromString(process.platform).createTarget(DIR_TARGET) : getPossiblePlatforms(DIR_TARGET)
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

// ifMac("app-executable-deps", () => {
//   return assertPack("app-executable-deps", {
//     targets: Platform.current().createTarget(DIR_TARGET),
//   }, {
//     useTempDir: false,
//     packed: async context => {
//       const data = await readJson(path.join(context.outDir, "mac/app-executable-deps.app/Contents/Resources/app.asar.unpacked", "node_modules", "node-notifier", "package.json"))
//       for (const name of Object.getOwnPropertyNames(data)) {
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
      expect(JSON.parse(extractFile(path.join(context.getResources(Platform.LINUX), "app.asar"), "node_modules/debug/package.json").toString())).toMatchObject({
        name: "debug"
      })
      return BluebirdPromise.resolve()
    }
  })
})

test("wine version", async () => {
  await checkWineVersion(BluebirdPromise.resolve("1.9.23 (Staging)"))
  await checkWineVersion(BluebirdPromise.resolve("2.0-rc2"))
})

function currentPlatform(): PackagerOptions {
  return {
    targets: Platform.fromString(process.platform).createTarget(DIR_TARGET),
  }
}
