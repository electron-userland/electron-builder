import type { ToolsetConfig } from "app-builder-lib/internal"
import { getMakeNsisPath, getNsisPluginsPath } from "app-builder-lib/src/toolsets/nsis"
import { spawnAndWriteWithOutput } from "builder-util"
import { spawn } from "child_process"
import * as fs from "fs/promises"
import * as path from "path"

const nsisTemplates = path.resolve(__dirname, "../../../packages/app-builder-lib/templates/nsis")
const multiUserPath = path.join(nsisTemplates, "multiUser.nsh")
const installUtilPath = path.join(nsisTemplates, "include", "installUtil.nsh")

async function makensis(dir: string, script: string[], nsis?: ToolsetConfig["nsis"]): Promise<void> {
  const tool = await getMakeNsisPath(nsis, dir)
  await spawnAndWriteWithOutput(tool.path, ["-WX", "-V2", "-"], script.join("\n"), { env: { ...process.env, ...tool.env } })
}

// Runs GetDParameter of multiUser.nsh and writes the install directory it returns to resultFile.
async function compileProbe(dir: string, name: string, resultFile: string, nsis?: ToolsetConfig["nsis"]): Promise<string> {
  const probe = path.join(dir, `${name}.exe`)
  const plugins = await getNsisPluginsPath(nsis, dir)
  await makensis(
    dir,
    [
      "Unicode true",
      "RequestExecutionLevel user",
      "SilentInstall silent",
      `!addincludedir "${path.join(nsisTemplates, "include")}"`,
      `!addplugindir /x86-unicode "${path.join(plugins, "x86-unicode")}"`,
      "!include LogicLib.nsh",
      "!include StdUtils.nsh",
      // neither install mode macro is inserted, only GetDParameter
      "!define INSTALL_MODE_PER_ALL_USERS",
      // by path: NSIS ships a MultiUser.nsh of its own
      `!include "${multiUserPath}"`,
      `OutFile "${probe}"`,
      "Section",
      // declared for the install mode macros, which are not inserted here
      "  StrCpy $installMode all",
      "  !insertmacro GetDParameter $R0",
      `  FileOpen $0 "${resultFile}" w`,
      "  FileWrite $0 $R0",
      "  FileClose $0",
      "SectionEnd",
    ],
    nsis
  )
  return probe
}

// The install mode macros, which read InstallLocation and call GetDParameter. Compiled only, never run.
async function compileInstallModes(dir: string, nsis?: ToolsetConfig["nsis"]): Promise<void> {
  const plugins = await getNsisPluginsPath(nsis, dir)
  await makensis(
    dir,
    [
      "Unicode true",
      "RequestExecutionLevel user",
      "SilentInstall silent",
      `!addincludedir "${path.join(nsisTemplates, "include")}"`,
      `!addplugindir /x86-unicode "${path.join(plugins, "x86-unicode")}"`,
      "!include LogicLib.nsh",
      "!include StdUtils.nsh",
      '!define APP_GUID "nsis-d-parameter-test"',
      '!define APP_FILENAME "test-app"',
      "!define ONE_CLICK",
      "!define INSTALL_MODE_PER_ALL_USERS_REQUIRED",
      `!include "${multiUserPath}"`,
      `OutFile "${path.join(dir, "install-modes.exe")}"`,
      "Function .onInit",
      "  !insertmacro setInstallModePerUser",
      "  !insertmacro setInstallModePerAllUsers",
      "FunctionEnd",
      "Section",
      "SectionEnd",
    ],
    nsis
  )
}

