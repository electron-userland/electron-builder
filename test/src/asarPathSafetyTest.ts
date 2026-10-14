import * as path from "path"
import * as asarUtil from "app-builder-lib/out/asar/asarUtil"

// isPathInside is @internal, so it is stripped from the emitted .d.ts that v26 tests compile against
const { isPathInside } = asarUtil as unknown as { isPathInside: (root: string, target: string) => boolean }

test("does not treat sibling paths with a shared prefix as descendants", ({ expect }) => {
  const workspace = path.resolve("workspace")

  expect(isPathInside(workspace, path.join(workspace, "app", "index.js"))).toBe(true)
  expect(isPathInside(workspace, workspace + "-outside")).toBe(false)
})
