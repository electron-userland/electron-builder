import { readAsar } from "electron-builder/out/asar/asar"
import { assertPack, linuxDirTarget } from "./helpers/packTester"
import { Platform } from "electron-builder"
import * as path from "path"

test.ifAll("yarn workspace", () => assertPack("test-app-yarn-workspace", {
  targets: linuxDirTarget,
  projectDir: "packages/test-app"
}, {
  packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
}))

test("yarn several workspaces", () => assertPack("test-app-yarn-several-workspace", {
  targets: linuxDirTarget,
  projectDir: "packages/test-app"
}, {
  packed: context => verifyAsarFileTree(context.getResources(Platform.LINUX)),
}))

async function verifyAsarFileTree(resourceDir: string) {
  const fs = await readAsar(path.join(resourceDir, "app.asar"))
  expect(fs.header).toMatchSnapshot()
}