import { Promise as BluebirdPromise } from "bluebird"
import { tsAwaiter } from "./awaiter"

const __awaiter = tsAwaiter
Array.isArray(__awaiter)

export function printErrorAndExit(error: Error) {
  console.error(error.stack || error.message || error)
  process.exit(-1)
}

// you don't need to handle error in your task - it is passed only indicate status of promise
export async function executeFinally(promise: Promise<any>, task: (error?: Error) => Promise<any>): Promise<any> {
  let result: any = null
  try {
    result = await promise
  }
  catch (originalError) {
    try {
      await task(originalError)
    }
    catch (taskError) {
      throw new NestedError([originalError, taskError])
    }

    throw originalError
  }

  try {
    await task(null)
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
    for (let error of errors) {
      const prefix = "Error #" + i++ + " "
      m += "\n\n" + prefix + "-".repeat(80) + "\n" + error.stack
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