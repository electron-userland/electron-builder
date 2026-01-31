import { Platform } from "app-builder-lib"
import { PM } from "app-builder-lib/src/node-module-collector"
import { copyFile, outputFile, rm, writeFile } from "fs-extra"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { app, assertPack, getFixtureDir, getPackageManagerWithVersion, linuxDirTarget, modifyPackageJson, verifyAsarFileTree } from "./helpers/packTester"
import { ELECTRON_VERSION } from "./helpers/testConfig"
import { spawn } from "builder-util"

const yarnVersion = getPackageManagerWithVersion(PM.YARN).prepareEntry
const yarnBerryVersion = getPackageManagerWithVersion(PM.YARN_BERRY).prepareEntry

const packageConfig = (data: any, version: string) => {
  data.packageManager = version
  data.name = "hello-world"
  data.version = "1.0.0"
  data.dependencies = {
    ...data.debpendencies,
    debug: "4.4.3",
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
      storeDepsLockfileSnapshot: true,
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      projectDirCreated: async (projectDir, _tmpDir, testEnv) => {
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
        await spawn("yarn", ["install"], {
          cwd: projectDir,
          env: testEnv,
          stdio: "ignore",
        })
        await spawn("yarn", ["install"], {
          cwd: path.join(projectDir, "app"),
          env: testEnv,
          stdio: "ignore",
        })
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
      storeDepsLockfileSnapshot: true,
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      projectDirCreated: async (projectDir, _tmpDir, testEnv) => {
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
        await spawn("yarn", ["install"], {
          cwd: projectDir,
          env: testEnv,
          stdio: "ignore",
        })
        await spawn("yarn", ["install"], {
          cwd: path.join(projectDir, "app"),
          env: testEnv,
          stdio: "ignore",
        })
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
      storeDepsLockfileSnapshot: true,
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      projectDirCreated: async projectDir => {
        await modifyPackageJson(projectDir, data => {
          data.packageManager = yarnVersion
        })
        await modifyPackageJson(path.join(projectDir, "packages", "test-app"), data => packageConfig(data, yarnVersion))
      },
    }
  ))

test("yarn berry workspace", ({ expect }) =>
  assertPack(
    expect,
    "test-app-yarn-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/test-app",
    },
    {
      storeDepsLockfileSnapshot: true,
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
      storeDepsLockfileSnapshot: true,
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
      storeDepsLockfileSnapshot: true,
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
      storeDepsLockfileSnapshot: true,
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
      storeDepsLockfileSnapshot: true,
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      projectDirCreated: projectDir => modifyPackageJson(projectDir, data => packageConfig(data, "npm@9.8.1"), false),
    }
  ))

test("bun workspace --linker=isolated", ({ expect }) =>
  assertPack(
    expect,
    "test-app-bun-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/app",
    },
    {
      packageManager: PM.BUN,
      projectDirCreated: projectDir => {
        const appPkg = path.join(projectDir, "packages", "app")
        const libPkg = path.join(projectDir, "packages", "lib")

        return Promise.all([
          // root pkgs should not be included
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
              "is-plain-obj": "3.0.0",
            }
          }),
          modifyPackageJson(appPkg, data => {
            data.dependencies = {
              lib: "workspace:*",
              "is-bigint": "1.1.0",
              process: "^0.11.10",
            }
          }),
          modifyPackageJson(libPkg, data => {
            data.dependencies = {
              "left-pad": "1.3.0",
            }
          }),
          outputFile(path.join(projectDir, "bunfig.toml"), '[install]\nlinker = "isolated"\n'),
        ])
      },
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
    }
  ))

test("bun workspace --linker=isolated - multiple conflicting versions", ({ expect }) =>
  assertPack(
    expect,
    "test-app-bun-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/app",
    },
    {
      packageManager: PM.BUN,
      projectDirCreated: projectDir => {
        const appPkg = path.join(projectDir, "packages", "app")
        const libPkg = path.join(projectDir, "packages", "lib")

        return Promise.all([
          // root pkgs should not be included
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
              "is-plain-obj": "3.0.0",
            }
          }),
          modifyPackageJson(appPkg, data => {
            data.dependencies = {
              lib: "workspace:*",
              "is-bigint": "1.1.0",
              process: "^0.11.10",
            }
          }),
          modifyPackageJson(libPkg, data => {
            data.dependencies = {
              "left-pad": "1.3.0",
              // should include this in a nested node_modules directory
              "is-bigint": "1.0.4",
            }
          }),
          outputFile(path.join(projectDir, "bunfig.toml"), '[install]\nlinker = "isolated"\n'),
        ])
      },
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
    }
  ))

