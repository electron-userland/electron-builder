import { LOCK_WAIT_RETRIES, withLock, withSigntoolLock } from "app-builder-lib/src/util/toolsetLock"
import * as fs from "fs/promises"
import * as path from "path"
import { vi } from "vitest"

// signtool is not safe to run concurrently (it races on the per-user crypto store), so withSigntoolLock
// must serialize overlapping invocations across the process. Verify two concurrent holders never interleave.
test("withSigntoolLock serializes concurrent invocations", async ({ expect }) => {
  const events: string[] = []
  const makeTask = (id: string) => async () => {
    events.push(`start-${id}`)
    await new Promise(resolve => setTimeout(resolve, 30))
    events.push(`end-${id}`)
    return id
  }

  const results = await Promise.all([withSigntoolLock(makeTask("a")), withSigntoolLock(makeTask("b"))])
  expect(results.sort()).toEqual(["a", "b"])

  // Serialized execution => events are paired (start-X immediately followed by end-X), never interleaved
  // (e.g. start-a, start-b, end-a, end-b would mean both held the lock at once).
  expect(events).toHaveLength(4)
  for (let i = 0; i < events.length; i += 2) {
    const id = events[i].replace("start-", "")
    expect(events[i]).toBe(`start-${id}`)
    expect(events[i + 1]).toBe(`end-${id}`)
  }
})

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** A lock file in a fresh folder of the test's own (`getTempDir` only reserves the path). */
async function lockFileIn(dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true })
  return path.join(dir, "toolset.lock")
}

test("the default wait covers an hour of a live holder's turns, not the former ~8 minutes", ({ expect }) => {
  // proper-lockfile's retry schedule (retry 0.12): minTimeout * 2^attempt, capped at maxTimeout
  let waitedMs = 0
  for (let attempt = 0; attempt < LOCK_WAIT_RETRIES; attempt++) {
    waitedMs += Math.min(1000 * 2 ** attempt, 5000)
  }
  expect(waitedMs).toBeGreaterThanOrEqual(60 * 60 * 1000)
  // and bounded, so a lock that a live but stuck holder never releases fails the build instead of hanging it
  expect(waitedMs).toBeLessThan(61 * 60 * 1000)
})

test("a waiter retries while a live holder keeps the lock, and takes it once released", { timeout: 30_000 }, async ({ expect, tmpDir }) => {
  const lockFile = await lockFileIn(await tmpDir.getTempDir({ prefix: "toolset-lock" }))
  const events: Array<string> = []
  const holder = withLock(lockFile, async () => {
    events.push("holder start")
    await sleep(3500)
    events.push("holder end")
  })
  await sleep(100)
  const start = Date.now()
  // 1s, 2s, 4s and 5s apart: the holder releases during the third wait
  const waiter = withLock(
    lockFile,
    async () => {
      events.push("waiter start")
      return "acquired"
    },
    4
  )
  await expect(waiter).resolves.toBe("acquired")
  await holder
  expect(events).toEqual(["holder start", "holder end", "waiter start"])
  expect(Date.now() - start).toBeGreaterThanOrEqual(3000)
})

test("a waiter that runs out of retries fails with an error naming the lock", { timeout: 30_000 }, async ({ expect, tmpDir }) => {
  const lockFile = await lockFileIn(await tmpDir.getTempDir({ prefix: "toolset-lock" }))
  const holder = withLock(lockFile, () => sleep(5000))
  await sleep(100)
  const waiterRan = vi.fn()
  const error = await withLock(lockFile, async () => waiterRan(), 1).catch((e: Error) => e)
  expect(error).toBeInstanceOf(Error)
  expect((error as Error).message).toMatch(/^Timed out after \d+s waiting for the cross-process lock /)
  expect((error as Error).message).toContain(lockFile)
  expect(error).toMatchObject({ code: "ELOCKED", cause: { code: "ELOCKED" } })
  expect(waiterRan).not.toHaveBeenCalled()
  await holder
})
