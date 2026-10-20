import { ParallelsVm, ParallelsVmManager } from "app-builder-lib/src/vm/ParallelsVm.js"
import { getWindowsExecVm, VmManager } from "app-builder-lib/src/vm/vm.js"
import { WineVmManager } from "app-builder-lib/src/vm/WineVm.js"
import { DebugLogger, exec } from "builder-util"
import { afterEach, beforeEach, describe, test, vi } from "vitest"

// getWindowsExecVm picks how to run a Windows executable (e.g. the NSIS installer that writes the uninstaller):
// natively on Windows, else in a Parallels Windows VM, else via wine — never PwshVmManager, which runs the file natively.
// `exec` stands in for `prlctl list`; ParallelsVm.js is imported dynamically by vm.ts, so it is not mocked directly.
vi.mock("builder-util", async importOriginal => {
  const actual = await importOriginal<typeof import("builder-util")>()
  return { ...actual, exec: vi.fn<typeof actual.exec>() }
})

const originalPlatform = process.platform

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: p, configurable: true })
}

function prlctlList(vms: Array<Pick<ParallelsVm, "id" | "os" | "state">>): string {
  return vms.map(it => `ID: {${it.id}}\nName: ${it.id}\nState: ${it.state}\nOS: ${it.os}\n`).join("\n")
}

const execVm = () => getWindowsExecVm(new DebugLogger(false), undefined, "/build")

describe("getWindowsExecVm", () => {
  beforeEach(() => {
    vi.mocked(exec).mockReset()
  })

  afterEach(() => {
    setPlatform(originalPlatform)
  })

  test("runs natively on Windows without querying Parallels", async ({ expect }) => {
    setPlatform("win32")
    const result = await execVm()
    expect(result.constructor).toBe(VmManager)
    expect(vi.mocked(exec)).not.toHaveBeenCalled()
  })

  test.for<NodeJS.Platform>(["darwin", "linux"])("prefers a running Parallels Windows VM on %s", async (platform, { expect }) => {
    setPlatform(platform)
    vi.mocked(exec).mockResolvedValue(
      prlctlList([
        { id: "ubuntu", os: "ubuntu", state: "running" },
        { id: "stopped", os: "win-10", state: "stopped" },
        { id: "running", os: "win-11", state: "running" },
      ])
    )
    const result = await execVm()
    expect(result).toBeInstanceOf(ParallelsVmManager)
    expect((result as any).vm.id).toBe("{running}")
    expect(vi.mocked(exec)).toHaveBeenCalledWith("prlctl", ["list", "-i", "-s", "name"], undefined, false)
  })

  test.for<NodeJS.Platform>(["darwin", "linux"])("falls back to wine on %s when Parallels is unavailable", async (platform, { expect }) => {
    setPlatform(platform)
    vi.mocked(exec).mockRejectedValue(new Error("spawn prlctl ENOENT"))
    expect(await execVm()).toBeInstanceOf(WineVmManager)
  })

  test("falls back to wine when Parallels has no Windows VM", async ({ expect }) => {
    setPlatform("darwin")
    vi.mocked(exec).mockResolvedValue(prlctlList([{ id: "ubuntu", os: "ubuntu", state: "running" }]))
    expect(await execVm()).toBeInstanceOf(WineVmManager)
  })
})
