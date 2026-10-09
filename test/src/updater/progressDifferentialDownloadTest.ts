import { CancellationToken } from "builder-util-runtime"
import { ProgressDifferentialDownloadCallbackTransform, ProgressInfo } from "electron-updater/src/differentialDownloader/ProgressDifferentialDownloadCallbackTransform"
import { afterEach, expect, test, vi } from "vitest"

afterEach(() => {
  vi.useRealTimers()
})

test("reports per-event deltas and a finite rate for immediate range downloads", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const progress: ProgressInfo[] = []
  const transform = new ProgressDifferentialDownloadCallbackTransform({ expectedByteCounts: [3, 2], grandTotal: 5 }, new CancellationToken(), info => progress.push(info))
  transform.resume()

  transform.beginRangeDownload()
  transform.write(Buffer.alloc(3))
  transform.endRangeDownload()

  transform.beginRangeDownload()
  transform.write(Buffer.alloc(2))
  transform.endRangeDownload()
  await new Promise<void>((resolve, reject) => {
    transform.once("error", reject)
    transform.once("finish", resolve)
    transform.end()
  })

  expect(progress.map(info => info.delta)).toEqual([3, 2])
  expect(progress.every(info => Number.isFinite(info.bytesPerSecond))).toBe(true)
})
