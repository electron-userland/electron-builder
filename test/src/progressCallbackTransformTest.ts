import { CancellationToken, ProgressCallbackTransform, ProgressInfo } from "builder-util-runtime"
import { afterEach, expect, test, vi } from "vitest"

afterEach(() => {
  vi.useRealTimers()
})

test("reports a finite rate when a download completes immediately", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const progress: ProgressInfo[] = []
  const transform = new ProgressCallbackTransform(3, new CancellationToken(), info => progress.push(info))
  transform.resume()
  transform.write(Buffer.alloc(3))

  await new Promise<void>((resolve, reject) => {
    transform.once("error", reject)
    transform.once("finish", resolve)
    transform.end()
  })

  expect(progress).toHaveLength(1)
  expect(progress[0]).toMatchObject({ total: 3, delta: 3, transferred: 3, percent: 100 })
  expect(Number.isFinite(progress[0].bytesPerSecond)).toBe(true)
})
