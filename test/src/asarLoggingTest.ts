import { withElectronAsarLogging } from "../../packages/app-builder-lib/src/asar/asarUtil"

test("restores console logging when asar packaging fails", async ({ expect }) => {
  const originalLogger = console.log

  await expect(
    withElectronAsarLogging(async () => {
      throw new Error("packaging failed")
    })
  ).rejects.toThrow("packaging failed")

  expect(console.log).toBe(originalLogger)
})
