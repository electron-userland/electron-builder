import { afterEach, beforeEach, describe, test, vi } from "vitest"
import { NodeModulesCollector } from "app-builder-lib/src/node-module-collector/nodeModulesCollector"
import { LogMessageByKey } from "app-builder-lib/src/node-module-collector/moduleManager"
import { PM } from "app-builder-lib/src/node-module-collector/packageManager"
import * as childProcess from "child_process"
import * as fsExtra from "fs-extra"
import * as nodeFs from "node:fs/promises"
import * as os from "os"
import * as path from "path"
import { EventEmitter } from "events"
import type { TmpDir } from "builder-util"

vi.mock("child_process", () => ({ spawn: vi.fn() }))
vi.mock("fs-extra", async () => {
  const actual = await vi.importActual<typeof import("fs-extra")>("fs-extra")
  return {
    ...actual,
    // Spreading the namespace only copies fs-extra's own methods; the graceful-fs re-exports (readFile, ...)
    // that getDependenciesTree relies on are reachable on the namespace but are not enumerable, so pass them through.
    readFile: actual.readFile,
    createWriteStream: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
  }
})

class TestCollector extends NodeModulesCollector<any, any> {
  readonly installOptions = { manager: PM.NPM, lockfile: "package-lock.json" }
  protected getArgs() {
    return ["list", "--json"]
  }
  protected async extractProductionDependencyGraph() {}
  protected async collectAllDependencies() {}
  // expose protected members for testing
  streamCollectorCommandToFile(command: string, args: string[], cwd: string, tempOutputFile: string) {
    return super.streamCollectorCommandToFile(command, args, cwd, tempOutputFile)
  }
  getDependenciesTree(pm: PM) {
    return super.getDependenciesTree(pm)
  }
  get logSummary() {
    return this.cache.logSummary
  }
}

const TMP_FILE = "C:\\Temp\\pnpm-deadbeef.tmp"
const OUTPUT_FILE = "/tmp/output.json"

const originalPlatform = process.platform

// Decode a `powershell.exe -EncodedCommand <base64>` argv back into the PowerShell script text.
function decodeEncodedCommand(spawnArgs: string[]): string {
  const idx = spawnArgs.indexOf("-EncodedCommand")
  if (idx < 0) {
    throw new Error(`-EncodedCommand not found in args: ${JSON.stringify(spawnArgs)}`)
  }
  if (idx + 1 >= spawnArgs.length) {
    throw new Error(`-EncodedCommand has no following value in args: ${JSON.stringify(spawnArgs)}`)
  }
  return Buffer.from(spawnArgs[idx + 1], "base64").toString("utf16le")
}

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: p, configurable: true })
}

let collector: TestCollector
let closeCb: ((code: number) => void) | undefined
let stderrDataCb: ((chunk: string) => void) | undefined
let mockOutStream: EventEmitter

async function waitForCloseCb() {
  for (let i = 0; i < 50 && closeCb === undefined; i++) {
    await Promise.resolve()
  }
  if (closeCb === undefined) {
    throw new Error("spawn never registered close callback")
  }
}

// Like waitForCloseCb, but tolerates the multi-second retry back-off of getDependenciesTree before the next spawn.
async function waitForRetrySpawn() {
  for (let i = 0; i < 1000 && closeCb === undefined; i++) {
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  if (closeCb === undefined) {
    throw new Error("retry never spawned the command again")
  }
}

beforeEach(() => {
  closeCb = undefined
  stderrDataCb = undefined

  // A real EventEmitter so outStream.on("finish"/"error", cb) and outStream.emit(...) work.
  // pipe() is mocked to auto-emit "finish" after a microtask, matching what a real writable
  // stream does when the readable source ends.
  mockOutStream = new EventEmitter()
  vi.mocked(fsExtra.createWriteStream).mockReturnValue(mockOutStream as any)

  const mockChild = {
    stdout: {
      pipe: vi.fn((dest: EventEmitter) => {
        void Promise.resolve().then(() => dest.emit("finish"))
      }),
    },
    stderr: {
      on: vi.fn((ev: string, cb: (chunk: string) => void) => {
        if (ev === "data") {
          stderrDataCb = cb
        }
      }),
    },
    on: vi.fn((ev: string, cb: (code: number) => void) => {
      if (ev === "close") {
        closeCb = cb
      }
    }),
    kill: vi.fn(),
  }
  vi.mocked(childProcess.spawn).mockReturnValue(mockChild as any)
  const mockTmpDir = { getTempFile: vi.fn().mockResolvedValue(TMP_FILE) } as unknown as TmpDir
  collector = new TestCollector("/rootDir", mockTmpDir)
})

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
  vi.clearAllMocks()
})

