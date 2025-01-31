import { Platform } from "electron-builder"
import { assertPack, linuxDirTarget, verifyAsarFileTree } from "./helpers/packTester"

test("yarn workspace", () =>
  assertPack(
    "test-app-yarn-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/test-app",
    },
    {
      packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
    }
  ))

test("conflict versions", () =>
  assertPack(
    "test-app-yarn-workspace-version-conflict",
    {
      targets: linuxDirTarget,
      projectDir: "packages/test-app",
    },
    {
      packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
    }
  ))

test("yarn several workspaces", () =>
  assertPack(
    "test-app-yarn-several-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/test-app",
    },
    {
      packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
    }
  ))

test("yarn several workspaces and asarUnpack", () =>
  assertPack(
    "test-app-yarn-several-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/test-app",
      config: {
        asarUnpack: ["**/node_modules/ms/**/*"],
      },
    },
    {
      packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
    }
  ))

test("yarn two package.json w/ native module", () =>
  assertPack(
    "test-app-two-native-modules",
    {
      targets: linuxDirTarget,
    },
    {
      packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
    }
  ))
