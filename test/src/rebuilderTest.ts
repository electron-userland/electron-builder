import { Configuration, Platform } from "app-builder-lib"
import { PM } from "app-builder-lib"
import { exists } from "builder-util"
import path from "path"
import { assertPack, linuxDirTarget, modifyPackageJson } from "./helpers/packTester.js"
import { ELECTRON_VERSION } from "./helpers/testConfig.js"
import { verifySmartUnpack } from "./helpers/verifySmartUnpack.js"

const packageConfig = (data: any) => {
  data.name = "@packageManagers/test-app-yarn-workspace"
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
      packageManager: PM.YARN,
      storeDepsLockfileSnapshot: true,
      packed: async context => {
        await verifySmartUnpack(expect, context.getResources(Platform.LINUX))
        expect(await exists(path.join(context.getResources(Platform.LINUX), "app.asar.unpacked", extraFile))).toBeTruthy()
      },
      projectDirCreated: async projectDir => {
        await modifyPackageJson(path.join(projectDir, "packages", "test-app"), data => packageConfig(data))
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
      packageManager: PM.YARN_BERRY,
      storeDepsLockfileSnapshot: true,
      packed: async context => {
        await verifySmartUnpack(expect, context.getResources(Platform.LINUX))
        expect(await exists(path.join(context.getResources(Platform.LINUX), "app.asar.unpacked", extraFile))).toBeTruthy()
      },
      projectDirCreated: async projectDir => {
        await modifyPackageJson(path.join(projectDir, "packages", "test-app"), data => packageConfig(data))
      },
    }
  ))
