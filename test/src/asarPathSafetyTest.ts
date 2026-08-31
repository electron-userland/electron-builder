import * as path from "path"
import { isPathInside } from "../../packages/app-builder-lib/src/asar/asarUtil"

test("does not treat sibling paths with a shared prefix as descendants", ({ expect }) => {
  const workspace = path.resolve("workspace")

  expect(isPathInside(workspace, path.join(workspace, "app", "index.js"))).toBe(true)
  expect(isPathInside(workspace, workspace + "-outside")).toBe(false)
})