// Runs the lines of uninstallOldVersion that read the old uninstaller path from UninstallString, once per value, and writes each path
// on its own line to resultFile. The lines and GetInQuotes are taken from installUtil.nsh, so the probe runs the template's code.
async function compileUninstallerPathProbe(dir: string, resultFile: string, uninstallStrings: string[], nsis?: ToolsetConfig["nsis"]): Promise<string> {
  const template = await fs.readFile(installUtilPath, "utf8")
  const getInQuotes = template.match(/Function GetInQuotes[\s\S]*?FunctionEnd\s*!macro GetInQuotes[\s\S]*?!macroend/)
  const uninstallOldVersion = template.match(/Function uninstallOldVersion[\s\S]*?FunctionEnd/)
  if (getInQuotes == null || uninstallOldVersion == null) {
    throw new Error("GetInQuotes or uninstallOldVersion not found in installUtil.nsh")
  }
  const body = uninstallOldVersion[0]
  const firstLine = "StrCpy $uninstallerFileName $uninstallString 1"
  const lastLine = '!insertmacro GetInQuotes $uninstallerFileName "$uninstallString"'
  const start = body.indexOf(firstLine)
  const end = body.indexOf(lastLine)
  if (start < 0 || end < start) {
    throw new Error("the uninstaller path lines of uninstallOldVersion not found in installUtil.nsh")
  }
  const readUninstallerPath = body.slice(start, end + lastLine.length)

  const probe = path.join(dir, "uninstaller-path.exe")
  await makensis(
    dir,
    [
      "Unicode true",
      "RequestExecutionLevel user",
      "SilentInstall silent",
      "!include WordFunc.nsh",
      getInQuotes[0],
      "Var uninstallerFileName",
      "Var uninstallerFileNameTemp",
      "Var uninstallString",
      `OutFile "${probe}"`,
      "Section",
      `  FileOpen $0 "${resultFile}" w`,
      ...uninstallStrings.flatMap(it => [`  StrCpy $uninstallString \`${it}\``, readUninstallerPath, '  FileWrite $0 "$uninstallerFileName$\\n"']),
      "  FileClose $0",
      "SectionEnd",
    ],
    nsis
  )
  return probe
}

// starts the probe like electron-updater starts the installer: child_process.spawn quotes an argument that contains a space
function run(file: string, args: string[], windowsVerbatimArguments = false): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: "ignore", timeout: 60_000, windowsVerbatimArguments })
    child.on("error", reject)
    child.on("exit", code => resolve(code))
  })
}