describe.sequential("streamCollectorCommandToFile", () => {
  describe("Windows PowerShell -EncodedCommand wrapping", () => {
    test(".cmd file: spawn receives powershell.exe with -EncodedCommand", async ({ expect }) => {
      setPlatform("win32")
      const p = collector.streamCollectorCommandToFile("C:\\nodejs\\npm.cmd", ["list"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      closeCb!(0)
      await p
      const [cmd, args] = vi.mocked(childProcess.spawn).mock.calls[0]
      expect(cmd).toBe("powershell.exe")
      expect((args as string[]).slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-EncodedCommand"])
      const script = decodeEncodedCommand(args as string[])
      expect(script).toContain("& 'C:\\nodejs\\npm.cmd' 'list'")
      expect(script).toContain("exit $LASTEXITCODE")
      // No temporary .bat file is created anymore.
      expect(vi.mocked(fsExtra.writeFile)).not.toHaveBeenCalled()
    })

    test("path with spaces: single-quoted, no shell escaping required", async ({ expect }) => {
      setPlatform("win32")
      const p = collector.streamCollectorCommandToFile("C:\\Program Files\\nodejs\\npm.cmd", ["list"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      closeCb!(0)
      await p
      const script = decodeEncodedCommand(vi.mocked(childProcess.spawn).mock.calls[0][1] as string[])
      expect(script).toContain("& 'C:\\Program Files\\nodejs\\npm.cmd' 'list'")
    })

    test("extensionless command (e.g. Volta shim): wrapped via PowerShell call operator", async ({ expect }) => {
      setPlatform("win32")
      const p = collector.streamCollectorCommandToFile("C:\\Program Files\\Volta\\pnpm", [], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      closeCb!(0)
      await p
      expect(vi.mocked(childProcess.spawn).mock.calls[0][0]).toBe("powershell.exe")
      const script = decodeEncodedCommand(vi.mocked(childProcess.spawn).mock.calls[0][1] as string[])
      expect(script).toContain("& 'C:\\Program Files\\Volta\\pnpm'")
    })

    test("original args are forwarded and individually single-quoted", async ({ expect }) => {
      setPlatform("win32")
      const p = collector.streamCollectorCommandToFile("C:\\Program Files\\npm.cmd", ["list", "--json"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      closeCb!(0)
      await p
      const script = decodeEncodedCommand(vi.mocked(childProcess.spawn).mock.calls[0][1] as string[])
      expect(script).toContain("& 'C:\\Program Files\\npm.cmd' 'list' '--json'")
    })

    test("embedded single quote in an argument is doubled (no injection)", async ({ expect }) => {
      setPlatform("win32")
      const p = collector.streamCollectorCommandToFile("npm", ["list", "a'b"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      closeCb!(0)
      await p
      const script = decodeEncodedCommand(vi.mocked(childProcess.spawn).mock.calls[0][1] as string[])
      expect(script).toContain("'a''b'")
    })

    test("pins UTF-8 output encoding without a BOM", async ({ expect }) => {
      setPlatform("win32")
      const p = collector.streamCollectorCommandToFile("npm", ["list"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      closeCb!(0)
      await p
      const script = decodeEncodedCommand(vi.mocked(childProcess.spawn).mock.calls[0][1] as string[])
      expect(script).toContain("[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)")
    })

    test("-EncodedCommand payload is valid base64 of UTF-16LE", async ({ expect }) => {
      setPlatform("win32")
      const p = collector.streamCollectorCommandToFile("pnpm", ["list"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      closeCb!(0)
      await p
      const args = vi.mocked(childProcess.spawn).mock.calls[0][1] as string[]
      const encoded = args[args.indexOf("-EncodedCommand") + 1]
      // Re-encoding the decoded script must reproduce the exact payload.
      expect(Buffer.from(Buffer.from(encoded, "base64").toString("utf16le"), "utf16le").toString("base64")).toBe(encoded)
    })
  })

  describe("non-Windows: no PowerShell wrapping", () => {
    test("darwin: spawn receives the original command and args", async ({ expect }) => {
      setPlatform("darwin")
      const cmd = "/Applications/Volta/pnpm"
      const p = collector.streamCollectorCommandToFile(cmd, ["list", "--json"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      closeCb!(0)
      await p
      const [spawnCmd, spawnArgs] = vi.mocked(childProcess.spawn).mock.calls[0]
      expect(spawnCmd).toBe(cmd)
      expect(spawnArgs).toEqual(["list", "--json"])
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

    test("win32 npm.cmd wrapped via PowerShell: exit code 1 still triggers shouldIgnore", async ({ expect }) => {
      // Regression: execName must be derived from the original command ("npm"), not the "powershell"
      // wrapper we spawn on Windows, otherwise shouldIgnore never fires and npm list exit code 1 rejects.
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

  describe("getDependenciesTree: empty output", () => {
    test("npm list exit code 1 with EMPTY stdout: rejects with a clear error after the single retry (issue #10208)", { timeout: 30_000 }, async ({ expect }) => {
      // npm swallowed an exception while flushing its JSON tree: nothing on stdout, exit code 1. Parsing the
      // empty file used to surface only the misleading "No JSON content found in output".
      // getDependenciesTree (and the retry's shouldRetry) read the output file for real, and this suite mocks
      // fs-extra's writeFile, so create a genuinely empty file through node:fs instead of using OUTPUT_FILE.
      const emptyOutputDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), "eb-empty-output-"))
      const emptyOutputFile = path.join(emptyOutputDir, "npm-output.json")
      await nodeFs.writeFile(emptyOutputFile, "")
      try {
        const tmpDir = { getTempFile: vi.fn().mockResolvedValue(emptyOutputFile) } as unknown as TmpDir
        const emptyOutputCollector = new TestCollector("/rootDir", tmpDir)

        const p = emptyOutputCollector.getDependenciesTree(PM.NPM)
        await waitForCloseCb()
        stderrDataCb?.("npm error A complete log of this run can be found in: /home/user/.npm/_logs/debug-0.log\n")
        closeCb!(1)

        // the empty output is treated as transient once: the command is spawned a second time
        closeCb = undefined
        await waitForRetrySpawn()
        stderrDataCb?.("npm error A complete log of this run can be found in: /home/user/.npm/_logs/debug-1.log\n")
        closeCb!(1)

        // win32 resolves `npm` via which.sync, so the basename is `npm.cmd` or `npm.CMD` depending on the runner's PATHEXT casing
        await expect(p).rejects.toThrow(/`npm(\.cmd)? list --json` \(cwd: \/rootDir\) exited with code 1 and produced no output on stdout/i)
        await expect(p).rejects.toThrow("stderr: npm error A complete log of this run can be found in")
        await expect(p).rejects.not.toThrow("No JSON content found in output")
        expect(vi.mocked(childProcess.spawn)).toHaveBeenCalledTimes(2)
      } finally {
        await nodeFs.rm(emptyOutputDir, { recursive: true, force: true })
      }
    })
  })

  describe("write stream error handling", () => {
    test("outStream error event rejects the promise before child closes", async ({ expect }) => {
      const p = collector.streamCollectorCommandToFile("npm", ["list", "--json"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      mockOutStream.emit("error", new Error("ENOSPC: no space left on device"))
      await expect(p).rejects.toThrow("ENOSPC: no space left on device")
    })

    test("outStream error: child.kill() is called to stop the orphaned process", async ({ expect }) => {
      const p = collector.streamCollectorCommandToFile("pnpm", ["list"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      const mockChild = vi.mocked(childProcess.spawn).mock.results[0].value
      mockOutStream.emit("error", new Error("ENOSPC"))
      await expect(p).rejects.toThrow()
      expect(mockChild.kill).toHaveBeenCalledOnce()
    })

    test("outStream error: stream.destroy() is called to close the broken fd", async ({ expect }) => {
      // Attach a spy to the destroy method after the stream is created inside streamCollectorCommandToFile.
      // We stub createWriteStream to return an extended mock that has a destroy spy.
      const destroySpy = vi.fn()
      const extendedStream = Object.assign(mockOutStream, { destroy: destroySpy })
      vi.mocked(fsExtra.createWriteStream).mockReturnValueOnce(extendedStream as any)

      const p = collector.streamCollectorCommandToFile("pnpm", ["list"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      extendedStream.emit("error", new Error("ENOSPC"))
      await expect(p).rejects.toThrow()
      expect(destroySpy).toHaveBeenCalledOnce()
    })

    test("outStream error: second error after settle is ignored (no double-reject)", async ({ expect }) => {
      const p = collector.streamCollectorCommandToFile("npm", ["list", "--json"], "/cwd", OUTPUT_FILE)
      await waitForCloseCb()
      mockOutStream.emit("error", new Error("first error"))
      // Emitting a second error must not throw an unhandled rejection
      mockOutStream.emit("error", new Error("second error"))
      await expect(p).rejects.toThrow("first error")
    })
  })
})
