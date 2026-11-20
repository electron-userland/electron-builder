import { randomBytes } from "crypto"
import * as fs from "fs/promises"
import { describe, expect, test } from "vitest"
import { crossProcessLockPath, withCrossProcessLock } from "./helpers/crossProcessLock"

const lockName = () => `test-${randomBytes(6).toString("hex")}`

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
