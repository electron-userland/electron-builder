import { isCI as isCi } from "ci-info"
import { createExpect, TestContext } from "vitest"
import { createChainable, createTaskCollector, getCurrentSuite, setFn } from "vitest/suite"
// import "./typings/vitest"

// type Test = (...args) => void | Promise<void>

const isWindows = process.platform === "win32"
const isMac = process.platform === "darwin"
const isLinux = process.platform === "linux"

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

const customTestMatchers = [
  // "ifEnv",
  // "runIf",
  "ifMac",
  "ifNotWindows",
  "ifNotMac",
  "ifNotCiMac",
  "ifWindows",
  "ifLinux",
  "ifCi",
  "ifNotCi",
  "ifNotCiWin",
  "ifDevOrWinCi",
  "ifDevOrLinuxCi",
  "ifWinCi",
  "ifLinuxOrDevMac",
]

const testMatchers = ["concurrent", "sequential", "skip", "only", "todo", "fails"]

export const test = createChainable([...testMatchers, ...customTestMatchers], function (name, runTest: (context: TestContext) => void | Promise<void>) {
  const suite = getCurrentSuite()
  const task = suite.task(name)
  const test: any = suite.test

  const isOnly = this.only
  // if (isOnly !== undefined && !isOnly) {
  //   setFn(task, test.skip)
  //   return
  // }

  const skip = test.skip
  test.ifEnv = test.runIf
  test.ifMac = isMac ? test : skip
  test.ifNotMac = isMac ? skip : test

  test.ifWindows = isWindows ? test : skip
  test.ifNotWindows = isWindows ? skip : test
  test.ifWinCi = isCi && isWindows ? test : skip

  test.ifCi = isCi ? test : skip
  test.ifNotCi = isCi ? skip : test
  test.ifNotCiMac = isCi && isMac ? skip : test
  test.ifNotCiWin = isCi && isWindows ? skip : test

  test.ifDevOrWinCi = !isCi || isWindows ? test : skip
  test.ifDevOrLinuxCi = !isCi || isLinux ? test : skip

  test.ifLinux = isLinux ? test : skip
  test.ifLinuxOrDevMac = isLinux || (!isCi && isMac) ? test : skip

  let alreadyRetried = false
  const wrapped = async (context: TestContext) => {
    await Promise.resolve(runTest(context)).catch(error => {
      alreadyRetried = isSupposedToRetry(error.message ?? error, alreadyRetried)
      if (alreadyRetried) {
        console.warn(`Retrying test "${suite.name ? suite.name + "  -  " : ""}${name}" due to flaky error:\n\n${error.message ?? error}`)
        return new Promise(resolve => setTimeout(resolve, 100)).then(() => wrapped(context))
      }
      throw error
    })
  }
  setFn(task, () => wrapped(task.context))
})

export { afterAll, beforeAll, describe } from "vitest"

// // this function will be called during collection phase:
// // don't call function handler here, add it to suite tasks
// // with "getCurrentSuite().task()" method
// // note: createTaskCollector provides support for "todo"/"each"/...
// export const test2 = createTaskCollector(function (name, runTest, timeout) {
//   const suite = getCurrentSuite()

//   const test: any = suite.test

//   const skip = test.skip
//   // test.ifEnv = test.runIf
//   test.ifMac = isMac ? test : skip
//   test.ifNotMac = isMac ? skip : test

//   test.ifWindows = isWindows ? test : skip
//   test.ifNotWindows = isWindows ? skip : test
//   test.ifWinCi = isCi && isWindows ? test : skip

//   test.ifCi = isCi ? test : skip
//   test.ifNotCi = isCi ? skip : test
//   test.ifNotCiMac = isCi && isMac ? skip : test
//   test.ifNotCiWin = isCi && isWindows ? skip : test

//   test.ifDevOrWinCi = !isCi || isWindows ? test : skip
//   test.ifDevOrLinuxCi = !isCi || isLinux ? test : skip

//   test.ifLinux = isLinux ? test : skip
//   test.ifLinuxOrDevMac = isLinux || (!isCi && isMac) ? test : skip

//   // createChainable([...testMatchers, ...customTestMatchers], function (this, name, runTest) {
//   //   const suite = getCurrentSuite()
//   //   const task = suite.task(name)

//   let alreadyRetried = false
//   const wrapped = async (context: TestContext) => {
//     await Promise.resolve(runTest(context)).catch(error => {
//       alreadyRetried = isSupposedToRetry(error.message ?? error, alreadyRetried)
//       if (alreadyRetried) {
//         return new Promise(resolve => setTimeout(resolve, 100)).then(() => wrapped(context))
//       }
//       throw error
//     })
//   }

//   const config = {
//     ...this, // so "todo"/"skip"/... is tracked correctly
//     ifMac: isMac ? test : skip,
//     ifNotMac: isMac ? skip : test,

//     ifWindows: isWindows ? test : skip,
//     ifNotWindows: isWindows ? skip : test,
//     ifWinCi: isCi && isWindows ? test : skip,

//     ifCi: isCi ? test : skip,
//     ifNotCi: isCi ? skip : test,
//     ifNotCiMac: isCi && isMac ? skip : test,
//     ifNotCiWin: isCi && isWindows ? skip : test,

//     ifDevOrWinCi: !isCi || isWindows ? test : skip,
//     ifDevOrLinuxCi: !isCi || isLinux ? test : skip,

//     ifLinux: isLinux ? test : skip,
//     ifLinuxOrDevMac: isLinux || (!isCi && isMac) ? test : skip,
//     meta: {
//       customPropertyToDifferentiateTask: true,
//     },
//     handler: wrapped,
//     timeout,
//   }
//   suite.task(name, config)
// })
