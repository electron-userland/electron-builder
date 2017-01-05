import BluebirdPromise from "bluebird-lst-c"
import { red } from "chalk"

export function printErrorAndExit(error: Error) {
  console.error(red((error.stack || error).toString()))
  process.exit(-1)
}

// you don't need to handle error in your task - it is passed only indicate status of promise
export async function executeFinally<T>(promise: Promise<T>, task: (errorOccurred: boolean) => Promise<any>): Promise<T> {
  let result: T | null = null
  try {
    result = await promise
  }
  catch (originalError) {
    try {
      await task(true)
    }
    catch (taskError) {
      throw new NestedError([originalError, taskError])
    }

    throw originalError
  }

  try {
    await task(false)
  }
  catch (taskError) {
    throw taskError
  }
  return result
}

export class NestedError extends Error {
  constructor(errors: Array<Error>, message: string = "Compound error: ") {
    let m = message
    let i = 1
    for (const error of errors) {
      const prefix = "Error #" + i++ + " "
      m += "\n\n" + prefix + "-".repeat(80) + "\n" + error!.stack
    }
    super(m)
  }
}

export function all(promises: Array<Promise<any>>): BluebirdPromise<any> {
  const errors: Array<Error> = []
  return BluebirdPromise.all(promises.map(it => it.catch(it => errors.push(it))))
    .then(() => {
      if (errors.length === 1) {
        throw errors[0]
      }
      else if (errors.length > 1) {
        throw new NestedError(errors, "Cannot cleanup: ")
      }
    })
}