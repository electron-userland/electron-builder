import { Configuration, Platform } from "app-builder-lib"
import { PM } from "app-builder-lib/out/node-module-collector"
import { exists } from "builder-util/src/util"
import path from "path"
import { assertPack, getPackageManagerWithVersion, linuxDirTarget, modifyPackageJson } from "./helpers/packTester"
import { ELECTRON_VERSION } from "./helpers/testConfig"
import { verifySmartUnpack } from "./helpers/verifySmartUnpack"

const yarnVersion = getPackageManagerWithVersion(PM.YARN).prepareEntry
const yarnBerryVersion = getPackageManagerWithVersion(PM.YARN_BERRY).prepareEntry

const packageConfig = (data: any, version: string) => {
  data.packageManager = version
  data.name = "@packageManager/app"
  data.version = "1.0.0"
  data.dependencies = {
    ...data.debpendencies,
    debug: "4.4.3",
    "better-sqlite3-multiple-ciphers": "12.2.0",
  }
  data.devDependencies = {
    electron: ELECTRON_VERSION,
  }
  data.optionalDependencies = {}
  return data
}

const extraFile = "./node_modules/better-sqlite3-multiple-ciphers/build/Release/better_sqlite3.node"
const config: Configuration = {
  npmRebuild: true,
  asarUnpack: ["**/better_sqlite3.node"],
}

test("yarn workspace", ({ expect }) =>
  assertPack(
    expect,
    "test-app-yarn-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/test-app",
      config,
    },
    {
      storeDepsLockfileSnapshot: true,
      packed: async context => {
        await verifySmartUnpack(expect, context.getResources(Platform.LINUX))
        expect(await exists(path.join(context.getResources(Platform.LINUX), "app.asar.unpacked", extraFile))).toBeTruthy()
      },
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
      config,
    },
    {
      storeDepsLockfileSnapshot: true,
      packed: async context => {
        await verifySmartUnpack(expect, context.getResources(Platform.LINUX))
        expect(await exists(path.join(context.getResources(Platform.LINUX), "app.asar.unpacked", extraFile))).toBeTruthy()
      },
      projectDirCreated: async projectDir => {
        await modifyPackageJson(projectDir, data => {
          data.packageManager = yarnBerryVersion
        })
        await modifyPackageJson(path.join(projectDir, "packages", "test-app"), data => packageConfig(data, yarnBerryVersion))
      },
    }
  ))
