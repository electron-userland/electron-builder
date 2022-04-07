import * as chalk from "chalk"

export function printErrorAndExit(error: Error) {
  console.error(chalk.red((error.stack || error).toString()))
  process.exit(1)
}

// you don't need to handle error in your task - it is passed only indicate status of promise
export async function executeFinally<T>(promise: Promise<T>, task: (isErrorOccurred: boolean) => Promise<any>): Promise<T> {
  let result: T | null = null
  try {
    result = await promise
  } catch (originalError) {
    try {
      await task(true)
    } catch (taskError) {
      throw new NestedError([originalError, taskError])
    }

    throw originalError
  }

  await task(false)
  return result
}

export class NestedError extends Error {
  constructor(errors: Array<Error>, message = "Compound error: ") {
    let m = message
    let i = 1
    for (const error of errors) {
      const prefix = `Error #${i++} `
      m += `\n\n${prefix}${"-".repeat(80)}\n${error.stack}`
    }
    super(m)
  }
}

export function orNullIfFileNotExist<T>(promise: Promise<T>): Promise<T | null> {
  return orIfFileNotExist(promise, null)
}

export function orIfFileNotExist<T>(promise: Promise<T>, fallbackValue: T): Promise<T> {
  return promise.catch(e => {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") {
      return fallbackValue
    }
    throw e
  })
}
