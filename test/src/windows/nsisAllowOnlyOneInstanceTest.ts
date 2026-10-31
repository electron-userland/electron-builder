import { findExecutable } from "builder-util/src/executables"
import { windowsPowerShellPath } from "builder-util-runtime"
import { spawnSync } from "child_process"
import { existsSync } from "fs"
import * as fs from "fs/promises"
import * as path from "path"
import { beforeAll, expect } from "vitest"

// the statement every PowerShell command of the template starts with, NSIS-escaped
const FIXED_MODULE_PATH = "$$env:PSModulePath = $$PSHOME + '\\Modules'; "

const powerShellCalls = (text: string) => text.split("\n").filter(line => line.includes("nsExec::Exec") && line.includes('"$PowerShellPath"'))

// The PowerShell to run the commands in: the in-box Windows PowerShell on Windows (where the installer runs them), elsewhere
// PowerShell 7 when it is installed at its default location
function processCheckPowerShell(): string | null {
  try {
    return process.platform === "win32" ? windowsPowerShellPath() : findExecutable("pwsh", null)
  } catch {
    return null
  }
}
const PROCESS_CHECK_POWERSHELL = processCheckPowerShell()

const templatePath = path.join(__dirname, "../../../packages/app-builder-lib/templates/nsis/include/allowOnlyOneInstallerInstance.nsh")
const uninstallerPath = path.join(__dirname, "../../../packages/app-builder-lib/templates/nsis/uninstaller.nsh")

let templateContent: string

const withoutComments = (text: string) =>
  text
    .split("\n")
    .filter(line => !line.trim().startsWith("#"))
    .join("\n")
let findProcessMacro: string

