import { executeAndDetach } from "dmg-builder"
import { vi } from "vitest"

test("detaches an image when its volume path cannot be parsed", async ({ expect }) => {
  const task = vi.fn()
  const detacher = vi.fn().mockResolvedValue(undefined)

  await expect(executeAndDetach("/dev/disk9\tApple_APFS", "/dev/disk9", true, task, detacher)).rejects.toThrow("Cannot find volume mount path for device: /dev/disk9")
  expect(task).not.toHaveBeenCalled()
  expect(detacher).toHaveBeenCalledOnce()
  expect(detacher).toHaveBeenCalledWith("/dev/disk9", true)
})
