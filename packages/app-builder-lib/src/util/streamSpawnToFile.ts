import * as childProcess from "child_process"
import { createWriteStream } from "node:fs"

export interface StreamSpawnResult {
  /** The child's exit code (null if it was killed by a signal). */
  code: number | null
  /** Everything the child wrote to stderr, accumulated. */
  stderr: string
}

/**
 * Spawns a command and streams its stdout to a file, returning the exit code and captured stderr.
 *
 * stdout is piped straight to `outputFile` (never buffered in memory), so arbitrarily large output —
 * a full dependency tree, a verbose `install` log — costs no heap. stderr is small by comparison and
 * is accumulated so the caller can surface it on failure.
 *
 * On Windows the package-manager command is typically a `.cmd` shim (npm.cmd/pnpm.cmd/yarn.cmd),
 * which Node can no longer spawn directly (CVE-2024-27980). Rather than spawn with `shell: true` —
 * which emits the DEP0190 "args with shell" deprecation warning and forces manual metacharacter
 * escaping — wrap the invocation in a single PowerShell `-EncodedCommand`. The base64 (UTF-16LE)
 * payload sidesteps every shell-quoting layer, and `powershell.exe` is a real executable we spawn
 * directly with no shell. See buildPowerShellEncodedArgs for the UTF-8 / exit-code handling. This
 * also avoids the cmd.exe "The batch file cannot be found." re-open race that plagues `.cmd` shims.
 *
 * Resolves with `{ code, stderr }` for ANY exit code — interpreting a non-zero code is the caller's
 * job (e.g. `npm list` returns 1 in expected scenarios). Only genuine infrastructure failures —
 * spawn errors and write-stream errors — reject.
 *
 * @param command - The command to execute
 * @param args - Array of command-line arguments
 * @param cwd - The working directory to execute the command in
 * @param outputFile - The path to the file where stdout will be streamed
 * @param env - The environment for the child process (callers are responsible for stripping secrets)
 */
export function streamSpawnToFile(command: string, args: string[], cwd: string, outputFile: string, env: NodeJS.ProcessEnv): Promise<StreamSpawnResult> {
  const [spawnCommand, spawnArgs] = process.platform === "win32" ? (["powershell.exe", buildPowerShellEncodedArgs(command, args)] as const) : ([command, args] as const)

  return new Promise<StreamSpawnResult>((resolve, reject) => {
    const outStream = createWriteStream(outputFile)

    const child = childProcess.spawn(spawnCommand, spawnArgs, { cwd, env })

    let stderr = ""
    // The process can close before all piped stdout has been flushed to disk. Resolving on the
    // child's "close" alone races the write stream and lets the caller read a TRUNCATED file
    // (manifesting as "No JSON content found in output"). Gate the settle on BOTH the child exit
    // (for the code/stderr) and the write stream's "finish" (all bytes flushed).
    let exitCode: number | null = null
    let childClosed = false
    let streamFinished = false
    let settled = false

    // `pipe` ends `outStream` when stdout EOFs, which triggers its "finish" once flushed.
    child.stdout.pipe(outStream)
    child.stderr.on("data", chunk => {
      stderr += chunk.toString()
    })

    const fail = (err: Error) => {
      if (settled) {
        return
      }
      settled = true
      // Best-effort cleanup: stop the child and close the stream so we don't
      // waste CPU writing to a broken fd after rejection.
      try {
        child.kill()
      } catch {
        // ignore
      }
      try {
        outStream.destroy()
      } catch {
        // ignore
      }
      reject(err)
    }

    const settle = () => {
      if (settled || !childClosed || !streamFinished) {
        return
      }
      settled = true
      resolve({ code: exitCode, stderr })
    }

    outStream.on("error", err => fail(new Error(`Failed writing process output (${command}): ${err.message}`)))
    outStream.on("finish", () => {
      streamFinished = true
      settle()
    })
    child.on("error", err => {
      fail(new Error(`Process spawn (${command} ${JSON.stringify(args)}) failed: ${err.message}`))
    })
    child.on("close", code => {
      exitCode = code
      childClosed = true
      settle()
    })
  })
}

/**
 * Build the argv for invoking a Windows command through `powershell.exe -EncodedCommand`.
 *
 * Each token is wrapped in a PowerShell single-quoted string (with embedded single quotes doubled),
 * so no character is interpreted by a shell. The script:
 *   - pins `[Console]::OutputEncoding` to UTF-8 *without* a BOM so the JSON dependency tree is not
 *     corrupted by the console's OEM code page (and no BOM is prepended to break `JSON.parse`),
 *   - invokes the command via the call operator `&`,
 *   - re-emits the command's own exit code via `exit $LASTEXITCODE` (e.g. `npm list` returns 1 in
 *     expected scenarios, which the caller's shouldIgnore logic relies on).
 *
 * The whole script is base64-encoded as UTF-16LE per PowerShell's `-EncodedCommand` contract.
 */
export function buildPowerShellEncodedArgs(command: string, args: string[]): string[] {
  const psQuote = (value: string) => `'${value.replace(/'/g, "''")}'`
  const invocation = ["&", psQuote(command), ...args.map(psQuote)].join(" ")
  const script = `[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); ${invocation}; exit $LASTEXITCODE`
  const encoded = Buffer.from(script, "utf16le").toString("base64")
  return ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]
}
