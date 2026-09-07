import { DebugLogger } from "builder-util"

test("preserves repeated nested key segments", ({ expect }) => {
  const logger = new DebugLogger()

  logger.add("build.build.result", "success")

  expect(logger.data.get("build")?.get("build")?.get("result")).toBe("success")
})
