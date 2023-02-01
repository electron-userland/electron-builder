import { assertPack, linuxDirTarget, verifyAsarFileTree } from "./helpers/packTester"
import { Platform } from "electron-builder"

test.ifAll("yarn workspace", () =>
  assertPack(
    "test-app-yarn-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/test-app",
    },
    {
      packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
    }
  )
)

test.ifAll("conflict versions", () =>
  assertPack(
    "test-app-yarn-workspace-version-conflict",
    {
      targets: linuxDirTarget,
      projectDir: "packages/test-app",
    },
    {
      packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
    }
  )
)

test.ifAll("yarn several workspaces", () =>
  assertPack(
    "test-app-yarn-several-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/test-app",
    },
    {
      packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
    }
  )
)
