import { withPublishSigIntHandler } from "../../packages/electron-builder/src/publish"
import { expect, vi } from "vitest"

test.each(["resolve", "reject"] as const)("removes the publish SIGINT handler after tasks %s", async outcome => {
  const handler = vi.fn()
  const operation = withPublishSigIntHandler(handler, async () => {
    expect(process.listeners("SIGINT")).toContain(handler)
    if (outcome === "reject") {
      throw new Error("failed")
    }
  })

  await operation.catch(() => undefined)
  expect(process.listeners("SIGINT")).not.toContain(handler)
})
