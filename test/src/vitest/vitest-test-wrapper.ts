import { Awaitable, TaskCustomOptions, TestContext } from "vitest"
import { createTaskCollector, getCurrentSuite } from "vitest/suite"
import { CustomTestMatcher } from "./vitest"
import { isSupposedToRetry } from "./vitest-utils"

export const test = createTaskCollector(function (this: TaskCustomOptions, name: string, ...args: any[]) {
  // it's a vitest test configuration: retry, timeout, etc.
  const options = typeof args[0] === "object" ? args[0] : {}
  // if no test configuration, test function is in args[0]. WHY IS VITEST SO INCONSISTENT?
  const runTest: (context: TestContext) => Awaitable<void> = typeof args[0] === "function" ? args[0] : args[1]

  const wrapped = async (context: TestContext) => {
    try {
      await runTest(context)
    } catch (error: any) {
      if (!isSupposedToRetry(error.message ?? error)) {
        throw error
      }
      console.log(`retrying unit test due to flaky error:\n${error.message ?? error}`)
      await new Promise(resolve => setTimeout(resolve, 10000))
      await runTest(context)
    }
  }

  return getCurrentSuite().task(name, {
    ...this, // so "todo"/"skip"/... are tracked correctly
    ...options,
    // repeats: options.repeats ?? 3,
    handler: wrapped,
  })
}) as CustomTestMatcher

export { afterAll, beforeAll, describe, vitest } from "vitest"
export { test as it }

