import { DebugLogger } from "builder-util"

test("preserves repeated nested key segments", ({ expect }) => {
  const logger = new DebugLogger()

  logger.add("build.build.result", "success")

  expect(logger.data.get("build")?.get("build")?.get("result")).toBe("success")
})

test("nests a key whose final segment repeats an earlier one", ({ expect }) => {
  const logger = new DebugLogger()

  logger.add("build.result.build", "success")

  expect(logger.data.get("build")?.get("result")?.get("build")).toBe("success")
})

test("nests a two-segment key with identical segments", ({ expect }) => {
  const logger = new DebugLogger()

  logger.add("a.a", "value")

  expect(logger.data.get("a")?.get("a")).toBe("value")
})
