import * as path from "path"
import { vi, describe, beforeEach, afterEach } from "vitest"
import { createNsisUpdater } from "../helpers/updaterTestUtil"

describe("NsisUpdater.doInstall elevation", () => {
  beforeEach(() => {
    // process.resourcesPath is Electron-specific; stub it for the Node test environment
    Object.defineProperty(process, "resourcesPath", { value: "/fake/resources", writable: true, configurable: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(process, "resourcesPath", { value: undefined, writable: true, configurable: true })
  })

  test("uses PowerShell with -NoProfile and -EncodedCommand when isAdminRightsRequired", async ({ expect }) => {
    const updater = await createNsisUpdater()
    const spawnLogMock = vi.spyOn(updater as any, "spawnLog").mockResolvedValue(true)
    vi.spyOn(updater as any, "installerPath", "get").mockReturnValue("/fake/installer.exe")

    ;(updater as any).doInstall({ isSilent: true, isForceRunAfter: false, isAdminRightsRequired: true })

    expect(spawnLogMock).toHaveBeenCalledOnce()
    const [cmd, args] = spawnLogMock.mock.calls[0] as [string, string[]]
    expect(cmd).toBe("powershell.exe")
    expect(args).toContain("-NoProfile")
    expect(args).toContain("-NonInteractive")

    const encodedIdx = args.indexOf("-EncodedCommand")
    expect(encodedIdx).toBeGreaterThan(-1)
    const script = Buffer.from(args[encodedIdx + 1], "base64").toString("utf16le")
    expect(script).toContain("Start-Process")
    expect(script).toContain("-Verb RunAs")
    expect(script).toContain("/fake/installer.exe")
    expect(script).toContain("--updated")
    expect(script).toContain("/S")
  })

  test("wraps installer args containing spaces in Win32 double-quotes", async ({ expect }) => {
    const updater = await createNsisUpdater()
    updater.installDirectory = "C:\\Program Files\\My App"
    const spawnLogMock = vi.spyOn(updater as any, "spawnLog").mockResolvedValue(true)
    vi.spyOn(updater as any, "installerPath", "get").mockReturnValue("/fake/installer.exe")

    ;(updater as any).doInstall({ isSilent: false, isForceRunAfter: false, isAdminRightsRequired: true })

    const [, args] = spawnLogMock.mock.calls[0] as [string, string[]]
    const encodedIdx = args.indexOf("-EncodedCommand")
    const script = Buffer.from(args[encodedIdx + 1], "base64").toString("utf16le")
    expect(script).toContain('"/D=C:\\Program Files\\My App"')
  })

  test("dispatches error when powershell.exe fails with non-ENOENT error", async ({ expect }) => {
    const updater = await createNsisUpdater()
    const error = Object.assign(new Error("spawn UNKNOWN"), { code: "UNKNOWN" })
    vi.spyOn(updater as any, "spawnLog").mockRejectedValue(error)
    vi.spyOn(updater as any, "installerPath", "get").mockReturnValue("/fake/installer.exe")
    const dispatchErrorMock = vi.spyOn(updater as any, "dispatchError").mockImplementation(() => {})

    ;(updater as any).doInstall({ isSilent: false, isForceRunAfter: false, isAdminRightsRequired: true })
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(dispatchErrorMock).toHaveBeenCalledWith(error)
  })

  test("falls back to elevate.exe spawn when powershell.exe not found", async ({ expect }) => {
    const updater = await createNsisUpdater()
    const psError = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" })
    const spawnLogMock = vi.spyOn(updater as any, "spawnLog").mockRejectedValueOnce(psError).mockResolvedValueOnce(true)
    vi.spyOn(updater as any, "installerPath", "get").mockReturnValue("/fake/installer.exe")

    ;(updater as any).doInstall({ isSilent: false, isForceRunAfter: false, isAdminRightsRequired: true })
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(spawnLogMock).toHaveBeenCalledTimes(2)
    expect(spawnLogMock.mock.calls[0][0]).toBe("powershell.exe")
    expect(spawnLogMock.mock.calls[1][0]).toBe(path.join("/fake/resources", "elevate.exe"))
  })
})
