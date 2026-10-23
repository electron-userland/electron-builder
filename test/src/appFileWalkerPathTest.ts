import * as path from "path"
import { isOutsidePath } from "app-builder-lib/src/util/AppFileWalker"

test("distinguishes parent traversal from dot-prefixed child names", ({ expect }) => {
  expect(isOutsidePath("../outside")).toBe(true)
  expect(isOutsidePath("..cache/module")).toBe(false)
})

test("treats a backslash after .. as a separator only on Windows", ({ expect }) => {
  // on POSIX a backslash is an ordinary filename character, so this names an entry inside the directory
  expect(isOutsidePath("..\\outside")).toBe(path.sep === "\\")
  expect(isOutsidePath("..cache\\module")).toBe(false)
})
