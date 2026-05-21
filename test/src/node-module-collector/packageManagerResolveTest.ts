import { afterEach, describe, test, vi } from "vitest"

vi.mock("which", () => ({ sync: vi.fn() }))

const originalPlatform = process.platform

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: p, configurable: true })
}

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
  vi.clearAllMocks()
})

async function freshImport() {
  vi.resetModules()
  const whichMod = await import("which")
  const { getPackageManagerCommand, PM } = await import("app-builder-lib/src/node-module-collector/packageManager")
  return { getPackageManagerCommand, PM, whichSync: vi.mocked(whichMod.sync) }
}

describe.sequential("getPackageManagerCommand", () => {
  test("non-Windows: returns pm name without calling which", async ({ expect }) => {
    setPlatform("darwin")
    const { getPackageManagerCommand, PM, whichSync } = await freshImport()
    expect(getPackageManagerCommand(PM.PNPM)).toBe("pnpm")
    expect(whichSync).not.toHaveBeenCalled()
  })

  test("non-Windows: YARN_BERRY resolves to 'yarn'", async ({ expect }) => {
    setPlatform("linux")
    const { getPackageManagerCommand, PM } = await freshImport()
    expect(getPackageManagerCommand(PM.YARN_BERRY)).toBe("yarn")
  })

  test("Windows: calls which.sync and returns full path", async ({ expect }) => {
    setPlatform("win32")
    const { getPackageManagerCommand, PM, whichSync } = await freshImport()
    whichSync.mockReturnValue("C:\\nodejs\\npm.cmd")
    expect(getPackageManagerCommand(PM.NPM)).toBe("C:\\nodejs\\npm.cmd")
    expect(whichSync).toHaveBeenCalledWith("npm")
  })

  test("Windows YARN_BERRY: which.sync called with 'yarn'", async ({ expect }) => {
    setPlatform("win32")
    const { getPackageManagerCommand, PM, whichSync } = await freshImport()
    whichSync.mockReturnValue("C:\\tools\\yarn.cmd")
    getPackageManagerCommand(PM.YARN_BERRY)
    expect(whichSync).toHaveBeenCalledWith("yarn")
  })

  test("Windows: falls back to pm name when which.sync throws", async ({ expect }) => {
    setPlatform("win32")
    const { getPackageManagerCommand, PM, whichSync } = await freshImport()
    whichSync.mockImplementation(() => {
      throw new Error("not found")
    })
    expect(getPackageManagerCommand(PM.PNPM)).toBe("pnpm")
  })

  test("Windows: Volta extensionless shim at path with spaces", async ({ expect }) => {
    setPlatform("win32")
    const { getPackageManagerCommand, PM, whichSync } = await freshImport()
    whichSync.mockReturnValue("C:\\Program Files\\Volta\\pnpm")
    expect(getPackageManagerCommand(PM.PNPM)).toBe("C:\\Program Files\\Volta\\pnpm")
  })

  test("Windows: Volta .exe shim at path with spaces", async ({ expect }) => {
    setPlatform("win32")
    const { getPackageManagerCommand, PM, whichSync } = await freshImport()
    whichSync.mockReturnValue("C:\\Program Files\\Volta\\pnpm.exe")
    expect(getPackageManagerCommand(PM.PNPM)).toBe("C:\\Program Files\\Volta\\pnpm.exe")
  })

  test("caches result: which.sync called only once per pm", async ({ expect }) => {
    setPlatform("win32")
    const { getPackageManagerCommand, PM, whichSync } = await freshImport()
    whichSync.mockReturnValue("C:\\tools\\npm.cmd")
    getPackageManagerCommand(PM.NPM)
    getPackageManagerCommand(PM.NPM)
    expect(whichSync).toHaveBeenCalledOnce()
  })
})
