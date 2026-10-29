import { getMakeNsisPath, getNsisPluginsPath } from "app-builder-lib/src/toolsets/nsis"
import { exec, spawnAndWriteWithOutput } from "builder-util"
import * as fs from "fs/promises"
import * as path from "path"

const templates = path.resolve(__dirname, "../../../packages/app-builder-lib/templates/nsis")
const fixture = path.resolve(__dirname, "../../fixtures/nsis-one-click-progress")

for (const nsis of [undefined, "0.0.0"] as const) {
  for (const icon of [false, true]) {
    test.ifWindows(`one-click banner hides misleading progress (${nsis ?? "latest"}, icon=${icon})`, async ({ expect, tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const installer = path.join(dir, "installer.exe")
      const makensis = await getMakeNsisPath(nsis, dir)
      const plugins = await getNsisPluginsPath(nsis, dir)
      const script = [
        "Unicode true",
        "RequestExecutionLevel user",
        "!include MUI2.nsh",
        "!include WinMessages.nsh",
        `!addincludedir "${fixture}"`,
        `!addplugindir /x86-unicode "${path.join(plugins, "x86-unicode")}"`,
        `OutFile "${installer}"`,
        'Name "One-click progress regression"',
        "!define ONE_CLICK",
        "!define SYSTYPE_PTR p",
        "!define SHELL_CONTEXT HKCU",
        '!define INSTALL_REGISTRY_KEY "Software\\electron-builder-progress-test"',
        '!define APP_EXECUTABLE_FILENAME "unused.exe"',
        '!define isForceRun `"false" == "true"`',
        ...(icon ? [`!define HEADER_ICO "${path.join(fixture, "..", "headerIcon.ico")}"`] : []),
        ...["appExe", "isTryToKeepShortcuts", "installMode", "newStartMenuLink", "launchLink"].map(name => `Var ${name}`),
        "!insertmacro MUI_PAGE_INSTFILES",
        '!insertmacro MUI_LANGUAGE "English"',
        'LangString installing 1033 "Installing, please wait..."',
        "Section",
        `!include "${path.join(templates, "installSection.nsh")}"`,
        "SectionEnd",
      ].join("\n")
      await spawnAndWriteWithOutput(makensis.path, ["-WX", "-V2", "-"], script, { env: { ...process.env, ...makensis.env } })

      // Real non-silent NSIS UI and SpiderBanner, but no installation, registry writes, or elevation.
      await exec(installer, [], { timeout: 30_000 })
      expect(await fs.readFile(path.join(dir, "result.txt"), "utf8")).toBe("1,0,1\r\n".repeat(5))
      await exec(installer, ["/S"], { timeout: 30_000 })
      expect(await fs.readFile(path.join(dir, "result.txt"), "utf8")).toBe("silent\r\n")
    })
  }
}
