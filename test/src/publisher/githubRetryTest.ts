import { CancellationError, CancellationToken } from "builder-util-runtime"
import { cancellableDelay } from "electron-publish/src/gitHubPublisher"
import { vi } from "vitest"

test("cancels an upload retry delay immediately", async ({ expect }) => {
  vi.useFakeTimers()
  const token = new CancellationToken()
  const delay = cancellableDelay(10_000, token)

  token.cancel()

  await expect(delay).rejects.toBeInstanceOf(CancellationError)
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
})
