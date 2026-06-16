import { withSigntoolLock } from "app-builder-lib/src/util/toolsetLock"

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
