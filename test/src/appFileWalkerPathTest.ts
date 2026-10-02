import { isOutsidePath } from "app-builder-lib/src/util/AppFileWalker"

test("distinguishes parent traversal from dot-prefixed child names", ({ expect }) => {
  expect(isOutsidePath("../outside")).toBe(true)
  expect(isOutsidePath("..cache/module")).toBe(false)
})