test("bun workspace --linker=hoisted", ({ expect }) =>
  assertPack(
    expect,
    "test-app-bun-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/app",
    },
    {
      packageManager: PM.BUN,
      projectDirCreated: projectDir => {
        const appPkg = path.join(projectDir, "packages", "app")
        const libPkg = path.join(projectDir, "packages", "lib")

        return Promise.all([
          // root pkgs should not be included
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
              "is-plain-obj": "3.0.0",
            }
          }),
          modifyPackageJson(appPkg, data => {
            data.dependencies = {
              lib: "workspace:*",
              "is-bigint": "1.1.0",
              process: "^0.11.10",
            }
          }),
          modifyPackageJson(libPkg, data => {
            data.dependencies = {
              "left-pad": "1.3.0",
            }
          }),
          outputFile(path.join(projectDir, "bunfig.toml"), '[install]\nlinker = "hoisted"\n'),
        ])
      },
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
    }
  ))

test("bun workspace --linker=hoisted - multiple conflicting versions", ({ expect }) =>
  assertPack(
    expect,
    "test-app-bun-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/app",
    },
    {
      packageManager: PM.BUN,
      projectDirCreated: projectDir => {
        const appPkg = path.join(projectDir, "packages", "app")
        const libPkg = path.join(projectDir, "packages", "lib")

        return Promise.all([
          // root pkgs should not be included
          modifyPackageJson(projectDir, data => {
            data.dependencies = {
              "is-plain-obj": "3.0.0",
            }
          }),
          modifyPackageJson(appPkg, data => {
            data.dependencies = {
              lib: "workspace:*",
              "is-bigint": "1.1.0",
              process: "^0.11.10",
            }
          }),
          modifyPackageJson(libPkg, data => {
            data.dependencies = {
              "left-pad": "1.3.0",
              // should include this in a nested node_modules directory, since it's a conflicting package version
              "is-bigint": "1.0.4",
            }
          }),
          outputFile(path.join(projectDir, "bunfig.toml"), '[install]\nlinker = "hoisted"\n'),
        ])
      },
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
    }
  ))

test("traversal hoisted", ({ expect }) =>
  assertPack(
    expect,
    "test-app-yarn-hoisted",
    {
      targets: linuxDirTarget,
    },
    {
      packageManager: PM.TRAVERSAL,
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
      },
    }
  ))

test("traversal workspace", ({ expect }) =>
  assertPack(
    expect,
    "test-app-yarn-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/test-app",
    },
    {
      packageManager: PM.TRAVERSAL,
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      projectDirCreated: async projectDir => {
        await modifyPackageJson(projectDir, data => {
          data.packageManager = yarnBerryVersion
        })
        await modifyPackageJson(path.join(projectDir, "packages", "test-app"), data => packageConfig(data, yarnBerryVersion))
      },
    }
  ))

test("traversal multi-package workspace", ({ expect }) =>
  assertPack(
    expect,
    "test-app-yarn-several-workspace",
    {
      targets: linuxDirTarget,
      projectDir: "packages/test-app",
    },
    {
      packageManager: PM.TRAVERSAL,
      packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      projectDirCreated: async projectDir => {
        await modifyPackageJson(projectDir, data => {
          data.packageManager = yarnBerryVersion
        })
        await modifyPackageJson(path.join(projectDir, "packages", "test-app"), data => packageConfig(data, yarnVersion))
      },
    }
  ))

// Test for local file:// protocol

Object.values(PM)
  .filter(pm => pm !== PM.BUN) // bun is not supported for file: protocol
  .forEach(pm => {
    test(`local file:// protocol with ${pm} for project outside workspace`, ({ expect }) => {
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
          projectDirCreated: async (projectDir, tmpDir, testEnv) => {
            const tempDir = await tmpDir.getTempDir()
            const localPath = path.join(tempDir, "foo")
            await outputFile(path.join(localPath, "package.json"), `{"name":"foo","version":"9.0.0","main":"index.js","license":"MIT","dependencies":{"ms":"2.0.0"}}`)
            await outputFile(path.join(localPath, "index.js"), `module.exports = require("ms")`)

            const pmCommand = getPackageManagerWithVersion(pm).cli
            await spawn(pmCommand, ["install"], {
              cwd: projectDir,
              env: { ...testEnv, YARN_ENABLE_IMMUTABLE_INSTALLS: "false" },
              stdio: "ignore",
            })
            await modifyPackageJson(projectDir, data => {
              data.dependencies = {
                foo: `file:${localPath}`,
              }
            })

            //`localPath` is dynamic and changes for every which causes `--frozen-lockfile` and `npm ci` to fail
            await spawn(pmCommand, ["install"], {
              cwd: projectDir,
              env: { ...testEnv, YARN_ENABLE_IMMUTABLE_INSTALLS: "false" },
              stdio: "ignore",
            })
          },
          packed: async context => {
            const resources = context.getResources(Platform.LINUX)
            await assertThat(expect, path.join(resources, "app.asar.unpacked", "node_modules", "foo", "package.json")).isFile()
          },
        }
      )
    })
  })
