// vi.mock calls are hoisted to the top by vitest's transformer.
// They must appear before any imports that depend on them.
import { afterEach, beforeEach, expect, vi } from "vitest"

vi.mock("child_process", async importOriginal => {
  const mod = await importOriginal<typeof import("child_process")>()
  return { ...mod, execFile: vi.fn(), execFileSync: vi.fn() }
})

import { execFile } from "child_process"
import type { Logger } from "electron-updater/src/types"
import { verifySignature } from "electron-updater/src/windowsExecutableCodeSignatureVerifier"

// Windows environment variable names are case-insensitive, but plain JS object keys are not:
// spreading process.env yields a plain object, so `delete env.PSModulePath` alone would leave a
// differently-cased key (PSMODULEPATH, psmodulepath, …) to be inherited by the PowerShell child
// process. preparePowerShellExec must therefore strip the key case-insensitively.
describe("windowsExecutableCodeSignatureVerifier PSModulePath env stripping", () => {
  let logger: Logger

  beforeEach(() => {
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    vi.clearAllMocks()
    vi.mocked(execFile).mockImplementation((_: any, __: any, ___: any, cb: any) => {
      // Status 1 → verifySignature resolves with a non-null error string; neither handleError
      // nor the execFileSync ConvertTo-Json probe is involved.
      cb(null, JSON.stringify({ Status: 1 }), "")
      return {} as any
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  async function envPassedToPowerShell(): Promise<NodeJS.ProcessEnv> {
    await verifySignature(["Test Publisher"], "C:\\fake\\update.exe", logger)
    const [, , options] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[], any]
    return options.env
  }

  async function expectKeyStripped(key: string): Promise<void> {
    const original = process.env[key]
    process.env[key] = "C:\\FakeUserModules"
    try {
      const env = await envPassedToPowerShell()
      expect(Object.keys(env).filter(k => k.toLowerCase() === "psmodulepath")).toEqual([])
    } finally {
      if (original === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = original
      }
    }
  }

  test("canonical-case PSModulePath is stripped from the child env", async () => {
    await expectKeyStripped("PSModulePath")
  })

  test("upper-case PSMODULEPATH is stripped from the child env", async () => {
    await expectKeyStripped("PSMODULEPATH")
  })

  test("lower-case psmodulepath is stripped from the child env", async () => {
    await expectKeyStripped("psmodulepath")
  })

  test("mixed-case PsModulePath is stripped from the child env", async () => {
    await expectKeyStripped("PsModulePath")
  })

  test("other environment variables are still inherited", async () => {
    const env = await envPassedToPowerShell()
    expect(env.PATH ?? env.Path).toBe(process.env.PATH ?? process.env.Path)
  })
})
