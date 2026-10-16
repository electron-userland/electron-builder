import { Platform } from "app-builder-lib"
import { AsarFilesystem, PM, readAsar } from "app-builder-lib/internal"
import fsExtra from "fs-extra"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert.js"
import { app, assertPack, getFixtureDir, getPackageManagerWithVersion, linuxDirTarget, modifyPackageJson, verifyAsarFileTree } from "./helpers/packTester.js"
import { ELECTRON_VERSION } from "./helpers/testConfig.js"
import { isEmptyOrSpaces, spawn } from "builder-util"
import * as which from "which"

const yarnVersion = getPackageManagerWithVersion(PM.YARN).prepareEntry
const yarnBerryVersion = getPackageManagerWithVersion(PM.YARN_BERRY).prepareEntry
const npmVersion = getPackageManagerWithVersion(PM.NPM).prepareEntry

const hasBun = !isEmptyOrSpaces(which.sync("bun", { nothrow: true }))

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

describe("Package Managers", { concurrent: false }, () => {
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
          await fsExtra.writeFile(path.join(projectDir, "yarn.lock"), "")
          await fsExtra.writeFile(path.join(projectDir, "app", "yarn.lock"), "")
          await fsExtra.copyFile(path.join(getFixtureDir(), ".pnp.cjs"), path.join(projectDir, ".pnp.cjs"))
          await fsExtra.rm(path.join(projectDir, ".yarnrc.yml"))
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
          await fsExtra.writeFile(path.join(projectDir, "yarn.lock"), "")
          await fsExtra.writeFile(path.join(projectDir, "app", "yarn.lock"), "")
          await fsExtra.copyFile(path.join(getFixtureDir(), ".pnp.cjs"), path.join(projectDir, ".pnp.cjs"))
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
                "pnpm@11.26.0+sha512.fc0e2bf890b9f983611f1ab68c0637bce914390653699f83c1a78b005ed25f2c81e77920c8fd8eee2ecf0b58b28cdcb00a84d97f69bcf7c56b2f344710238664"
              ),
            false
          ),
      }
    ))

  // #10253: since pnpm 10.29.3 (pnpm/pnpm#10601) `pnpm list --json` prints a repeated subtree once and every later
  // occurrence as a childless `deduped` stub, but it writes the JSON in a different order than the one it deduplicated
  // in. `lib` and `lib-b` resolve the `zod` peer of the same @modelcontextprotocol/sdk@1.32.1 to different majors, so the
  // SDK is installed twice under one name@version: its subtree (express, cross-spawn, debug, ...) is printed in full only
  // under `lib`, yet `lib-b` comes first in the JSON. Collecting by name@version while skipping stubs registered `lib-b`'s
  // copy, skipped `lib`'s as already seen, and dropped that whole subtree from the asar (MODULE_NOT_FOUND at launch).
  test("pnpm workspace with peer-dependency variants (pnpm 10.29.3+ deduped list output)", ({ expect }) =>
    assertPack(
      expect,
      "test-app-bun-workspace",
      {
        targets: linuxDirTarget,
        projectDir: "packages/app",
      },
      {
        storeDepsLockfileSnapshot: true,
        projectDirCreated: projectDir =>
          Promise.all([
            modifyPackageJson(projectDir, data => {
              data.packageManager =
                "pnpm@10.29.3+sha512.498e1fb4cca5aa06c1dcf2611e6fafc50972ffe7189998c409e90de74566444298ffe43e6cd2acdc775ba1aa7cc5e092a8b7054c811ba8c5770f84693d33d2dc"
            }),
            modifyPackageJson(path.join(projectDir, "packages", "app"), data => {
              data.build.electronVersion = ELECTRON_VERSION
              data.dependencies = { lib: "workspace:*", "lib-b": "workspace:*" }
            }),
            modifyPackageJson(path.join(projectDir, "packages", "lib"), data => {
              data.dependencies = { "@modelcontextprotocol/sdk": "1.32.1", zod: "3.25.76" }
            }),
            fsExtra.outputJson(path.join(projectDir, "packages", "lib-b", "package.json"), {
              name: "lib-b",
              version: "1.0.0",
              dependencies: { "@modelcontextprotocol/sdk": "1.32.1", zod: "4.1.12" },
            }),
            fsExtra.outputFile(path.join(projectDir, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n'),
            fsExtra.remove(path.join(projectDir, "bun.lock")),
          ]),
        packed: async context => {
          expect(await findUnresolvableDependencies(context.getResources(Platform.LINUX))).toEqual([])
        },
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
        projectDirCreated: projectDir => modifyPackageJson(projectDir, data => packageConfig(data, npmVersion), false),
      }
    ))

  test.runIf(hasBun)("bun workspace --linker=isolated", ({ expect }) =>
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
                process: "0.11.10",
              }
            }),
            modifyPackageJson(libPkg, data => {
              data.dependencies = {
                "left-pad": "1.3.0",
              }
            }),
            fsExtra.outputFile(path.join(projectDir, "bunfig.toml"), '[install]\nlinker = "isolated"\n'),
          ])
        },
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      }
    )
  )

  test.runIf(hasBun)("bun workspace --linker=isolated - multiple conflicting versions", ({ expect }) =>
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
                process: "0.11.10",
              }
            }),
            modifyPackageJson(libPkg, data => {
              data.dependencies = {
                "left-pad": "1.3.0",
                // should include this in a nested node_modules directory
                "is-bigint": "1.0.4",
              }
            }),
            fsExtra.outputFile(path.join(projectDir, "bunfig.toml"), '[install]\nlinker = "isolated"\n'),
          ])
        },
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      }
    )
  )

  test.runIf(hasBun)("bun workspace --linker=hoisted", ({ expect }) =>
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
                process: "0.11.10",
              }
            }),
            modifyPackageJson(libPkg, data => {
              data.dependencies = {
                "left-pad": "1.3.0",
              }
            }),
            fsExtra.outputFile(path.join(projectDir, "bunfig.toml"), '[install]\nlinker = "hoisted"\n'),
          ])
        },
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      }
    )
  )

  test.runIf(hasBun)("bun workspace --linker=hoisted - multiple conflicting versions", ({ expect }) =>
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
                process: "0.11.10",
              }
            }),
            modifyPackageJson(libPkg, data => {
              data.dependencies = {
                "left-pad": "1.3.0",
                // should include this in a nested node_modules directory, since it's a conflicting package version
                "is-bigint": "1.0.4",
              }
            }),
            fsExtra.outputFile(path.join(projectDir, "bunfig.toml"), '[install]\nlinker = "hoisted"\n'),
          ])
        },
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      }
    )
  )

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
          await fsExtra.writeFile(path.join(projectDir, "yarn.lock"), "")
          await fsExtra.writeFile(path.join(projectDir, "app", "yarn.lock"), "")
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
              // `foo` is a `file:` dependency in another temporary directory, outside the workspace: npm links it into node_modules
              fileOptions: { files: ["**/*"], allowExternalLinks: true },
              asar: { unpack: ["**/node_modules/foo/**/*"] },
              // npm >= 10 (install-links=false) symlinks a `file:` dependency and does NOT install
              // its transitive deps into the project tree (`npm ls` reports `ms` as missing), and
              // the traversal collector cannot resolve them from the out-of-tree link target either
              // — so `ms` is genuinely absent on disk for those package-manager variants. This test
              // exercises file:-protocol bundling/unpacking, not dependency completeness; allow the
              // known miss so the fail-closed `allowMissingDependencies` default (issue #10058)
              // doesn't reject the pack. The pnpm/yarn variants install `ms` normally, making the
              // allow-list inert there.
              allowMissingDependencies: ["ms"],
            },
          },
          {
            storeDepsLockfileSnapshot: false,
            packageManager: pm,
            projectDirCreated: async (projectDir, tmpDir, testEnv) => {
              const tempDir = await tmpDir.getTempDir()
              const localPath = path.join(tempDir, "foo")
              await fsExtra.outputFile(path.join(localPath, "package.json"), `{"name":"foo","version":"9.0.0","main":"index.js","license":"MIT","dependencies":{"ms":"2.0.0"}}`)
              await fsExtra.outputFile(path.join(localPath, "index.js"), `module.exports = require("ms")`)

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
})

