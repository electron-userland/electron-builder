import { CancellationError, CancellationToken, retry } from "builder-util-runtime"
import { afterEach, expect, test, vi } from "vitest"

afterEach(() => {
  vi.useRealTimers()
})

test("cancels a retry during backoff without starting another attempt", async () => {
  vi.useFakeTimers()
  const cancellationToken = new CancellationToken()
  const task = vi.fn().mockRejectedValue(new Error("temporary failure"))
  const result = retry(task, { retries: 3, interval: 1000, cancellationToken })

  await vi.advanceTimersByTimeAsync(0)
  expect(task).toHaveBeenCalledOnce()
  cancellationToken.cancel()

  await expect(result).rejects.toBeInstanceOf(CancellationError)
  expect(task).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
