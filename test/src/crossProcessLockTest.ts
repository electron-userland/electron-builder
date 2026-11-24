import { randomBytes } from "crypto"
import * as fs from "fs/promises"
import * as path from "path"
import { describe, expect, test } from "vitest"
import { CrossProcessFileLock } from "../vitest-scripts/vitest-config/cross-process-file-lock"
import { crossProcessLockPath, withCrossProcessLock } from "./helpers/crossProcessLock"

const lockName = () => `test-${randomBytes(6).toString("hex")}`

async function makeOld(file: string, ageMs: number) {
  const then = new Date(Date.now() - ageMs)
  await fs.utimes(file, then, then)
}

describe("withCrossProcessLock", () => {
  test("holders of the same lock take turns", async () => {
    const name = lockName()
    const events: string[] = []
    const hold = (id: string) =>
      withCrossProcessLock(name, async () => {
        events.push(`${id} start`)
        await new Promise(resolve => setTimeout(resolve, 300))
        events.push(`${id} end`)
      })
    await Promise.all([hold("a"), hold("b")])
    // either may get the lock first, but the other starts only after it ends
    const first = events[0].split(" ")[0]
    const second = first === "a" ? "b" : "a"
    expect(events).toEqual([`${first} start`, `${first} end`, `${second} start`, `${second} end`])
  })

  test("the lock is released when the task throws", async () => {
    const name = lockName()
    await expect(withCrossProcessLock(name, () => Promise.reject(new Error("boom")))).rejects.toThrow("boom")
    await expect(fs.access(crossProcessLockPath(name))).rejects.toThrow()
    await expect(withCrossProcessLock(name, () => Promise.resolve("again"))).resolves.toBe("again")
  })

  test("a lock left over by a crashed worker is taken over", async () => {
    const name = lockName()
    const lockPath = crossProcessLockPath(name)
    await fs.mkdir(lockPath)
    const longAgo = new Date(Date.now() - 60 * 60 * 1000)
    await fs.utimes(lockPath, longAgo, longAgo)
    await expect(withCrossProcessLock(name, () => Promise.resolve("taken over"))).resolves.toBe("taken over")
  })
})

describe("CrossProcessFileLock (heavy-test mutex)", () => {
  test("only the holder removes the lock, so another worker's release cannot free it", async ({ tmpDir }) => {
    const file = path.join(await tmpDir.createTempDir({ prefix: "heavy-lock" }), "heavy.lock")
    const holder = new CrossProcessFileLock(file)
    const other = new CrossProcessFileLock(file)
    expect(holder.tryAcquire()).toBe(true)
    expect(other.tryAcquire()).toBe(false)

    // what a worker exiting after a short file does
    other.release()
    expect(holder.isHeld()).toBe(true)
    expect(other.tryAcquire()).toBe(false)

    holder.release()
    expect(other.tryAcquire()).toBe(true)
    other.release()
  })

  test("a lock its holder stopped touching is taken over", async ({ tmpDir }) => {
    const file = path.join(await tmpDir.createTempDir({ prefix: "heavy-lock" }), "heavy.lock")
    const crashed = new CrossProcessFileLock(file, 60_000)
    expect(crashed.tryAcquire()).toBe(true)
    // a crash ends the heartbeat thread with the process, and nothing releases the lock
    await (crashed as any).heartbeat.terminate()
    await makeOld(file, 2 * 60_000)

    const next = new CrossProcessFileLock(file, 60_000)
    expect(next.tryAcquire()).toBe(true)
    expect(crashed.isHeld()).toBe(false)
    next.release()
  })

  test("a holder whose thread is blocked in a long synchronous step keeps its lock", async ({ tmpDir }) => {
    const file = path.join(await tmpDir.createTempDir({ prefix: "heavy-lock" }), "heavy.lock")
    const holder = new CrossProcessFileLock(file, 1000, 100)
    expect(holder.tryAcquire()).toBe(true)
    // like execFileSync of an installer: this thread runs nothing for longer than the stale window
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2500)

    const other = new CrossProcessFileLock(file, 1000, 100)
    expect(other.tryAcquire()).toBe(false)
    expect(holder.isHeld()).toBe(true)
    holder.release()
  })

  test("only one waiter takes over a stale lock: one that finds the takeover guard taken leaves the lock alone", async ({ tmpDir }) => {
    const file = path.join(await tmpDir.createTempDir({ prefix: "heavy-lock" }), "heavy.lock")
    await fs.writeFile(file, "crashed-owner")
    await makeOld(file, 2 * 60_000)
    // another waiter is in the middle of its takeover
    await fs.writeFile(`${file}.takeover`, "")

    const waiter = new CrossProcessFileLock(file, 60_000)
    expect(waiter.tryAcquire()).toBe(false)
    expect(await fs.readFile(file, "utf8")).toBe("crashed-owner")

    // a guard left by a waiter that crashed mid-takeover goes stale too
    await makeOld(`${file}.takeover`, 60_000)
    expect(waiter.tryAcquire()).toBe(true)
    expect(waiter.isHeld()).toBe(true)
    waiter.release()
  })
})
