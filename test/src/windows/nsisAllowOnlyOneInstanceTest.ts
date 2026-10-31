import { getMakeNsisPath } from "app-builder-lib/src/toolsets/nsis"
import { spawnSync } from "child_process"
import * as fs from "fs/promises"
import * as path from "path"
import { beforeAll, expect } from "vitest"

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

    test("treats Wine's zero exit as unavailable without masking failures", () => {
      expect(availabilityMacro).toMatch(/\$\{if\} \$0 == 37[\s\S]*?\$\{elseIf\} \$0 == 0\s+StrCpy \$0 1\s+\$\{endIf\}/)
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

  test("bounds every PowerShell invocation with an inactivity timeout", () => {
    const calls = templateContent.split("\n").filter(line => line.includes("nsExec::Exec") && line.includes('"$PowerShellPath"'))
    expect(calls).toHaveLength(4)
    for (const call of calls) {
      expect(call).toContain("/TIMEOUT=${APP_PROCESS_QUERY_TIMEOUT}")
    }
    expect(templateContent).toContain("!define /ifndef APP_PROCESS_QUERY_TIMEOUT 30000")
  })

  // Check ordered branches, not just the presence of an abort somewhere in the file.
  const instructions = (body: string) => body.replace(/#.*$/gm, "").replace(/\s+/g, " ").trim()

  test("failed FIND cannot reach name-based fallback or be treated as absence", () => {
    expect(instructions(findProcessMacro)).toContain(
      "Pop ${_RETURN} ${if} ${_RETURN} != 0 ${andIf} ${_RETURN} != 1 !insertmacro ABORT_PROCESS_CHECK ${endIf} ${endIf} ${if} $IsPowerShellAvailable != 0"
    )
    expect(findProcessMacro).not.toMatch(/StrCpy\s+\$IsPowerShellAvailable/)
  })

  test("KILL timeout or launch error restores registers and aborts, numeric exits allow rechecking", () => {
    const killMacro = templateContent.match(/!macro KILL_PROCESS[\s\S]*?!macroend/)![0]
    expect(instructions(killMacro)).toContain("!macro KILL_PROCESS _FILE _FORCE Push $0 Push $1")
    expect(instructions(killMacro)).toContain(
      'Pop $1 ${if} $1 == "timeout" ${orIf} $1 == "error" Pop $1 Pop $0 !insertmacro ABORT_PROCESS_CHECK ${endIf} ${endIf} ${if} $IsPowerShellAvailable != 0'
    )
    expect(instructions(killMacro)).toMatch(/Pop \$1 \$\{endIf\} Pop \$1 Pop \$0 !macroend$/)
    expect(killMacro).not.toMatch(/StrCpy\s+\$IsPowerShellAvailable/)
    expect(killMacro).toContain('StrCpy $0 "/F"')
    expect(killMacro).toContain('/FI "USERNAME eq %USERNAME%"')
  })

  test("either availability probe timeout aborts before normal unavailable fallback", () => {
    const availability = instructions(templateContent.match(/!macro IS_POWERSHELL_AVAILABLE[\s\S]*?!macroend/)![0])
    expect(availability).toMatch(/Pop \$0 \$\{if\} \$0 == 37 nsExec::Exec/)
    expect(availability).toContain(
      'Pop $0 ${elseIf} $0 == 0 StrCpy $0 1 ${endIf} ${if} $0 != 0 ${andIf} $0 != 1 ${andIf} $0 != "error" !insertmacro ABORT_PROCESS_CHECK ${endIf} ${if} $0 != 0 StrCpy $0 1 ${endIf} StrCpy $IsPowerShellAvailable $0'
    )
  })

  test("failure shows a localized check-failed message and quits even in silent mode", async () => {
    const abort = instructions(templateContent.match(/!macro ABORT_PROCESS_CHECK[\s\S]*?!macroend/)![0])
    expect(abort).toBe('!macro ABORT_PROCESS_CHECK MessageBox MB_OK|MB_ICONEXCLAMATION "$(appProcessCheckFailed)" /SD IDOK SetErrorLevel 2 Quit !macroend')
    const messages = await fs.readFile(path.join(path.dirname(templatePath), "../messages.yml"), "utf8")
    const message = messages.match(/^appProcessCheckFailed:\n(?:[ \t]+.*\n)+/m)?.[0]
    expect(message).toContain("Could not check whether ${PRODUCT_NAME} is running.")
    expect(message).toContain("Setup will now exit.")
    expect(message).not.toMatch(/Retry/i)
  })

  test("FIND distinguishes CIM query failures from an absent process", () => {
    expect(findProcessMacro).toContain(' -C "try {')
    expect(findProcessMacro).toContain("Get-CimInstance -ClassName Win32_Process -ErrorAction Stop")
    expect(findProcessMacro).toContain("{ exit 0 } else { exit 1 } } catch { exit 3 }")
  })

  for (const [probe, policy, expected] of [
    ["37", "0", 10],
    ["37", "1", 11],
    ["0", "0", 11],
    ["1", "0", 11],
    ["error", "0", 11],
    ["timeout", "0", 2],
    ["7", "0", 2],
    ["37", "timeout", 2],
    ["37", "7", 2],
  ] as const) {
    test.runIf(process.platform === "win32")(`native availability results ${probe}/${policy}`, async ({ tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const makensis = await getMakeNsisPath("0.0.0", dir)
      const exe = path.join(dir, "availability.exe")
      const results = [probe, policy]
      const availability = templateContent.match(/!macro IS_POWERSHELL_AVAILABLE[\s\S]*?!macroend/)![0].replace(/^\s*nsExec::Exec.*$/gm, () => `\n    Push "${results.shift()}"`)
      const script = [
        "Unicode true",
        "RequestExecutionLevel user",
        "SilentInstall silent",
        `OutFile "${exe}"`,
        '!include "LogicLib.nsh"',
        'LangString appProcessCheckFailed 1033 "Process check failed."',
        templateContent.match(/!macro ABORT_PROCESS_CHECK[\s\S]*?!macroend/)![0],
        availability,
        "Section",
        "!insertmacro IS_POWERSHELL_AVAILABLE",
        "IntOp $0 $IsPowerShellAvailable + 10",
        "SetErrorLevel $0",
        "SectionEnd",
      ].join("\n")
      const env = { SystemRoot: process.env.SystemRoot, TEMP: dir, TMP: dir, ...makensis.env }
      const compiled = spawnSync(makensis.path, ["/WX", "/V2", "-"], { input: script, encoding: "utf8", env, timeout: 20000 })
      expect(compiled.stdout + compiled.stderr).not.toMatch(/warning|error/i)
      expect(compiled.status).toBe(0)
      expect(spawnSync(exe, [], { env, timeout: 10000 }).status).toBe(expected)
    })
  }

  // Execute the actual NSIS branch/stack handling with a deterministic nsExec result.
  // Real timeout and process-lifetime behavior needs a separate native fixture.
  for (const result of ["0", "1", "7", "timeout", "error"]) {
    test.runIf(process.platform === "win32")(`native KILL result ${result}`, async ({ tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const makensis = await getMakeNsisPath("0.0.0", dir)
      const exe = path.join(dir, "kill-result.exe")
      const kill = templateContent.match(/!macro KILL_PROCESS[\s\S]*?!macroend/)![0].replace(/^\s*nsExec::Exec.*$/gm, `    Push "${result}"`)
      const abort = templateContent.match(/!macro ABORT_PROCESS_CHECK[\s\S]*?!macroend/)![0]
      const script = [
        "Unicode true",
        "RequestExecutionLevel user",
        "SilentInstall silent",
        `OutFile "${exe}"`,
        '!include "LogicLib.nsh"',
        "Var IsPowerShellAvailable",
        'LangString appProcessCheckFailed 1033 "Process check failed. Setup will now exit."',
        abort,
        kill,
        "Section",
        "StrCpy $IsPowerShellAvailable 0",
        'StrCpy $0 "saved0"',
        'StrCpy $1 "saved1"',
        'Push "canary"',
        '!insertmacro KILL_PROCESS "unused.exe" 1',
        "Pop $R2",
        '${if} $0 != "saved0"',
        '${orIf} $1 != "saved1"',
        '${orIf} $R2 != "canary"',
        "SetErrorLevel 20",
        "Quit",
        "${endIf}",
        "SetErrorLevel 0",
        "SectionEnd",
      ].join("\n")
      const env = { SystemRoot: process.env.SystemRoot, TEMP: dir, TMP: dir, ...makensis.env }
      const compiled = spawnSync(makensis.path, ["/WX", "/V2", "-"], { input: script, encoding: "utf8", env, timeout: 20000 })
      expect(compiled.stdout + compiled.stderr).not.toMatch(/warning|error/i)
      expect(compiled.status).toBe(0)
      const run = spawnSync(exe, [], { env, timeout: 10000 })
      expect(run.status).toBe(result === "timeout" || result === "error" ? 2 : 0)
    })
  }

  for (const [name, result, presentChecks, expected, forced] of [
    ["already exited", 1, 1, 0, 0],
    ["force succeeds", 1, 2, 0, 1],
    ["still running", 1, 99, 2, 2],
    ["timeout", "timeout", 1, 2, 0],
    ["launch error", "error", 1, 2, 0],
  ] as const) {
    test.runIf(process.platform === "win32")(`native process recheck loop: ${name}`, async ({ tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const makensis = await getMakeNsisPath("0.0.0", dir)
      const exe = path.join(dir, "process-loop.exe")
      const report = path.join(dir, "forced.txt")
      const kill = templateContent
        .match(/!macro KILL_PROCESS[\s\S]*?!macroend/)![0]
        .replace(/^\s*nsExec::Exec.*$/gm, `\n    IntOp $R4 $R4 + \${_FORCE}\n    FileOpen $R6 "${report}" w\n    FileWrite $R6 $R4\n    FileClose $R6\n    Push "${result}"`)
      const body = templateContent
        .match(/!macro _CHECK_APP_RUNNING_BODY[\s\S]*?!macroend/)![0]
        .replace(/\$\{GetProcessInfo\}[^\n]+/, 'StrCpy $3 "launcher.exe"')
        .replace(/\$\{isUpdated\}/g, "1 == 1")
        .replace(/^\s*Sleep \d+/gm, "")
      const script = [
        "Unicode true",
        "RequestExecutionLevel user",
        "SilentInstall silent",
        `OutFile "${exe}"`,
        '!include "LogicLib.nsh"',
        '!define APP_EXECUTABLE_FILENAME "unused.exe"',
        '!define PRODUCT_NAME "Fixture"',
        "Var IsPowerShellAvailable",
        ...["appProcessCheckFailed", "appRunning", "appClosing", "appCannotBeClosed"].map(name => `LangString ${name} 1033 "${name}"`),
        templateContent.match(/!macro ABORT_PROCESS_CHECK[\s\S]*?!macroend/)![0],
        kill,
        "!macro FIND_PROCESS _FILE _RETURN",
        "IntOp $R5 $R5 + 1",
        `\${if} $R5 <= ${presentChecks}`,
        "StrCpy ${_RETURN} 0",
        "${else}",
        "StrCpy ${_RETURN} 1",
        "${endIf}",
        "!macroend",
        body,
        "Section",
        "StrCpy $IsPowerShellAvailable 0",
        "StrCpy $R4 0",
        "StrCpy $R5 0",
        '!insertmacro _CHECK_APP_RUNNING_BODY ""',
        "SetErrorLevel 0",
        "SectionEnd",
      ].join("\n")
      const env = { SystemRoot: process.env.SystemRoot, TEMP: dir, TMP: dir, ...makensis.env }
      const compiled = spawnSync(makensis.path, ["/WX", "/V2", "-"], { input: script, encoding: "utf8", env, timeout: 20000 })
      expect(compiled.stdout + compiled.stderr).not.toMatch(/warning|error/i)
      expect(compiled.status).toBe(0)
      expect(spawnSync(exe, [], { env, timeout: 10000 }).status).toBe(expected)
      expect(await fs.readFile(report, "utf8")).toBe(String(forced))
    })
  }

  test.runIf(process.platform === "win32").each([
    ["absent", "", 1],
    ["one CIM process", "New-CimInstance -ClientOnly -ClassName Win32_Process -Property @{ Path = 'fixture' }", 0],
    ["multiple CIM processes", "1..2 | % { New-CimInstance -ClientOnly -ClassName Win32_Process -Property @{ Path = 'fixture' } }", 0],
    ["query error", "Write-Error 'simulated CIM failure'", 3],
  ] as const)("PowerShell FIND contract: %s", (_name, output, expected) => {
    const command = findProcessMacro
      .match(/-C "([^\n]+)"`/)![1]
      .replaceAll("$$", "$")
      .replace("$processPathFilter", "$true")
    // Real CimInstance objects lack scalar .Count in Windows PowerShell 5.1; a hashtable hides that regression.
    // A function-local CIM stub also produces a non-terminating error without changing WMI.
    const stub = `function Get-CimInstance { [CmdletBinding()] param([string] $ClassName) ${output} }; `
    const systemRoot = process.env.SystemRoot!
    const run = spawnSync(path.join(systemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"), ["-NoProfile", "-NonInteractive", "-Command", stub + command], {
      env: { SystemRoot: systemRoot, SystemDrive: path.parse(systemRoot).root.slice(0, -1), TEMP: process.env.TEMP, TMP: process.env.TMP, USERPROFILE: process.env.USERPROFILE },
      timeout: 15000,
    })
    expect(run.status).toBe(expected)
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
