import * as path from "path"
import { app, assertPack, getFixtureDir, getPackageManagerWithVersion, linuxDirTarget, modifyPackageJson, verifyAsarFileTree } from "./helpers/packTester"
import { ELECTRON_VERSION } from "./helpers/testConfig"
import { copyFile, outputFile, rm, writeFile } from "fs-extra"
import { execSync, spawnSync } from "child_process"
import { Platform } from "app-builder-lib"
import { PM } from "app-builder-lib/src/node-module-collector"
import { assertThat } from "./helpers/fileAssert"

const yarnVersion = getPackageManagerWithVersion(PM.YARN).prepareEntry
const yarnBerryVersion = getPackageManagerWithVersion(PM.YARN_BERRY).prepareEntry

const packageConfig = (data: any, version: string) => {
  data.packageManager = version
  data.name = "@packageManager/app"
  data.version = "1.0.0"
  data.dependencies = {
    ...data.debpendencies,
    debug: "^4.3.4",
  }
  data.devDependencies = {
    electron: ELECTRON_VERSION,
  }
  data.optionalDependencies = {}
  return data
}

test("yarn", ({ expect }) =>
  assertPack(
    expect,
    "test-app-yarn-hoisted",
    {
      targets: linuxDirTarget,
    },
    {
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),

      projectDirCreated: async projectDir => {
        await modifyPackageJson(
          projectDir,
          data => {
            data.packageManager = yarnVersion
          },
          false
        )
        await modifyPackageJson(projectDir, data => packageConfig(data, yarnVersion), true)
        await writeFile(path.join(projectDir, "yarn.lock"), "")
        await writeFile(path.join(projectDir, "app", "yarn.lock"), "")
        await copyFile(path.join(getFixtureDir(), ".pnp.cjs"), path.join(projectDir, ".pnp.cjs"))
        await rm(path.join(projectDir, ".yarnrc.yml"))
        execSync("yarn install", { cwd: projectDir, stdio: "inherit" })
        execSync("yarn install", { cwd: path.join(projectDir, "app"), stdio: "inherit" })
      },
    }
  ))

test("yarn berry", ({ expect }) =>
  assertPack(
    expect,
    "test-app-yarn-hoisted",
    {
      targets: linuxDirTarget,
    },
    {
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),

      projectDirCreated: async projectDir => {
        await modifyPackageJson(
          projectDir,
          data => {
            data.packageManager = yarnBerryVersion
          },
          false
        )
        await modifyPackageJson(projectDir, data => packageConfig(data, yarnBerryVersion), true)
        await writeFile(path.join(projectDir, "yarn.lock"), "")
        await writeFile(path.join(projectDir, "app", "yarn.lock"), "")
        await copyFile(path.join(getFixtureDir(), ".pnp.cjs"), path.join(projectDir, ".pnp.cjs"))
        await rm(path.join(projectDir, ".yarnrc.yml"))
        execSync("yarn install", { cwd: projectDir, stdio: "inherit" })
        // execSync("yarn unplug --all", { cwd: projectDir, stdio: "inherit" })
      },
    }
  ))
// yarn workspace
test("yarn workspace", ({ expect }) =>
  assertPack(
    expect,
    "test-app-yarn-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/test-app",
    },
    {
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      projectDirCreated: async projectDir => {
        await modifyPackageJson(projectDir, data => {
          data.packageManager = yarnVersion
        })
        await modifyPackageJson(path.join(projectDir, "packages", "test-app"), data => packageConfig(data, yarnVersion))
      },
    }
  ))
// yarn berry workspace
test("yarn berry workspace", ({ expect }) =>
  assertPack(
    expect,
    "test-app-yarn-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/test-app",
    },
    {
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      projectDirCreated: async projectDir => {
        await modifyPackageJson(projectDir, data => {
          data.packageManager = yarnBerryVersion
        })
        await modifyPackageJson(path.join(projectDir, "packages", "test-app"), data => packageConfig(data, yarnBerryVersion))
      },
    }
  ))
// yarn multi-package workspace
test("yarn multi-package workspace", ({ expect }) =>
  assertPack(
    expect,
    "test-app-yarn-several-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/test-app",
    },
    {
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      projectDirCreated: async projectDir => {
        await modifyPackageJson(projectDir, data => {
          data.packageManager = yarnVersion
        })
        await modifyPackageJson(path.join(projectDir, "packages", "test-app"), data => packageConfig(data, yarnVersion))
      },
    }
  ))
// yarn berry multi-package workspace
test("yarn berry multi-package workspace", ({ expect }) =>
  assertPack(
    expect,
    "test-app-yarn-several-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/test-app",
    },
    {
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      projectDirCreated: async projectDir => {
        await modifyPackageJson(projectDir, data => {
          data.packageManager = yarnBerryVersion
        })
        await modifyPackageJson(path.join(projectDir, "packages", "test-app"), data => packageConfig(data, yarnBerryVersion))
      },
    }
  ))

// Test for pnpm package manager
test("pnpm", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
    },
    {
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      projectDirCreated: projectDir =>
        modifyPackageJson(
          projectDir,
          data =>
            packageConfig(
              data,
              "pnpm@10.18.0+sha512.e804f889f1cecc40d572db084eec3e4881739f8dec69c0ff10d2d1beff9a4e309383ba27b5b750059d7f4c149535b6cd0d2cb1ed3aeb739239a4284a68f40cfa"
            ),
          false
        ),
    }
  ))

// Test for npm package manager
test("npm", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
    },
    {
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),

      projectDirCreated: projectDir => modifyPackageJson(projectDir, data => packageConfig(data, "npm@9.8.1"), false),
    }
  ))

// Test for local file:// protocol

Object.values(PM)
  .filter(pm => pm !== PM.BUN) // bun is not supported for file: protocol
  .forEach(pm => {
    test.only(`local file:// protocol with ${pm} for project outside workspace`, ({ expect }) => {
      return assertPack(
        expect,
        "test-app-one",
        {
          targets: linuxDirTarget,
          config: {
            files: ["**/*"],
            asarUnpack: ["**/node_modules/foo/**/*"],
          },
        },
        {
          storeDepsLockfileSnapshot: false,
          packageManager: pm,
          projectDirCreated: async (projectDir, tmpDir) => {
            const tempDir = await tmpDir.getTempDir()
            const localPath = path.join(tempDir, "foo")
            await outputFile(path.join(localPath, "package.json"), `{"name":"foo","version":"9.0.0","main":"index.js","license":"MIT","dependencies":{"ms":"2.0.0"}}`)
            await outputFile(path.join(localPath, "index.js"), `module.exports = require("ms")`)

            const pmCommand = getPackageManagerWithVersion(pm).cli
            execSync(`${pmCommand} install`, { cwd: localPath, stdio: "inherit" })
            await modifyPackageJson(projectDir, data => {
              data.dependencies = {
                foo: `file:${localPath}`,
              }
            })

            //`localPath` is dynamic and changes for every which causes `--frozen-lockfile` and `npm ci` to fail
            execSync(`${pmCommand} install`, { cwd: projectDir, stdio: "inherit" })
          },
          packed: async context => {
            const resources = context.getResources(Platform.LINUX)
            await assertThat(expect, path.join(resources, "app.asar.unpacked", "node_modules", "foo", "package.json")).isFile()
          },
        }
      )
    })
  })
