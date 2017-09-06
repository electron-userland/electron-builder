import BluebirdPromise from "bluebird-lst"
import { CancellationToken } from "builder-util-runtime"
import { NestedError } from "./promise"
import { debug } from "./util"

export class AsyncTaskManager {
  readonly tasks: Array<Promise<any>> = []
  private readonly errors: Array<Error> = []

  constructor(private readonly cancellationToken: CancellationToken) {
  }

  add(task: () => Promise<any>) {
    if (this.cancellationToken == null || !this.cancellationToken.cancelled) {
      this.addTask(task())
    }
  }

  addTask(promise: Promise<any>) {
    if (this.cancellationToken.cancelled) {
      debug(`Async task not added because cancelled: ${new Error().stack}`)
      if ("cancel" in promise) {
        (promise as any).cancel()
      }
      return
    }

    this.tasks.push(promise
      .catch(it => {
        debug(`Async task error: ${it.stack || it}`)
        this.errors.push(it)
        return BluebirdPromise.resolve(null)
      }))
  }

  cancelTasks() {
    for (const task of this.tasks) {
      if ("cancel" in task) {
        (task as any).cancel()
      }
    }
    this.tasks.length = 0
  }

  async awaitTasks(): Promise<Array<any>> {
    if (this.cancellationToken.cancelled) {
      this.cancelTasks()
      return []
    }

    const checkErrors = () => {
      if (this.errors.length > 0) {
        this.cancelTasks()
        throwError(this.errors)
        return
      }
    }

    checkErrors()

    let result: Array<any> | null = null
    const tasks = this.tasks
    let list = tasks.slice()
    tasks.length = 0
    while (list.length > 0) {
      const subResult = await BluebirdPromise.all(list)
      result = result == null ? subResult : result.concat(subResult)
      checkErrors()
      if (tasks.length === 0) {
        break
      }
      else {
        if (this.cancellationToken.cancelled) {
          this.cancelTasks()
          return []
        }

        list = tasks.slice()
        tasks.length = 0
      }
    }
    return result || []
  }
}

function throwError(errors: Array<Error>) {
  if (errors.length === 1) {
    throw errors[0]
  }
  else if (errors.length > 1) {
    throw new NestedError(errors, "Cannot cleanup: ")
  }
}