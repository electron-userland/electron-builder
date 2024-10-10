import { assertPack, linuxDirTarget, verifyAsarFileTree,modifyPackageJson } from "./helpers/packTester"
import { Platform } from "electron-builder"
import { outputFile } from "fs-extra"
import * as path from "path"

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

test.ifAll("yarn two package.json w/ native module", () =>
  assertPack(
    "test-app-two-native-modules",
    {
      targets: linuxDirTarget,
    },
    {
      packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
    }
  )
)

// test.ifAll("yarn pnp with hoisted config", () =>
//   assertPack(
//     "test-app-two-native-modules",
//     {
//       targets: linuxDirTarget,
//     },
//     {
//       packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
//     }
//   )
// )

// test.ifAll("yarn pnp with hoisted config", () =>
//   assertPack(
//     "test-app-two-native-modules",
//     {
//       targets: linuxDirTarget,
//     },
//     {
//       packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
//     }
//   )
// )

test.ifAll("pnpm without hoisted config", () =>
  assertPack(
    "test-app-pnmp-hoisted",
    {
      targets: linuxDirTarget,
    },
    {
      isInstallDepsBefore: true,
      projectDirCreated: projectDir => {
        return Promise.all([
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
               "es5-ext": "0.10.53"
            }
          }),
          outputFile(path.join(projectDir, "pnpm-lock.yaml"), ""),
        ])
      },
      packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
    }
  )
)


// test.ifAll("pnpm with hoisted config", () =>
//   assertPack(
//     "test-app-pnpm-hoisted",
//     {
//       targets: linuxDirTarget,
//     },
//     {
//       packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
//     }
//   )
// )
