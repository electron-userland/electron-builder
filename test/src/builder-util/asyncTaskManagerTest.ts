import { CancellationToken } from "builder-util-runtime"
import { AsyncTaskManager } from "builder-util"
import { vi } from "vitest"

test("cancels the original cancellable promise", ({ expect }) => {
  const manager = new AsyncTaskManager(new CancellationToken())
  const task = new Promise(() => {}) as Promise<void> & { cancel: () => void }
  task.cancel = vi.fn()

  manager.addTask(task)
  manager.cancelTasks()

  expect(task.cancel).toHaveBeenCalledOnce()
})
