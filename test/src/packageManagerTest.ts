import * as path from "path"
import { app, assertPack, copyTestAsset, getFixtureDir, linuxDirTarget, modifyPackageJson } from "./helpers/packTester"
import { ELECTRON_VERSION } from "./helpers/testConfig"
import { copyFile, rm, writeFile } from "fs-extra"
import { exec, execSync } from "child_process"

const yarnVersion = "yarn@1.22.19"
const yarnBerryVersion = "yarn@3.5.1"

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
      isInstallDepsBefore: true,
      projectDirCreated: async projectDir => {
        await modifyPackageJson(
          projectDir,
          data => {
            data.packageManager = yarnVersion
            // data.workspaceRoot = data.workspaceRoot || ["app"]
          },
          false
        )
        await modifyPackageJson(projectDir, data => packageConfig(data, yarnVersion), true)
        await writeFile(path.join(projectDir, "yarn.lock"), "")
        await writeFile(path.join(projectDir, "app", "yarn.lock"), "")
        await copyFile(path.join(getFixtureDir(), ".pnp.cjs"), path.join(projectDir, ".pnp.cjs"))
        await rm(path.join(projectDir, ".yarnrc.yml"))
        // await writeFile(path.join(projectDir, ".yarnrc.yml"), "workspaceRoot: .\n"),
        execSync("yarn install", { cwd: projectDir, stdio: "inherit" })
        // execSync("yarn install", { cwd: path.join(projectDir, "app"), stdio: "inherit" })
      },
    }
  ))

test.only("yarn berry", ({ expect }) =>
  assertPack(
    expect,
    "test-app-yarn-hoisted",
    {
      targets: linuxDirTarget,
    },
    {
      isInstallDepsBefore: true,
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
        await copyTestAsset(".pnp.cjs", path.join(projectDir, ".pnp.cjs"))
        await rm(path.join(projectDir, ".yarnrc.yml"))
        // await writeFile(path.join(projectDir, ".yarnrc.yml"), "workspaceRoot: .\n"),
        execSync("yarn install", { cwd: projectDir, stdio: "inherit" })
        // execSync("yarn install", { cwd: path.join(projectDir, "app"), stdio: "inherit" })
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
      isInstallDepsBefore: true,
      projectDirCreated: projectDir =>
        Promise.all([
          modifyPackageJson(projectDir, data => packageConfig(data, yarnVersion), false),
          modifyPackageJson(path.join(projectDir, "packages", "test-app"), data => packageConfig(data, yarnVersion), false),
        ]),
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
      isInstallDepsBefore: true,
      projectDirCreated: projectDir =>
        Promise.all([
          modifyPackageJson(projectDir, data => packageConfig(data, yarnBerryVersion), false),
          // modifyPackageJson(
          //   path.join(projectDir, "packages", "test-app"),
          //   data => {
          //     data.packageManager = yarnBerryVersion
          //   },
          //   false
          // ),
          // fs.writeFile(path.join(projectDir, ".yarnrc.yml"), "nodeLinker: node-modules\n"),
        ]),
    }
  ))
// yarn multi-package workspace
test("yarn multi-package workspace", ({ expect }) =>
  assertPack(
    expect,
    "test-app-yarn-several-workspace",
    {
      targets: linuxDirTarget,
    },
    {
      isInstallDepsBefore: true,
      projectDirCreated: projectDir =>
        Promise.all([
          modifyPackageJson(projectDir, data => packageConfig(data, yarnVersion), false),
          // modifyPackageJson(
          //   path.join(projectDir, "packages", "test-app"),
          //   data => {
          //     data.packageManager = "yarn@1.22.19"
          //   },
          //   false
          // ),
        ]),
    }
  ))
// yarn berry multi-package workspace
test("yarn berry multi-package workspace", ({ expect }) =>
  assertPack(
    expect,
    "test-app-yarn-several-workspace",
    {
      targets: linuxDirTarget,
    },
    {
      isInstallDepsBefore: true,
      projectDirCreated: projectDir =>
        Promise.all([
          modifyPackageJson(projectDir, data => packageConfig(data, yarnBerryVersion), false),
          // modifyPackageJson(
          //   path.join(projectDir, "packages", "test-app"),
          //   data => {
          //     data.packageManager = yarnBerryVersion
          //   },
          //   false
          // ),
          // fs.writeFile(path.join(projectDir, ".yarnrc.yml"), "nodeLinker: node-modules\n"),
        ]),
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
      isInstallDepsBefore: true,
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
      isInstallDepsBefore: true,
      projectDirCreated: projectDir => modifyPackageJson(projectDir, data => packageConfig(data, "npm@9.8.1"), false),
    }
  ))
