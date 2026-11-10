import type { ToolsetConfig } from "app-builder-lib/internal"
import { getMakeNsisPath, getNsisPluginsPath } from "app-builder-lib/src/toolsets/nsis"
import { spawnAndWriteWithOutput } from "builder-util"
import { spawn } from "child_process"
import * as path from "path"

const templates = path.resolve(__dirname, "../../../packages/app-builder-lib/templates/nsis/include")

// exit codes of the probe installer: 10 + $IsPowerShellAvailable
const AVAILABLE = 10
const NOT_AVAILABLE = 11

async function makensis(dir: string, script: string[], nsis?: ToolsetConfig["nsis"]): Promise<void> {
  const tool = await getMakeNsisPath(nsis, dir)
  await spawnAndWriteWithOutput(tool.path, ["-WX", "-V2", "-"], script.join("\n"), { env: { ...process.env, ...tool.env } })
}

// Runs IS_POWERSHELL_AVAILABLE of allowOnlyOneInstallerInstance.nsh with $PowerShellPath set to powerShell and exits with
// 10 + $IsPowerShellAvailable (0 = available, 1 = not available). The path is compiled in rather than passed on the command line,
// which ${GetOptions} would cut at a space or at the option delimiter.
async function compileProbe(dir: string, name: string, powerShell: string, nsis?: ToolsetConfig["nsis"]): Promise<string> {
  const probe = path.join(dir, `${name}.exe`)
  const plugins = await getNsisPluginsPath(nsis, dir)
  await makensis(
    dir,
    [
      "Unicode true",
      "RequestExecutionLevel user",
      "SilentInstall silent",
      `!addincludedir "${templates}"`,
      `!addplugindir /x86-unicode "${path.join(plugins, "x86-unicode")}"`,
      "!include LogicLib.nsh",
      // a custom check skips getProcessInfo.nsh (and its unused $pid), CHECK_APP_RUNNING isn't inserted
      "!macro customCheckAppRunning",
      "!macroend",
      "!include allowOnlyOneInstallerInstance.nsh",
      "Var PowerShellPath",
      `OutFile "${probe}"`,
      "Section",
      `  StrCpy $PowerShellPath "${powerShell}"`,
      "  !insertmacro IS_POWERSHELL_AVAILABLE",
      `  IntOp $R1 $IsPowerShellAvailable + ${AVAILABLE}`,
      "  SetErrorLevel $R1",
      "SectionEnd",
    ],
    nsis
  )
  return probe
}

// Like Wine's powershell.exe: accepts any command line, runs nothing and exits with 0.
async function compileStub(dir: string): Promise<string> {
  const stub = path.join(dir, "powershell-stub.exe")
  await makensis(dir, ["Unicode true", "RequestExecutionLevel user", "SilentInstall silent", `OutFile "${stub}"`, "Section", "SectionEnd"])
  return stub
}

// The environment of an installer started from Explorer. The suite runs under PowerShell 7 (the CI test step's shell), whose
// PSModulePath lists its own module directories first: Windows PowerShell inherits it through node and the probe, auto-loads the
// PowerShell 7 CimCmdlets for Get-Command Get-CimInstance, fails to load it and the probe reports PowerShell as unavailable
// (pwsh corrects PSModulePath only for a powershell.exe it starts itself). Without PSModulePath, module auto-loading fails on
// Windows Server 2025 runners as well (see windowsSignedFixture.ts), so it is set to the machine default of Windows PowerShell.
function explorerEnv(systemRoot: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  // Windows environment variable names are case-insensitive, the keys of the spread object are not
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === "psmodulepath") {
      delete env[key]
    }
  }
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files"
  env.PSModulePath = [path.join(programFiles, "WindowsPowerShell", "Modules"), path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "Modules")].join(";")
  return env
}

function run(file: string, env: NodeJS.ProcessEnv): Promise<number | null> {
  return new Promise((resolve, reject) => {
    // a probe that waits on something fails (exit code null) instead of stalling the suite
    const child = spawn(file, [], { stdio: "ignore", timeout: 60_000, env })
    child.on("error", reject)
    child.on("exit", code => resolve(code))
  })
}

describe("IS_POWERSHELL_AVAILABLE", { concurrent: false }, () => {
  test("compiles warning-free with the current and the legacy NSIS toolset", async ({ tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "nsis-powershell-probe" })
    const powerShell = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
    await compileProbe(dir, "probe", powerShell)
    await compileProbe(dir, "probe-legacy", powerShell, "0.0.0")
  })

  test.ifWindows("PowerShell is available only when it ran the probe command", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "nsis-powershell-probe" })
    const systemRoot = process.env.SystemRoot ?? "C:\\Windows"
    const powerShell = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    const env = explorerEnv(systemRoot)

    // real Windows PowerShell runs the command and returns the sentinel exit code
    expect(await run(await compileProbe(dir, "probe-powershell", powerShell), env)).toBe(AVAILABLE)
    // a stub that exits with 0 without running the command (Wine) must not select the PowerShell process check, whose exit code 0
    // means "the app is running" and would keep the installer in the "cannot be closed" loop
    expect(await run(await compileProbe(dir, "probe-stub", await compileStub(dir)), env)).toBe(NOT_AVAILABLE)
    // no PowerShell at all
    expect(await run(await compileProbe(dir, "probe-missing", path.join(dir, "missing", "powershell.exe")), env)).toBe(NOT_AVAILABLE)
  })
})
