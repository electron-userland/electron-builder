import { getCurrentSuite, setFn } from 'vitest/suite'

export { describe, beforeAll, afterAll } from 'vitest'

// this function will be called, when Vitest collects tasks
export const myCustomTask = function (name: string, fn: () => void) {) {
  const task = getCurrentSuite().task(name)
  const meta: any = {
    customPropertyToDifferentiateTask: true
  }
  task.meta = meta
  setFn(task, fn || (() => {}))
}