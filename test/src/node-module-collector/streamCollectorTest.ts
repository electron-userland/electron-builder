import { afterEach, beforeEach, describe, test, vi } from "vitest"
import { NodeModulesCollector } from "app-builder-lib/src/node-module-collector/nodeModulesCollector"
import { LogMessageByKey } from "app-builder-lib/src/node-module-collector/moduleManager"
import { PM } from "app-builder-lib/src/node-module-collector/packageManager"
import * as childProcess from "child_process"
import * as fsExtra from "fs-extra"
import type { TmpDir } from "builder-util"

vi.mock("child_process", () => ({ spawn: vi.fn() }))
vi.mock("fs-extra", async () => ({
  ...(await vi.importActual("fs-extra")),
  createWriteStream: vi.fn(() => ({ close: vi.fn() })),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

class TestCollector extends NodeModulesCollector<any, any> {
  readonly installOptions = { manager: PM.NPM, lockfile: "package-lock.json" }
  protected getArgs() {
    return []
  }
  protected async extractProductionDependencyGraph() {}
  protected async collectAllDependencies() {}
  // expose protected members for testing
  streamCollectorCommandToFile(command: string, args: string[], cwd: string, tempOutputFile: string) {
    return super.streamCollectorCommandToFile(command, args, cwd, tempOutputFile)
  }
  get logSummary() {
    return this.cache.logSummary
  }
}

const BAT_PATH = "C:\\Temp\\pnpm-deadbeef.bat"
const OUTPUT_FILE = "/tmp/output.json"

const originalPlatform = process.platform

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: p, configurable: true })
}

let collector: TestCollector
let closeCb: ((code: number) => void) | undefined
let stderrDataCb: ((chunk: string) => void) | undefined

async function waitForCloseCb() {
  for (let i = 0; i < 50 && closeCb === undefined; i++) {
    await Promise.resolve()
  }
  if (closeCb === undefined) {
    throw new Error("spawn never registered close callback")
  }
}

beforeEach(() => {
  closeCb = undefined
  stderrDataCb = undefined
  const mockChild = {
    stdout: { pipe: vi.fn() },
    stderr: {
      on: vi.fn((ev: string, cb: (chunk: string) => void) => {
        if (ev === "data") stderrDataCb = cb
      }),
    },
    on: vi.fn((ev: string, cb: (code: number) => void) => {
      if (ev === "close") closeCb = cb
    }),
  }
  vi.mocked(childProcess.spawn).mockReturnValue(mockChild as any)
  const mockTmpDir = { getTempFile: vi.fn().mockResolvedValue(BAT_PATH) } as unknown as TmpDir
  collector = new TestCollector("/rootDir", mockTmpDir)
})

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
  vi.clearAllMocks()
})

