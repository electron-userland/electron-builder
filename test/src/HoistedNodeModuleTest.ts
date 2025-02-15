import { assertPack, linuxDirTarget, verifyAsarFileTree, modifyPackageJson } from "./helpers/packTester"
import { Platform, Arch, DIR_TARGET } from "electron-builder"
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

test.ifAll("yarn several workspaces and asarUnpack", () =>
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

// https://github.com/electron-userland/electron-builder/issues/8493
test.ifAll("pnpm es5-ext without hoisted config", () =>
  assertPack(
    "test-app-hoisted",
    {
      targets: linuxDirTarget,
    },
    {
      isInstallDepsBefore: true,
      projectDirCreated: projectDir => {
        return Promise.all([
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
              "es5-ext": "0.10.53",
            }
          }),
          outputFile(path.join(projectDir, "pnpm-lock.yaml"), ""),
        ])
      },
      packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
    }
  )
)

test.ifAll("pnpm optional dependencies", () =>
  assertPack(
    "test-app-hoisted",
    {
      targets: linuxDirTarget,
    },
    {
      isInstallDepsBefore: true,
      projectDirCreated: projectDir => {
        return Promise.all([
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
              "electron-clear-data": "^1.0.5",
            }
            data.optionalDependencies = {
              debug: "3.1.0",
            }
          }),
          outputFile(path.join(projectDir, "pnpm-lock.yaml"), ""),
        ])
      },
      packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
    }
  )
)

test.ifAll("yarn electron-clear-data", () =>
  assertPack(
    "test-app-hoisted",
    {
      targets: Platform.WINDOWS.createTarget(DIR_TARGET, Arch.x64),
    },
    {
      isInstallDepsBefore: true,
      projectDirCreated: projectDir => {
        return Promise.all([
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
              "electron-clear-data": "^1.0.5",
            }
            data.optionalDependencies = {
              debug: "3.1.0",
            }
          }),
          outputFile(path.join(projectDir, "yarn.lock"), ""),
        ])
      },
      packed: context => verifyAsarFileTree(context.getResources(Platform.WINDOWS)),
    }
  )
)

test.ifAll("npm electron-clear-data", () =>
  assertPack(
    "test-app-hoisted",
    {
      targets: Platform.WINDOWS.createTarget(DIR_TARGET, Arch.x64),
    },
    {
      isInstallDepsBefore: true,
      projectDirCreated: projectDir => {
        return Promise.all([
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
              "electron-clear-data": "^1.0.5",
            }
            data.optionalDependencies = {
              debug: "3.1.0",
            }
          }),
          outputFile(path.join(projectDir, "package-lock.json"), ""),
        ])
      },
      packed: context => verifyAsarFileTree(context.getResources(Platform.WINDOWS)),
    }
  )
)

// https://github.com/electron-userland/electron-builder/issues/8842
test.ifAll("yarn some module add by manual instead of install", () =>
  assertPack(
    "test-app-hoisted",
    {
      targets: Platform.WINDOWS.createTarget(DIR_TARGET, Arch.x64),
    },
    {
      isInstallDepsBefore: true,
      projectDirCreated: async (projectDir, tmpDir) => {
        await outputFile(path.join(projectDir, "yarn.lock"), "")
        await outputFile(path.join(projectDir, "node_modules", "foo", "package.json"), `{"name":"foo","version":"9.0.0","main":"index.js","license":"MIT"}`)
        await modifyPackageJson(projectDir, data => {
          data.dependencies = {
            debug: "3.1.0",
          }
        })
      },
      packed: context => verifyAsarFileTree(context.getResources(Platform.WINDOWS)),
    }
  )
)

//https://github.com/electron-userland/electron-builder/issues/8857
test.ifAll("yarn max stack", () =>
  assertPack(
    "test-app-hoisted",
    {
      targets: linuxDirTarget,
    },
    {
      isInstallDepsBefore: true,
      projectDirCreated: projectDir => {
        return Promise.all([
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
              "npm-run-all": "^4.1.5",
            }
          }),
          outputFile(path.join(projectDir, "yarn.lock"), ""),
        ])
      },
      packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
    }
  )
)

test.ifAll("pnpm max stack", () =>
  assertPack(
    "test-app-hoisted",
    {
      targets: linuxDirTarget,
    },
    {
      isInstallDepsBefore: true,
      projectDirCreated: projectDir => {
        return Promise.all([
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
              "npm-run-all": "^4.1.5",
            }
          }),
          outputFile(path.join(projectDir, "pnpm-lock.yaml"), ""),
        ])
      },
      packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
    }
  )
)

//github.com/electron-userland/electron-builder/issues/8842
test.ifAll("yarn ms", () =>
  assertPack(
    "test-app-hoisted",
    {
      targets: linuxDirTarget,
    },
    {
      isInstallDepsBefore: true,
      projectDirCreated: projectDir => {
        return Promise.all([
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
              "@sentry/electron": "5.11.0",
              "electron-clear-data": "^1.0.5",
            }
            data.devDependencies = {
              electron: "34.0.2",
            }
          }),
          outputFile(path.join(projectDir, "yarn.lock"), ""),
        ])
      },
      packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
    }
  )
)

//github.com/electron-userland/electron-builder/issues/8426
test.ifAll("yarn parse-asn1", () =>
  assertPack(
    "test-app-hoisted",
    {
      targets: linuxDirTarget,
    },
    {
      isInstallDepsBefore: true,
      projectDirCreated: projectDir => {
        return Promise.all([
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
              "parse-asn1": "5.1.7",
            }
          }),
          outputFile(path.join(projectDir, "yarn.lock"), ""),
        ])
      },
      packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
    }
  )
)

//github.com/electron-userland/electron-builder/issues/8431
test.ifAll("npm tar", () =>
  assertPack(
    "test-app-hoisted",
    {
      targets: linuxDirTarget,
    },
    {
      isInstallDepsBefore: true,
      projectDirCreated: projectDir => {
        return Promise.all([
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
              tar: "7.4.3",
            }
          }),
          outputFile(path.join(projectDir, "package-lock.json"), ""),
        ])
      },
      packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
    }
  )
)
