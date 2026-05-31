import * as fs from "fs/promises"
import * as path from "path"
import { beforeAll, expect } from "vitest"

const templatePath = path.join(__dirname, "../../../packages/app-builder-lib/templates/nsis/include/allowOnlyOneInstallerInstance.nsh")
const uninstallerPath = path.join(__dirname, "../../../packages/app-builder-lib/templates/nsis/uninstaller.nsh")

let templateContent: string
let findProcessMacro: string

describe("allowOnlyOneInstallerInstance.nsh", () => {
  beforeAll(async () => {
    templateContent = await fs.readFile(templatePath, "utf8")

    // Extract just the FIND_PROCESS macro body for targeted assertions
    const match = templateContent.match(/!macro FIND_PROCESS[\s\S]*?!macroend/)
    findProcessMacro = match ? match[0] : ""
  })

  describe("FIND_PROCESS macro — PowerShell path", () => {
    test("uses $INSTDIR path-based matching (not name-based)", () => {
      expect(findProcessMacro).toContain("$$_.Path.StartsWith('$INSTDIR'")
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
  })

  describe("KILL_PROCESS macro", () => {
    test("PowerShell path uses $INSTDIR path-based matching", () => {
      const killMacro = templateContent.match(/!macro KILL_PROCESS[\s\S]*?!macroend/)
      expect(killMacro).not.toBeNull()
      expect(killMacro![0]).toContain("$$_.Path.StartsWith('$INSTDIR'")
    })
  })

  test("snapshot of FIND_PROCESS macro", () => {
    expect(findProcessMacro).toMatchSnapshot()
  })
})

describe("uninstaller.nsh — atomicRMDir", () => {
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
