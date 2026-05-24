import * as path from "path"
import { vi, beforeEach, afterEach } from "vitest"
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
    const encodedIdx = args.indexOf("-EncodedCommand")
    const script = Buffer.from(args[encodedIdx + 1], "base64").toString("utf16le")
    expect(args.slice(0, encodedIdx + 1)).toMatchSnapshot()
    expect(script).toMatchSnapshot()
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

describe.ifWindows("NsisUpdater.doInstall elevation — Windows integration", () => {
  test("powershell.exe accepts -EncodedCommand on this system", async ({ expect }) => {
    const { execFile } = await import("child_process")
    const { promisify } = await import("util")
    const execFileAsync = promisify(execFile)
    const script = "Write-Output 'elevation-test-ok'"
    const encoded = Buffer.from(script, "utf16le").toString("base64")
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], { encoding: "utf8" })
    expect(stdout.trim()).toBe("elevation-test-ok")
  })

  test("generated Start-Process script is syntactically valid for plain args", async ({ expect }) => {
    const installerPath = "C:\\fake\\installer.exe"
    const args = ["--updated", "/S"]
    const psInstallArgs = args.map(a => `'${a.replace(/'/g, "''")}'`).join(",")
    const psScript = `Start-Process -FilePath '${installerPath.replace(/'/g, "''")}' -ArgumentList @(${psInstallArgs}) -Verb RunAs`
    await assertPsScriptParses(psScript)
    expect(true).toBe(true)
  })

  test("generated Start-Process script is syntactically valid for args containing spaces", async ({ expect }) => {
    const installerPath = "C:\\fake\\installer.exe"
    const args = ["--updated", "/D=C:\\Program Files\\My App"]
    const psInstallArgs = args.map(a => (a.includes(" ") ? `'"${a.replace(/"/g, '""')}"'` : `'${a.replace(/'/g, "''")}'`)).join(",")
    const psScript = `Start-Process -FilePath '${installerPath.replace(/'/g, "''")}' -ArgumentList @(${psInstallArgs}) -Verb RunAs`
    await assertPsScriptParses(psScript)
    expect(true).toBe(true)
  })
})

async function assertPsScriptParses(script: string): Promise<void> {
  const { execFile } = await import("child_process")
  const { promisify } = await import("util")
  const execFileAsync = promisify(execFile)
  // Count parse errors without executing the script
  const parseCmd = `$errors = $null; $null = [System.Management.Automation.Language.Parser]::ParseInput(${JSON.stringify(script)}, [ref]$null, [ref]$errors); exit $errors.Count`
  const encoded = Buffer.from(parseCmd, "utf16le").toString("base64")
  // Throws on non-zero exit code (= parse errors found)
  await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded])
}
