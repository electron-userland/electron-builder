import { TaskCustomOptions, TestContext } from "vitest"
import { createTaskCollector, getCurrentSuite } from "vitest/suite"
import { CustomTestMatcher } from "./vitest"

// Handle electron-builder flaky (due to parallel file operations such as hdiutil and EPERM file locks) tests by retrying
// This is a workaround until we can find a better solution. For now, just slot in a 500ms delay and retry once.
const isSupposedToRetry = (errorMessage: string, alreadyRetried: boolean) => {
  try {
    const isOsError =
      /Command failed: hdiutil/.test(errorMessage) ||
      /ERR_ELECTRON_BUILDER_CANNOT_EXECUTE/.test(errorMessage) ||
      /EPERM: operation not permitted/.test(errorMessage) ||
      /yarn-tarball.tgz/.test(errorMessage) ||
      /Error: yarn process failed/.test(errorMessage)
    return isOsError && !alreadyRetried
  } catch {
    /* empty */
  }
  return false
}

export const test = createTaskCollector(function (this: TaskCustomOptions, name, runTest, options) {
  const suite = getCurrentSuite()

  let alreadyRetried = false
  const wrapped = async (context: TestContext) => {
    await Promise.resolve(runTest(context)).catch(error => {
      alreadyRetried = isSupposedToRetry(error.message ?? error, alreadyRetried)
      if (alreadyRetried) {
        return new Promise(resolve => setTimeout(resolve, 100)).then(() => wrapped(context))
      }
      throw error
    })
  }

  suite.task(name, {
    ...this, // so "todo"/"skip"/... is tracked correctly
    handler: wrapped,
    ...options,
  })
}) as CustomTestMatcher

export { afterAll, beforeAll, describe, vitest } from "vitest"