describe.sequential("streamCollectorCommandToFile", () => {
  describe("Windows bat wrapping", () => {
    test(".cmd file: spawn receives cmd.exe", async ({ expect }) => {
      setPlatform("win32")
      const p = collector.streamCollectorCommandToFile("C:\\nodejs\\npm.cmd", ["list"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      closeCb!(0)
      await p
      const [cmd, args] = vi.mocked(childProcess.spawn).mock.calls[0]
      expect(cmd).toBe("cmd.exe")
      expect(args[0]).toBe("/c")
      expect(args[1]).toBe(`"${BAT_PATH}"`)
    })

    test(".cmd at path with spaces: wrapped in bat", async ({ expect }) => {
      setPlatform("win32")
      const p = collector.streamCollectorCommandToFile("C:\\Program Files\\nodejs\\npm.cmd", ["list"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      closeCb!(0)
      await p
      expect(vi.mocked(childProcess.spawn).mock.calls[0][0]).toBe("cmd.exe")
    })

    test("extensionless at path with spaces: wrapped in bat", async ({ expect }) => {
      setPlatform("win32")
      const p = collector.streamCollectorCommandToFile("C:\\Program Files\\Volta\\pnpm", [], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      closeCb!(0)
      await p
      expect(vi.mocked(childProcess.spawn).mock.calls[0][0]).toBe("cmd.exe")
    })

    test(".exe at path with spaces: wrapped in bat (Volta shim fix)", async ({ expect }) => {
      setPlatform("win32")
      const p = collector.streamCollectorCommandToFile("C:\\Program Files\\Volta\\pnpm.exe", [], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      closeCb!(0)
      await p
      expect(vi.mocked(childProcess.spawn).mock.calls[0][0]).toBe("cmd.exe")
    })

    test("bat script quotes command and uses CRLF line endings", async ({ expect }) => {
      setPlatform("win32")
      const p = collector.streamCollectorCommandToFile("C:\\Program Files\\Volta\\pnpm.exe", [], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      closeCb!(0)
      await p
      const [, content] = vi.mocked(fsExtra.writeFile).mock.calls[0] as unknown as [string, string, unknown]
      expect(content).toBe('@echo off\r\n"C:\\Program Files\\Volta\\pnpm.exe" %*\r\n')
    })

    test("bat script escapes double quotes in command path", async ({ expect }) => {
      setPlatform("win32")
      const p = collector.streamCollectorCommandToFile('C:\\some""path\\npm.cmd', [], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      closeCb!(0)
      await p
      const [, content] = vi.mocked(fsExtra.writeFile).mock.calls[0] as unknown as [string, string, unknown]
      expect(content).toContain('C:\\some""""path\\npm.cmd')
    })

    test("original args forwarded after bat path", async ({ expect }) => {
      setPlatform("win32")
      const p = collector.streamCollectorCommandToFile("C:\\Program Files\\npm.cmd", ["list", "--json"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      closeCb!(0)
      await p
      const spawnArgs = vi.mocked(childProcess.spawn).mock.calls[0][1] as string[]
      expect(spawnArgs.slice(2)).toEqual(["list", "--json"])
    })
  })

  describe("no bat wrapping", () => {
    test(".exe at path without spaces: spawn receives original command", async ({ expect }) => {
      setPlatform("win32")
      const cmd = "C:\\tools\\pnpm.exe"
      const p = collector.streamCollectorCommandToFile(cmd, [], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      closeCb!(0)
      await p
      expect(vi.mocked(childProcess.spawn).mock.calls[0][0]).toBe(cmd)
      expect(vi.mocked(fsExtra.writeFile)).not.toHaveBeenCalled()
    })

    test("extensionless at path without spaces: spawn receives original command", async ({ expect }) => {
      setPlatform("win32")
      const p = collector.streamCollectorCommandToFile("pnpm", [], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      closeCb!(0)
      await p
      expect(vi.mocked(childProcess.spawn).mock.calls[0][0]).toBe("pnpm")
      expect(vi.mocked(fsExtra.writeFile)).not.toHaveBeenCalled()
    })

    test("non-Windows: never wraps even for spaces-in-path .exe", async ({ expect }) => {
      setPlatform("darwin")
      const cmd = "/Applications/Volta/pnpm.exe"
      const p = collector.streamCollectorCommandToFile(cmd, [], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      closeCb!(0)
      await p
      expect(vi.mocked(childProcess.spawn).mock.calls[0][0]).toBe(cmd)
      expect(vi.mocked(fsExtra.writeFile)).not.toHaveBeenCalled()
    })
  })

  describe("stderr and exit code behavior", () => {
    test("npm list exit code 1: stderr is NOT surfaced as a collector warning", async ({ expect }) => {
      const p = collector.streamCollectorCommandToFile("npm", ["list", "--json"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      stderrDataCb?.("npm error code ELSPROBLEMS\nnpm error invalid: canvas@npm:npm-empty-stub@1.0.1\n")
      closeCb!(1)
      await p
      expect(collector.logSummary[LogMessageByKey.PKG_COLLECTOR_OUTPUT]).toHaveLength(0)
    })

    test("npm list exit code 0 with stderr: stderr IS surfaced as a collector warning", async ({ expect }) => {
      const p = collector.streamCollectorCommandToFile("npm", ["list", "--json"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      stderrDataCb?.("npm warn some unexpected warning\n")
      closeCb!(0)
      await p
      const output = collector.logSummary[LogMessageByKey.PKG_COLLECTOR_OUTPUT]
      expect(output).toHaveLength(1)
      expect(output[0]).toContain("npm warn some unexpected warning")
    })

    test("non-npm command exit code 1: rejects with stderr in error message", async ({ expect }) => {
      const p = collector.streamCollectorCommandToFile("pnpm", ["list", "--json"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      stderrDataCb?.("pnpm error: something went wrong\n")
      closeCb!(1)
      await expect(p).rejects.toThrow("pnpm error: something went wrong")
    })

    test("npm command (not list) exit code 1: rejects", async ({ expect }) => {
      const p = collector.streamCollectorCommandToFile("npm", ["install"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      stderrDataCb?.("npm error: install failed\n")
      closeCb!(1)
      await expect(p).rejects.toThrow()
    })

    test("npm list with full path exit code 1: stderr suppressed (shouldIgnore applies to basename)", async ({ expect }) => {
      const p = collector.streamCollectorCommandToFile("/usr/local/bin/npm", ["list", "--json"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      stderrDataCb?.("npm error code ELSPROBLEMS\nnpm error invalid: some-pkg@npm:stub@1.0.0\n")
      closeCb!(1)
      await p
      expect(collector.logSummary[LogMessageByKey.PKG_COLLECTOR_OUTPUT]).toHaveLength(0)
    })

    test("win32 npm.cmd wrapped via cmd.exe: exit code 1 still triggers shouldIgnore", async ({ expect }) => {
      // Regression: execName must be derived from the original command ("npm"), not the rewritten
      // cmd.exe invocation, otherwise shouldIgnore never fires and npm list exit code 1 rejects.
      // Use "npm.cmd" without a backslash-prefixed directory so path.basename works cross-platform
      // in the test environment (macOS path.basename ignores backslash separators).
      setPlatform("win32")
      const p = collector.streamCollectorCommandToFile("npm.cmd", ["list", "--json"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      stderrDataCb?.("npm error code ELSPROBLEMS\nnpm error invalid: canvas@npm:npm-empty-stub@1.0.1\n")
      closeCb!(1)
      await p
      expect(collector.logSummary[LogMessageByKey.PKG_COLLECTOR_OUTPUT]).toHaveLength(0)
    })
  })
})
