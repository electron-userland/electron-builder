import { assertPack, linuxDirTarget, verifyAsarFileTree, modifyPackageJson } from "./helpers/packTester"
import { Platform, Arch, DIR_TARGET } from "electron-builder"
import { outputFile, copySync, rmSync, readJsonSync, writeJsonSync, mkdirSync } from "fs-extra"
import * as path from "path"
import { spawn } from "builder-util/out/util"

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
    }
  ))

test("conflict versions", ({ expect }) =>
  assertPack(
    expect,
    "test-app-yarn-workspace-version-conflict",
    {
      targets: linuxDirTarget,
      projectDir: "packages/test-app",
    },
    {
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
    }
  ))

test("yarn several workspaces", ({ expect }) =>
  assertPack(
    expect,
    "test-app-yarn-several-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/test-app",
    },
    {
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
    }
  ))

test("yarn several workspaces and asarUnpack", ({ expect }) =>
  assertPack(
    expect,
    "test-app-yarn-several-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/test-app",
      config: {
        asarUnpack: ["**/node_modules/ms/**/*"],
      },
    },
    {
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
    }
  ))

test("yarn two package.json w/ native module", ({ expect }) =>
  assertPack(
    expect,
    "test-app-two-native-modules",
    {
      targets: linuxDirTarget,
    },
    {
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
    }
  ))

test("yarn two package.json", ({ expect }) =>
  assertPack(
    expect,
    "test-app-hoisted",
    {
      targets: linuxDirTarget,
    },
    {
      isInstallDepsBefore: false,
      projectDirCreated: async projectDir => {
        await modifyPackageJson(projectDir, data => {
          data.dependencies = {
            "electron-updater": "6",
            express: "4",
            "patch-package": "^8.0.0",
          }
          data.devDependencies = {
            electron: "23.2.0",
            "del-cli": "6",
            "electron-builder": "26",
            "fs-extra": "11",
          }
          data.build.directories = {
            app: "app",
          }
        })

        // install dependencies in project dir
        await spawn("npm", ["install"], {
          cwd: projectDir,
        })

        mkdirSync(path.join(projectDir, "app"))
        rmSync(path.join(projectDir, "app", "node_modules"), { recursive: true, force: true })
        copySync(path.join(projectDir, "index.html"), path.join(projectDir, "app", "index.html"))
        copySync(path.join(projectDir, "index.js"), path.join(projectDir, "app", "index.js"))
        copySync(path.join(projectDir, "node_modules"), path.join(projectDir, "app", "node_modules"))

        // delete package.json devDependencies
        const packageJson = readJsonSync(path.join(projectDir, "package.json"))
        delete packageJson.devDependencies
        delete packageJson.build
        delete packageJson.scripts
        writeJsonSync(path.join(projectDir, "app", "package.json"), packageJson)
      },
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
    }
  ))

test("yarn two package.json without node_modules", ({ expect }) =>
  assertPack(
    expect,
    "test-app-hoisted",
    {
      targets: linuxDirTarget,
    },
    {
      isInstallDepsBefore: false,
      projectDirCreated: async projectDir => {
        await modifyPackageJson(projectDir, data => {
          data.dependencies = {
            "electron-updater": "6",
            express: "4",
            "patch-package": "^8.0.0",
          }
          data.devDependencies = {
            electron: "23.2.0",
            "del-cli": "6",
            "electron-builder": "26",
            "fs-extra": "11",
          }
          data.build.directories = {
            app: "app",
          }
        })

        // install dependencies in project dir
        await spawn("npm", ["install"], {
          cwd: projectDir,
        })

        mkdirSync(path.join(projectDir, "app"))
        rmSync(path.join(projectDir, "app", "node_modules"), { recursive: true, force: true })
        copySync(path.join(projectDir, "index.html"), path.join(projectDir, "app", "index.html"))
        copySync(path.join(projectDir, "index.js"), path.join(projectDir, "app", "index.js"))

        // delete package.json devDependencies
        const packageJson = readJsonSync(path.join(projectDir, "package.json"))
        delete packageJson.devDependencies
        delete packageJson.build
        delete packageJson.scripts
        writeJsonSync(path.join(projectDir, "app", "package.json"), packageJson)
      },
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
    }
  ))
