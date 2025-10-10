import * as path from "path"
import { app, assertPack, linuxDirTarget, modifyPackageJson } from "./helpers/packTester"
import { ELECTRON_VERSION } from "./helpers/testConfig"

const yarnVersion = "yarn@1.22.19"
const yarnBerryVersion = "yarn@3.5.1"

const packageConfig = (data: any, version: string) => {
  data.packageManager = version
  data.name = "@packageManager/app"
  data.version = "1.0.0"
  // data.dependencies = {
  //   "debug": "^4.3.4",
  // }
  data.devDependencies = {
    electron: ELECTRON_VERSION,
  }
  data.optionalDependencies = {}
  return data
}

describe("package.json => packageManager", { sequential: true }, () => {
  // Test for yarn package manager
  describe("yarn", () => {
    test("yarn", ({ expect }) =>
      assertPack(
        expect,
        "test-app-yarn-hoisted",
        {
          targets: linuxDirTarget,
        },
        {
          projectDirCreated: projectDir => modifyPackageJson(projectDir, data => packageConfig(data, yarnVersion), false),
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
          projectDirCreated: projectDir =>
            Promise.all([
              modifyPackageJson(projectDir, data => packageConfig(data, yarnBerryVersion), false),
              // fs.writeFile(path.join(projectDir, ".yarnrc.yml"), "nodeLinker: node-modules\n"),
            ]),
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
  })

  // Test for pnpm package manager
  test("pnpm", ({ expect }) =>
    app(
      expect,
      {
        targets: linuxDirTarget,
      },
      {
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
        projectDirCreated: projectDir => modifyPackageJson(projectDir, data => packageConfig(data, "npm@22.12.0"), false),
      }
    ))
})