describe("multiUser.nsh — GetDParameter", { concurrent: false }, () => {
  test("takes the parsed argument for a quoted /D= and the raw command-line tail otherwise", async ({ expect }) => {
    const template = await fs.readFile(multiUserPath, "utf8")
    const macro = template.match(/!macro GetDParameter[\s\S]*?!macroend/)
    expect(macro).not.toBeNull()
    const body = macro![0]

    // the character before /D= tells whether the caller quoted the argument ("/D=C:\Program Files\App")
    expect(body).toContain("StrCpy $R7 $R8 1 $R7")
    const quotedIndex = body.indexOf(`\${If} $R7 == '"'`)
    const parsedIndex = body.indexOf('${StdUtils.GetParameter} $R9 "D" ""')
    const rawTailIndex = body.indexOf('StrCpy $R9 $R8 "" $R6')
    expect(quotedIndex).toBeGreaterThan(-1)
    // quoted: the raw tail would keep the closing quote, so the value comes from the parsed argument
    expect(parsedIndex).toBeGreaterThan(quotedIndex)
    // unquoted (/S /D=C:\Program Files\App): the rest of the command line, spaces included
    expect(rawTailIndex).toBeGreaterThan(parsedIndex)
  })

  test("drops a double quote from the InstallLocation that an earlier installer stored", async ({ expect }) => {
    const template = await fs.readFile(multiUserPath, "utf8")
    expect(template).toContain("!include WordFunc.nsh")
    for (const [root, variable] of [
      ["HKCU", "$perUserInstallationFolder"],
      ["HKLM", "$perMachineInstallationFolder"],
    ]) {
      const readIndex = template.indexOf(`ReadRegStr ${variable} ${root} "\${INSTALL_REGISTRY_KEY}" InstallLocation`)
      const stripIndex = template.indexOf(`\${WordReplace} ${variable} '"' "" "+" ${variable}`)
      expect(readIndex).toBeGreaterThan(-1)
      expect(stripIndex).toBeGreaterThan(readIndex)
      expect(template.indexOf(`StrCpy $INSTDIR ${variable}`)).toBeGreaterThan(stripIndex)
    }
  })

  test("removes an old version whose registry values kept the quote", async ({ expect }) => {
    const template = await fs.readFile(installUtilPath, "utf8")
    expect(template).toContain("!include WordFunc.nsh")
    const fn = template.match(/Function uninstallOldVersion[\s\S]*?FunctionEnd/)
    expect(fn).not.toBeNull()
    const body = fn![0]

    // "C:\Program Files\App"\Uninstall App.exe" /currentuser: the uninstaller path is read from the quotes, so the stray quote goes first
    const uninstallStringReadIndex = body.lastIndexOf("UninstallString")
    // the opening quote stays, so the strip runs on the rest of the value
    expect(body).not.toContain("${WordReplace} $uninstallString")
    const uninstallStringStripIndex = body.indexOf(`\${WordReplace} $uninstallerFileNameTemp '"\\' "\\" "+" $uninstallerFileNameTemp`)
    const getInQuotesIndex = body.indexOf('!insertmacro GetInQuotes $uninstallerFileName "$uninstallString"')
    expect(uninstallStringStripIndex).toBeGreaterThan(uninstallStringReadIndex)
    expect(getInQuotesIndex).toBeGreaterThan(uninstallStringStripIndex)

    // InstallLocation is passed to the old uninstaller as _?=$installationDir
    const installLocationReadIndex = body.indexOf('!insertmacro readReg $installationDir "$rootKey" "${INSTALL_REGISTRY_KEY}" InstallLocation')
    const installLocationStripIndex = body.indexOf(`\${WordReplace} $installationDir '"' "" "+" $installationDir`)
    expect(installLocationReadIndex).toBeGreaterThan(-1)
    expect(installLocationStripIndex).toBeGreaterThan(installLocationReadIndex)
    expect(body.indexOf('${if} $installationDir == ""')).toBeGreaterThan(installLocationStripIndex)
  })

  test("compiles warning-free with the current and the legacy NSIS toolset", async ({ tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "nsis-d-parameter-probe" })
    await compileProbe(dir, "probe", path.join(dir, "result.txt"))
    await compileProbe(dir, "probe-legacy", path.join(dir, "result.txt"), "0.0.0")
    await compileInstallModes(dir)
    await compileInstallModes(dir, "0.0.0")
    await compileUninstallerPathProbe(dir, path.join(dir, "result.txt"), ['"C:\\Test App\\Uninstall Test App.exe" /currentuser'])
    await compileUninstallerPathProbe(dir, path.join(dir, "result.txt"), ['"C:\\Test App\\Uninstall Test App.exe" /currentuser'], "0.0.0")
  })

  test.ifWindows("reads the old uninstaller path from an UninstallString with a stray quote, a UNC path or both", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "nsis-uninstaller-path-probe" })
    const resultFile = path.join(dir, "result.txt")
    const cases: Array<[string, string]> = [
      ['"C:\\Program Files\\Test App\\Uninstall Test App.exe" /currentuser', "C:\\Program Files\\Test App\\Uninstall Test App.exe"],
      ['"C:\\Program Files\\Test App"\\Uninstall Test App.exe" /currentuser', "C:\\Program Files\\Test App\\Uninstall Test App.exe"],
      ['"\\\\server\\share\\Test App\\Uninstall Test App.exe" /currentuser', "\\\\server\\share\\Test App\\Uninstall Test App.exe"],
      ['"\\\\server\\share\\Test App"\\Uninstall Test App.exe" /allusers', "\\\\server\\share\\Test App\\Uninstall Test App.exe"],
    ]
    const probe = await compileUninstallerPathProbe(
      dir,
      resultFile,
      cases.map(it => it[0])
    )
    expect(await run(probe, [])).toBe(0)
    expect((await fs.readFile(resultFile, "utf8")).split("\n").slice(0, -1)).toEqual(cases.map(it => it[1]))
  })

  test.ifWindows("returns the install directory electron-updater passes, with or without spaces", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "nsis-d-parameter-probe" })
    const resultFile = path.join(dir, "result.txt")
    const probe = await compileProbe(dir, "probe", resultFile)
    const getDParameter = async (args: string[], windowsVerbatimArguments?: boolean) => {
      await fs.rm(resultFile, { force: true })
      expect(await run(probe, args, windowsVerbatimArguments)).toBe(0)
      return await fs.readFile(resultFile, "utf8")
    }

    const updaterArgs = ["--updated", "/S", "--force-run", "--package-file=C:\\Users\\Test User\\AppData\\Local\\updater\\package.7z"]
    for (const installDirectory of ["C:\\Apps\\TestApp", "C:\\Program Files\\Test App", "D:\\My Apps\\Test App\\"]) {
      expect(await getDParameter([...updaterArgs, `/D=${installDirectory}`])).toBe(installDirectory)
    }
    // typed by hand, unquoted: everything after /D= is the directory (#7946)
    expect(await getDParameter(["/S /D=C:\\Program Files\\Test App"], true)).toBe("C:\\Program Files\\Test App")
    // the only argument: nothing precedes /D= to tell a quoted argument from an unquoted one
    expect(await getDParameter(["/D=C:\\Program Files\\Test App"], true)).toBe("C:\\Program Files\\Test App")
    // quoted, lowercase
    expect(await getDParameter([...updaterArgs, "/d=C:\\Program Files\\Test App"])).toBe("C:\\Program Files\\Test App")
    expect(await getDParameter(["/S"])).toBe("")
  })
})