describe("isInstallDepsBefore=true", { sequential: true }, () => {
  test("yarn workspace for scope name", ({ expect }) =>
    assertPack(
      expect,
      "test-app-yarn-several-workspace",
      {
        targets: linuxDirTarget,
        projectDir: "packages/test-app",
      },
      {
        isInstallDepsBefore: true,
        projectDirCreated: async projectDir => {
          const subAppDir = path.join(projectDir, "packages", "test-app")
          return modifyPackageJson(subAppDir, data => {
            data.name = "@scope/xxx-app"
            data.dependencies = {
              "is-odd": "3.0.1",
            }
          })
        },
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      }
    ))

  // https://github.com/electron-userland/electron-builder/issues/8493
  test("pnpm es5-ext without hoisted config", ({ expect }) =>
    assertPack(
      expect,
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
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      }
    ))

  test("pnpm optional dependencies", ({ expect }) =>
    assertPack(
      expect,
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
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      }
    ))

  test.ifLinux("pnpm optional dependency not installable on linux", ({ expect }) =>
    assertPack(
      expect,
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
                "node-mac-permissions": "2.3.0",
              }
            }),
            outputFile(path.join(projectDir, "pnpm-lock.yaml"), ""),
          ])
        },
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      }
    )
  )

  test("yarn electron-clear-data", ({ expect }) =>
    assertPack(
      expect,
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
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.WINDOWS)),
      }
    ))

  test("npm electron-clear-data", ({ expect }) =>
    assertPack(
      expect,
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
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.WINDOWS)),
      }
    ))

  // https://github.com/electron-userland/electron-builder/issues/8842
  test("yarn some module add by manual instead of install", ({ expect }) =>
    assertPack(
      expect,
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
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.WINDOWS)),
      }
    ))

  //https://github.com/electron-userland/electron-builder/issues/8857
  test("yarn max stack", ({ expect }) =>
    assertPack(
      expect,
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
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      }
    ))

  test("pnpm max stack", ({ expect }) =>
    assertPack(
      expect,
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
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      }
    ))

  //github.com/electron-userland/electron-builder/issues/8842
  test("yarn ms", ({ expect }) =>
    assertPack(
      expect,
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
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      }
    ))

  //github.com/electron-userland/electron-builder/issues/8426
  test("yarn parse-asn1", ({ expect }) =>
    assertPack(
      expect,
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
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      }
    ))

  //github.com/electron-userland/electron-builder/issues/8431
  test("npm tar", ({ expect }) =>
    assertPack(
      expect,
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
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      }
    ))

  //github.com/electron-userland/electron-builder/issues/8881
  test("pnpm node-linker=hoisted", ({ expect }) =>
    assertPack(
      expect,
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
                dayjs: "1.11.13",
              }
            }),
            outputFile(path.join(projectDir, "pnpm-lock.yaml"), ""),
            outputFile(path.join(projectDir, ".npmrc"), "node-linker=hoisted"),
          ])
        },
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      }
    ))
  test("pnpm shamefully-hoist=true", ({ expect }) =>
    assertPack(
      expect,
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
                dayjs: "1.11.13",
              }
            }),
            outputFile(path.join(projectDir, "pnpm-lock.yaml"), ""),
            outputFile(path.join(projectDir, ".npmrc"), "shamefully-hoist=true"),
          ])
        },
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      }
    ))
  test("pnpm public-hoist-pattern=*", ({ expect }) =>
    assertPack(
      expect,
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
                dayjs: "1.11.13",
              }
            }),
            outputFile(path.join(projectDir, "pnpm-lock.yaml"), ""),
            outputFile(path.join(projectDir, ".npmrc"), "public-hoist-pattern=*"),
          ])
        },
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      }
    ))
})
