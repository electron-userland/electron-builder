import { getRetinaFilePath } from "dmg-builder"

test("derives retina background paths without changing extension case", ({ expect }) => {
  expect(getRetinaFilePath("background.PNG")).toBe("background@2x.PNG")
  expect(getRetinaFilePath("background")).toBeNull()
})
