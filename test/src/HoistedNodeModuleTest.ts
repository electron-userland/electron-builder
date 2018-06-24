import { readAsar } from "electron-builder-lib/out/asar/asar"
import { assertPack, linuxDirTarget } from "./helpers/packTester"
import { Platform } from "electron-builder"
import * as path from "path"

test.ifAll("yarn workspace", () => assertPack("test-app-yarn-workspace", {
  targets: linuxDirTarget,
  projectDir: "packages/test-app"
}, {
  packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
}))

test.ifAll("conflict versions", () => assertPack("test-app-yarn-workspace-version-conflict", {
  targets: linuxDirTarget,
  projectDir: "packages/test-app"
}, {
  packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
}))

test.ifAll("yarn several workspaces", () => assertPack("test-app-yarn-several-workspace", {
  targets: linuxDirTarget,
  projectDir: "packages/test-app"
}, {
  packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
}))

async function verifyAsarFileTree(resourceDir: string) {
  const fs = await readAsar(path.join(resourceDir, "app.asar"))
  console.log(resourceDir + " " + JSON.stringify(fs.header, null, 2))
  expect(fs.header).toMatchSnapshot()
}