describe("allowOnlyOneInstallerInstance.nsh", { concurrent: false }, () => {
  beforeAll(async () => {
    templateContent = await fs.readFile(templatePath, "utf8")

    // Extract just the FIND_PROCESS macro body for targeted assertions
    const match = templateContent.match(/!macro FIND_PROCESS[\s\S]*?!macroend/)
    findProcessMacro = match ? match[0] : ""
  })

  describe("IS_POWERSHELL_AVAILABLE macro", () => {
    let availabilityMacro: string

    beforeAll(() => {
      const match = templateContent.match(/!macro IS_POWERSHELL_AVAILABLE[\s\S]*?!macroend/)
      expect(match).not.toBeNull()
      availabilityMacro = withoutComments(match![0])
    })

    // Wine's powershell.exe runs nothing and exits with 0, which FIND_PROCESS reads as "the app is running"
    // (runtime behavior: nsisPowerShellAvailabilityTest)
    test("requires the sentinel exit code 37, which only a PowerShell that ran the probe returns", () => {
      expect(availabilityMacro).toMatch(/Get-Command Get-CimInstance -ErrorAction SilentlyContinue\) \{ exit 37 \} else \{ exit 1 \}/)
      expect(availabilityMacro).toMatch(/\$\{if\} \$0 == 37\s+nsExec::Exec [^\n]*Get-ExecutionPolicy -Scope Process/)
    })

    test("treats every other probe result, including 0, as unavailable", () => {
      expect(availabilityMacro).toMatch(/\$\{if\} \$0 == 37[\s\S]*?\$\{else\}\s+StrCpy \$0 1\s+\$\{endIf\}/)
    })
  })

  describe("FIND_PROCESS macro — PowerShell path", () => {
    test("uses path-based matching (not name-based)", () => {
      expect(findProcessMacro).toContain("$$_.Path -and ($processPathFilter)")
    })

    test("exits with 0 when matching processes found, 1 when not", () => {
      expect(findProcessMacro).toContain("exit 0")
      expect(findProcessMacro).toContain("exit 1")
    })
  })

  describe("FIND_PROCESS macro — fallback path (PowerShell unavailable)", () => {
    test("does NOT use find.exe (substring match) for process detection", () => {
      // find.exe does an unanchored substring search and causes false positives
      // when another running process name *contains* the app name
      expect(findProcessMacro).not.toContain('"$FindPath"')
      expect(findProcessMacro).not.toContain("find.exe")
    })

    test("does NOT use nsProcess::FindProcess (partial name match) in fallback", () => {
      // nsProcess::FindProcess matches by process name substring, not full path,
      // causing false positives when e.g. "FooHelper.exe" is running and app is "Foo.exe"
      expect(findProcessMacro).not.toContain("nsProcess::FindProcess")
    })

    test("uses findstr with /B flag for anchored CSV-column exact match", () => {
      // findstr /B anchors the search to the start of each line.
      // Combined with the quoted CSV field pattern, this matches only exact process names.
      expect(findProcessMacro).toContain("findstr.exe")
      expect(findProcessMacro).toContain("/B")
      expect(findProcessMacro).toContain("/I")
    })

    test("uses tasklist /FO CSV /NH so findstr only sees data rows", () => {
      expect(findProcessMacro).toContain("/FO CSV /NH")
    })

    test("findstr pattern is anchored with quoted field boundary", () => {
      // The pattern /C:"\"${_FILE}\"" matches lines starting with "Foo.exe"
      // (i.e. the exact CSV column format), not substrings like "FooHelper.exe"
      expect(findProcessMacro).toContain('/C:"\\\"${_FILE}\\\""') // eslint-disable-line no-useless-escape
      // cross-check: the raw file text contains backslash-quote around the filename
      expect(findProcessMacro).toMatch(/\/C:"\\".+?\\"/)
    })
  })

  describe("CHECK_APP_RUNNING macro", () => {
    test("customCheckAppRunning escape hatch is preserved", () => {
      expect(templateContent).toContain("!ifmacrodef customCheckAppRunning")
      expect(templateContent).toContain("!insertmacro customCheckAppRunning")
    })

    test("FindPath variable is removed (no longer used after fix)", () => {
      expect(templateContent).not.toContain("FindPath")
    })

    test("CmdPath and PowerShellPath variables are declared", () => {
      const checkMacro = templateContent.match(/!macro CHECK_APP_RUNNING[\s\S]*?!macroend/)
      expect(checkMacro).not.toBeNull()
      expect(checkMacro![0]).toContain("Var /GLOBAL CmdPath")
      expect(checkMacro![0]).toContain("Var /GLOBAL PowerShellPath")
    })

    test("path filter matches $INSTDIR with a trailing backslash (no sibling-directory false positives)", () => {
      const checkMacro = templateContent.match(/!macro CHECK_APP_RUNNING[\s\S]*?!macroend/)
      expect(checkMacro).not.toBeNull()
      expect(checkMacro![0]).toContain("$$_.Path.StartsWith('$R8\\', 'CurrentCultureIgnoreCase')")
    })

    test("escapes single quotes in $INSTDIR for the single-quoted PowerShell literal (pre-existing since #9069)", () => {
      const checkMacro = templateContent.match(/!macro CHECK_APP_RUNNING[\s\S]*?!macroend/)
      expect(checkMacro).not.toBeNull()
      // ' -> '' so a quote in the install path cannot terminate the PowerShell string
      expect(checkMacro![0]).toContain(`\${WordReplace} $R8 "'" "''" "+" $R8`)
      // the raw $INSTDIR is never interpolated into the filter
      expect(checkMacro![0]).not.toContain("StartsWith('$INSTDIR")
    })

    test("strips trailing backslashes from $INSTDIR before appending the separator (e.g. /D=C:\\path\\)", () => {
      const checkMacro = templateContent.match(/!macro CHECK_APP_RUNNING[\s\S]*?!macroend/)
      expect(checkMacro).not.toBeNull()
      const body = checkMacro![0]
      const copyIndex = body.indexOf("StrCpy $R8 $INSTDIR")
      const trimIndex = body.indexOf("!insertmacro TRIM_TRAILING_BACKSLASHES $R8 $R9")
      const buildIndex = body.indexOf("StartsWith('$R8\\'")
      expect(copyIndex).toBeGreaterThan(-1)
      expect(trimIndex).toBeGreaterThan(copyIndex)
      expect(buildIndex).toBeGreaterThan(trimIndex)
    })

    test("$INSTDIR normalization/escaping applies to the uninstaller too (outside the BUILD_UNINSTALLER guard)", () => {
      const checkMacro = templateContent.match(/!macro CHECK_APP_RUNNING[\s\S]*?!macroend/)
      expect(checkMacro).not.toBeNull()
      const body = checkMacro![0]
      const escapeIndex = body.indexOf(`\${WordReplace} $R8`)
      const guardIndex = body.indexOf("!ifndef BUILD_UNINSTALLER")
      expect(escapeIndex).toBeGreaterThan(-1)
      expect(guardIndex).toBeGreaterThan(-1)
      expect(escapeIndex).toBeLessThan(guardIndex)
      // the scratch register is saved/restored outside the guard as well
      expect(body.indexOf("Push $R8")).toBeLessThan(guardIndex)
      expect(body.indexOf("Pop $R8")).toBeGreaterThan(body.indexOf("!endif"))
    })

    test("path filter also covers previous per-user and per-machine install locations, installer only (#10022)", () => {
      const checkMacro = templateContent.match(/!macro CHECK_APP_RUNNING[\s\S]*?!macroend/)
      expect(checkMacro).not.toBeNull()
      expect(checkMacro![0]).toContain("!insertmacro APPEND_INSTALL_LOCATION_TO_PROCESS_PATH_FILTER HKCU")
      expect(checkMacro![0]).toContain("!insertmacro APPEND_INSTALL_LOCATION_TO_PROCESS_PATH_FILTER HKLM")
      // the uninstaller must keep matching only its own $INSTDIR
      expect(checkMacro![0]).toContain("!ifndef BUILD_UNINSTALLER")
    })
  })

  describe("APPEND_INSTALL_LOCATION_TO_PROCESS_PATH_FILTER macro", () => {
    let appendMacro: string

    beforeAll(() => {
      const match = templateContent.match(/!macro APPEND_INSTALL_LOCATION_TO_PROCESS_PATH_FILTER[\s\S]*?!macroend/)
      appendMacro = match ? match[0] : ""
    })

    test("skips empty InstallLocation so an empty prefix can never match every process", () => {
      expect(appendMacro).toContain('$R9 != ""')
    })

    test("skips InstallLocation equal to the $INSTDIR prefix already in the filter (deduped after normalization)", () => {
      expect(appendMacro).toContain("$R7 != $R8")
    })

    test("strips trailing backslashes from InstallLocation before appending the separator", () => {
      const readIndex = appendMacro.indexOf("ReadRegStr $R9")
      const trimIndex = appendMacro.indexOf("!insertmacro TRIM_TRAILING_BACKSLASHES $R9 $R7")
      const emptyCheckIndex = appendMacro.indexOf('$R9 != ""')
      expect(readIndex).toBeGreaterThan(-1)
      // trimming happens right after the registry read, so an all-backslash value is also
      // caught by the empty-value guard
      expect(trimIndex).toBeGreaterThan(readIndex)
      expect(emptyCheckIndex).toBeGreaterThan(trimIndex)
    })

    test("escapes single quotes in InstallLocation for the single-quoted PowerShell literal (no syntax break / injection)", () => {
      // ' -> '' so a quote in the registry value cannot terminate the PowerShell string
      expect(appendMacro).toContain(`\${WordReplace} $R9 "'" "''" "+" $R7`)
      // the escaped value ($R7), not the raw one ($R9), is interpolated into the filter
      expect(appendMacro).toContain("$$_.Path.StartsWith('$R7\\', 'CurrentCultureIgnoreCase')")
      expect(appendMacro).not.toContain("StartsWith('$R9")
    })

    test("skips InstallLocation values containing a double quote (invalid in paths, would break the -Command argument)", () => {
      expect(appendMacro).toContain(`\${WordReplace} $R9 '"' "" "+" $R7`)
      expect(appendMacro).toContain("$R9 == $R7")
    })

    test("WordFunc.nsh is included for ${WordReplace}", () => {
      expect(templateContent).toContain('!include "WordFunc.nsh"')
    })
  })

  describe("TRIM_TRAILING_BACKSLASHES macro", () => {
    test("inspects the last character and drops it while it is a backslash (also terminates on empty value)", () => {
      const match = templateContent.match(/!macro TRIM_TRAILING_BACKSLASHES[\s\S]*?!macroend/)
      expect(match).not.toBeNull()
      const body = match![0]
      // StrCpy <temp> <var> 1 -1 reads the last character (empty string yields "", which breaks the loop)
      expect(body).toContain("StrCpy ${_TEMP} ${_VAR} 1 -1")
      expect(body).toContain('${_TEMP} != "\\"')
      // StrCpy <var> <var> -1 drops the last character
      expect(body).toContain("StrCpy ${_VAR} ${_VAR} -1")
    })
  })

  describe("KILL_PROCESS macro", () => {
    test("PowerShell path uses the same path-based filter as FIND_PROCESS", () => {
      const killMacro = templateContent.match(/!macro KILL_PROCESS[\s\S]*?!macroend/)
      expect(killMacro).not.toBeNull()
      expect(killMacro![0]).toContain("$$_.Path -and ($processPathFilter)")
    })

    test("starts taskkill by absolute path, with the force flag, in both install modes", () => {
      const killMacro = templateContent.match(/!macro KILL_PROCESS[\s\S]*?!macroend/)
      expect(killMacro).not.toBeNull()
      const body = killMacro![0]
      // a bare name is looked up in the installer's directory and the current directory first
      expect(withoutComments(body)).not.toMatch(/[`\s]taskkill[\s`]/)
      expect(body).toContain('nsExec::Exec `"$SYSDIR\\taskkill.exe" $0 /IM "${_FILE}" /FI "PID ne $pid"`')
      expect(body).toContain('"$CmdPath" /S /C ""$SYSDIR\\taskkill.exe" $0 /IM')
    })
  })

  describe("FIND_PROCESS macro — program paths", () => {
    test("starts tasklist by absolute path inside cmd.exe, which keeps the quoted paths with /S", () => {
      expect(withoutComments(findProcessMacro)).not.toMatch(/[`\s]tasklist[\s`]/)
      expect(findProcessMacro.match(/"\$CmdPath" \/S \/C ""\$SYSDIR\\tasklist\.exe" /g)).toHaveLength(2)
    })
  })

  describe("PowerShell module path", () => {
    test("every PowerShell command first sets PSModulePath to the modules of the PowerShell it runs in", () => {
      const calls = powerShellCalls(templateContent)
      // availability probe, execution policy probe, FIND_PROCESS, KILL_PROCESS
      expect(calls).toHaveLength(4)
      for (const call of calls) {
        expect(call).toContain(` -C "${FIXED_MODULE_PATH}`)
      }
    })

    // the commands as PowerShell receives them, matching no process, run with a module that exports the cmdlets they use planted in the
    // inherited PSModulePath (as a user can in their own Documents folder or environment)
    test.runIf(PROCESS_CHECK_POWERSHELL != null)("no command auto-loads a module from the inherited PSModulePath", { timeout: 120_000 }, async ({ tmpDir }) => {
      const powerShell = PROCESS_CHECK_POWERSHELL ?? ""
      const dir = await tmpDir.getTempDir({ prefix: "nsis-psmodulepath" })
      const marker = path.join(dir, "planted-module-loaded")
      const moduleDir = path.join(dir, "modules", "CimCmdlets")
      await fs.mkdir(moduleDir, { recursive: true })
      const cmdlets = ["Get-CimInstance", "Get-ExecutionPolicy", "Stop-Process"]
      await fs.writeFile(
        path.join(moduleDir, "CimCmdlets.psm1"),
        `[IO.File]::WriteAllText('${marker.replace(/'/g, "''")}', 'loaded')\n${cmdlets.map(name => `function ${name} { 'Unrestricted' }`).join("\n")}\n`
      )
      await fs.writeFile(
        path.join(moduleDir, "CimCmdlets.psd1"),
        `@{ RootModule = 'CimCmdlets.psm1'; ModuleVersion = '9.9.9'; FunctionsToExport = @(${cmdlets.map(name => `'${name}'`).join(", ")}) }\n`
      )
      const env: NodeJS.ProcessEnv = {}
      // Windows environment variable names are case-insensitive, the keys of process.env copied here are not
      for (const [key, value] of Object.entries(process.env)) {
        if (key.toLowerCase() !== "psmodulepath") {
          env[key] = value
        }
      }
      env.PSModulePath = path.join(dir, "modules")
      const run = (command: string) => {
        spawnSync(powerShell, ["-NoProfile", "-NonInteractive", "-Command", command], { env, stdio: "ignore", timeout: 60_000 })
        return existsSync(marker)
      }

      const commands = powerShellCalls(templateContent).map(call => {
        const command = call.match(/ -C "(.*)"`$/)?.[1]
        expect(command, call).toBeDefined()
        // NSIS variables: a filter matching no process and no -Force; then NSIS's $$ escape
        return (command ?? "")
          .replaceAll("$processPathFilter", () => "$false")
          .replaceAll(" $0 ", () => " ")
          .replaceAll("$$", () => "$")
      })
      for (const command of commands) {
        expect(run(command), command).toBe(false)
      }
      // without the fixed module path, the planted module is loaded
      const findProcess = commands[2]
      expect(findProcess).toContain("Get-CimInstance")
      expect(
        run(
          findProcess.replace(
            FIXED_MODULE_PATH.replaceAll("$$", () => "$"),
            ""
          )
        )
      ).toBe(true)
    })
  })

  test("snapshot of FIND_PROCESS macro", () => {
    expect(findProcessMacro).toMatchSnapshot()
  })
})

describe("uninstaller.nsh — atomicRMDir", { concurrent: false }, () => {
  let uninstallerContent: string

  beforeAll(async () => {
    uninstallerContent = await fs.readFile(uninstallerPath, "utf8")
  })

  test("un.atomicRMDir function is defined", () => {
    expect(uninstallerContent).toContain("Function un.atomicRMDir")
  })

  test("stages files to $PLUGINSDIR before deletion (atomic rename)", () => {
    expect(uninstallerContent).toContain('Rename "$INSTDIR$R0\\$R2" "$PLUGINSDIR\\old-install$R0\\$R2"')
  })

  test("un.restoreFiles function is defined for rollback", () => {
    expect(uninstallerContent).toContain("Function un.restoreFiles")
  })

  test("snapshot of atomicRMDir function", () => {
    const match = uninstallerContent.match(/Function un\.atomicRMDir[\s\S]*?FunctionEnd/)
    expect(match).not.toBeNull()
    expect(match![0]).toMatchSnapshot()
  })
})