/**
 * Every production dependency that the app or a package bundled in its asar declares, but that Node could not resolve from
 * it at runtime (its own `node_modules`, then each ancestor directory's), as `<package dir> -> <dependency>`. Anything listed
 * is a packaged app that fails with MODULE_NOT_FOUND.
 */
async function findUnresolvableDependencies(resourcesDir: string): Promise<Array<string>> {
  const asarFs = await readAsar(path.join(resourcesDir, "app.asar"))
  const exists = (segments: Array<string>) => segments.reduce<AsarFilesystem["header"] | undefined>((node, name) => node?.files?.[name], asarFs.header) != null
  const unresolvable: Array<string> = []
  // the app itself, `node_modules/<name>` or `node_modules/@scope/<name>` — not a package.json nested inside a package
  const isPackageDir = (segments: Array<string>) =>
    segments.length === 0 || segments.at(-2) === "node_modules" || (segments.at(-3) === "node_modules" && segments.at(-2)!.startsWith("@"))
  const walk = async (node: AsarFilesystem["header"], segments: Array<string>) => {
    if (node.files?.["package.json"] != null && isPackageDir(segments)) {
      const { dependencies } = await asarFs.readJson(path.join(...segments, "package.json"))
      for (const name of Object.keys(dependencies ?? {})) {
        let found = false
        for (let i = segments.length; i >= 0 && !found; i--) {
          // like Node, never look inside `.../node_modules/node_modules`
          found = segments[i - 1] !== "node_modules" && exists([...segments.slice(0, i), "node_modules", ...name.split("/"), "package.json"])
        }
        if (!found) {
          unresolvable.push(`${segments.join("/") || "."} -> ${name}`)
        }
      }
    }
    for (const [name, child] of Object.entries(node.files ?? {})) {
      if (child.files != null) {
        await walk(child, [...segments, name])
      }
    }
  }
  await walk(asarFs.header, [])
  return unresolvable.sort()
}
