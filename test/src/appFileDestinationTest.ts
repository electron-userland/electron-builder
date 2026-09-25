import * as path from "path"
import { getDestinationPath } from "app-builder-lib/src/util/appFileCopier"

const fileSet = {
  src: path.resolve("source"),
  destination: path.resolve("output"),
} as any

test("maps descendants below the destination", ({ expect }) => {
  expect(getDestinationPath(path.join(fileSet.src, "nested", "app.js"), fileSet)).toBe(path.join(fileSet.destination, "nested", "app.js"))
})

test("does not map sibling paths that share the source prefix", ({ expect }) => {
  expect(getDestinationPath(path.join(fileSet.src + "-outside", "app.js"), fileSet)).toBe(fileSet.destination)
})
