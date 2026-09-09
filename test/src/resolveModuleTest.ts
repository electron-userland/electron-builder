import { resolveModule } from "app-builder-lib/src/util/resolve"
import { log } from "builder-util"
import { vi } from "vitest"

test("logs dynamic import failures before rejecting", async ({ expect }) => {
  const error = vi.spyOn(log, "error").mockImplementation(() => undefined)
  const moduleName = `electron-builder-missing-module-${Date.now()}`

  try {
    await expect(resolveModule(undefined, moduleName)).rejects.toThrow()
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ moduleName }), "Unable to dynamically `import` or `require`")
  } finally {
    error.mockRestore()
  }
})
