import { Awaitable, TaskCustomOptions, TestContext } from "vitest"
import { createChainable, createTaskCollector, getCurrentSuite, setFn } from "vitest/suite"
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

export const test = createTaskCollector(function (this: TaskCustomOptions, name: string, runTest: (context: TestContext) => Awaitable<void>, options) {
  const suite = getCurrentSuite()

  let alreadyRetried = false
  const wrapped = async (context: TestContext) => {
    await Promise.resolve(runTest(context)).catch(error => {
      console.error(`Error in test "${suite.name ? suite.name + "  -  " : ""}${name}"`)
      console.error(JSON.stringify(error))
      console.error(JSON.stringify({ this: this, name, options, runTest }))
      alreadyRetried = isSupposedToRetry(error.message ?? error, alreadyRetried)
      if (alreadyRetried) {
        console.error(`retrying unit test due to flaky error:\n${error.message ?? error}`)
        return new Promise(resolve => setTimeout(resolve, 500)).then(() => runTest(context))
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

// const customTestMatchers = [
//   "ifEnv",
//   "ifMac",
//   "ifNotWindows",
//   "ifNotMac",
//   "ifNotCiMac",
//   "ifWindows",
//   "ifLinux",
//   "ifCi",
//   "ifNotCi",
//   "ifNotCiWin",
//   "ifDevOrWinCi",
//   "ifDevOrLinuxCi",
//   "ifWinCi",
//   "ifLinuxOrDevMac",
// ]

// const testMatchers = ["concurrent", "sequential", "skip", "only", "todo", "fails", "runIf"]

// export const test = createChainable(
//   [
//     "concurrent",
//     "sequential",
//     "skip",
//     "only",
//     "todo",
//     "fails",
//     "runIF",
//     "ifEnv",
//     "ifMac",
//     "ifNotWindows",
//     "ifNotMac",
//     "ifNotCiMac",
//     "ifWindows",
//     "ifLinux",
//     "ifCi",
//     "ifNotCi",
//     "ifNotCiWin",
//     "ifDevOrWinCi",
//     "ifDevOrLinuxCi",
//     "ifWinCi",
//     "ifLinuxOrDevMac",
//   ],
//   function (name: string, runTest: (context: TestContext) => void | Promise<void>) {
//     const suite = getCurrentSuite()

//     const task = suite.task(name)
//     const test = suite.test

//     let alreadyRetried = false
//     const wrapped = async (context: TestContext) => {
//       await Promise.resolve(runTest(context)).catch(error => {
//         alreadyRetried = isSupposedToRetry(error.message ?? error, alreadyRetried)
//         if (alreadyRetried) {
//           console.warn(`Retrying test "${suite.name ? suite.name + "  -  " : ""}${name}" due to flaky error:\n\n${error.message ?? error}`)
//           return new Promise(resolve => setTimeout(resolve, 500)).then(() => runTest(context))
//         }
//         throw error
//       })
//     }
//     setFn(task, () => wrapped(task.context))
//   }
// )

export { test as it }
export { afterAll, beforeAll, describe, vitest } from "vitest"
