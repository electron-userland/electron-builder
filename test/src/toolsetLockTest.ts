import { LOCK_WAIT_MS, withLock, withSigntoolLock } from "app-builder-lib/src/util/toolsetLock"
import * as fs from "fs/promises"
import * as path from "path"
import { type Mock, vi } from "vitest"

type LockFunction = (file: string, options?: object) => Promise<() => Promise<void>>

// proper-lockfile as toolsetLock.ts imports it (app-builder-lib's own dependency, so it is reached by path), with `lock` a spy that calls
// the real one unless a test says otherwise
const properLockfile = vi.hoisted(() => ({ lock: null as Mock<LockFunction> | null }))
vi.mock("../../packages/app-builder-lib/node_modules/proper-lockfile", async importOriginal => {
  const actual: any = await importOriginal()
  const lock = vi.fn<LockFunction>(actual.lock)
  properLockfile.lock = lock
  return { ...actual, default: { ...actual.default, lock }, lock }
})

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
  // bounded, so a lock that a live but stuck holder never releases fails the build instead of hanging it
  expect(LOCK_WAIT_MS).toBe(60 * 60 * 1000)
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
  // retried 1s, 2s and 4s apart: the holder releases during the third wait
  const waiter = withLock(
    lockFile,
    async () => {
      events.push("waiter start")
      return "acquired"
    },
    20_000
  )
  await expect(waiter).resolves.toBe("acquired")
  await holder
  expect(events).toEqual(["holder start", "holder end", "waiter start"])
  expect(Date.now() - start).toBeGreaterThanOrEqual(3000)
})

test("a waiter whose wait runs out fails with an error naming the lock", { timeout: 30_000 }, async ({ expect, tmpDir }) => {
  const lockFile = await lockFileIn(await tmpDir.getTempDir({ prefix: "toolset-lock" }))
  const holder = withLock(lockFile, () => sleep(5000))
  await sleep(100)
  const waiterRan = vi.fn()
  const error = await withLock(lockFile, async () => waiterRan(), 1000).catch((e: Error) => e)
  expect(error).toBeInstanceOf(Error)
  expect((error as Error).message).toMatch(/^Timed out after \d+s waiting for the cross-process lock /)
  expect((error as Error).message).toContain(lockFile)
  expect(error).toMatchObject({ code: "ELOCKED", cause: { code: "ELOCKED" } })
  expect(waiterRan).not.toHaveBeenCalled()
  await holder
})

// Not on Windows: the temp folder plus a 251-character name can pass MAX_PATH (260), so writing the lock file itself could fail instead
// of the lock attempt this test is about.
test.ifNotWindows(
  "a lock that cannot be created fails with its own error after a few retries, without the long wait for a held lock",
  { timeout: 60_000 },
  async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "toolset-lock" })
    await fs.mkdir(dir, { recursive: true })
    // a name of 251 characters can be written, but proper-lockfile's lock directory (the name plus ".lock") exceeds the 255 a file name may
    // have, so creating it fails with an error other than ELOCKED on every attempt, as a full disk or a read-only temp folder would
    const lockFile = path.join(dir, "l".repeat(251))
    const task = vi.fn(async () => "acquired")
    const start = Date.now()
    // the production wait: proper-lockfile on its own would retry this error for the whole of it; it is retried 5 times (about 17s)
    const error = await withLock(lockFile, task).catch((e: NodeJS.ErrnoException) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as NodeJS.ErrnoException).code).not.toBe("ELOCKED")
    expect(Date.now() - start).toBeLessThan(30_000)
    // the error came from the lock attempt: the lock file itself was written, and the task never ran
    await expect(fs.stat(lockFile)).resolves.toBeTruthy()
    expect(task).not.toHaveBeenCalled()
  }
)

test("a short-lived error other than ELOCKED is retried, and the lock then taken", { timeout: 30_000 }, async ({ expect, tmpDir }) => {
  const dir = await tmpDir.getTempDir({ prefix: "toolset-lock" })
  await fs.mkdir(dir, { recursive: true })
  const lockFile = path.join(dir, "toolset.lock")
  // what a Windows lock directory that another process is still removing gives mkdir or stat for a moment
  const deletePending = () => Promise.reject(Object.assign(new Error("EPERM: operation not permitted, mkdir"), { code: "EPERM" }))
  const lock = properLockfile.lock
  if (lock == null) {
    throw new Error("proper-lockfile was not mocked")
  }
  lock.mockClear()
  lock.mockImplementationOnce(deletePending).mockImplementationOnce(deletePending)
  await expect(withLock(lockFile, async () => "acquired")).resolves.toBe("acquired")
  // twice EPERM, then the real lock
  expect(lock).toHaveBeenCalledTimes(3)
})
