import { getPath7za } from "app-builder-lib/src/toolsets/7zip"
import { getMakeNsisPath, getNsisPluginsPath } from "app-builder-lib/src/toolsets/nsis"
import { exec, spawnAndWriteWithOutput } from "builder-util"
import * as fs from "fs/promises"
import * as path from "path"

const templates = path.resolve(__dirname, "../../../packages/app-builder-lib/templates/nsis")
const fixture = path.resolve(__dirname, "../../fixtures/nsis-one-click-progress")

for (const mode of ["embedded", "multi-arch", "web", "zip", "assisted"]) {
  test(`one-click extraction compiles warning-free: ${mode}`, async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "nsis-one-click-progress" })
    await fs.mkdir(dir, { recursive: true })
    const payload = path.join(dir, "payload.7z")
    await fs.writeFile(payload, "compile-only payload")
    const makensis = await getMakeNsisPath(undefined, dir)
    const plugins = await getNsisPluginsPath(undefined, dir)
    const script = [
      "Unicode true",
      "!include MUI2.nsh",
      "!include WinMessages.nsh",
      "!include x64.nsh",
      "!include WinVer.nsh",
      `!addplugindir /x86-unicode "${path.join(plugins, "x86-unicode")}"`,
      `!include "${path.join(templates, "include/extractAppPackage.nsh")}"`,
      `OutFile "${path.join(dir, "installer.exe")}"`,
      '!define PRODUCT_NAME "Progress test"',
      ...(mode === "assisted" ? [] : ["!define ONE_CLICK"]),
      ...(mode === "zip" ? ["!define ZIP_COMPRESSION", '!define COMPRESSION_METHOD "zip"'] : ['!define COMPRESSION_METHOD "7z"']),
      ...["32", ...(mode === "multi-arch" ? ["64", "ARM64"] : [])].map(arch => `!define APP_${arch} "${payload}"`),
      "!insertmacro MUI_PAGE_INSTFILES",
      '!insertmacro MUI_LANGUAGE "English"',
      'LangString appCannotBeClosed 1033 "Cannot copy"',
      ...(mode === "zip" ? ['LangString decompressionFailed 1033 "Cannot extract"'] : []),
      "Section",
      "InitPluginsDir",
      'SetOutPath "$EXEDIR\\extracted"',
      mode === "web" ? `!insertmacro extractUsing7za "${payload}"` : "!insertmacro extractEmbeddedAppPackage",
      "SectionEnd",
    ].join("\n")
    await spawnAndWriteWithOutput(makensis.path, ["-WX", "-V2", "-"], script, { env: { ...process.env, ...makensis.env } })
    const { stdout } = await spawnAndWriteWithOutput(makensis.path, ["-PPO", "-"], script, { env: { ...process.env, ...makensis.env } })
    const callback = stdout.indexOf("Nsis7z::ExtractWithCallback")
    if (mode === "zip" || mode === "assisted") {
      expect(callback).toBe(-1)
      expect(stdout).not.toContain("user32::SetWindowLongW")
    } else {
      expect(callback).toBeGreaterThan(stdout.indexOf("user32::SetWindowLongW"))
      expect(stdout.indexOf("user32::SetWindowLongW")).toBeGreaterThan(0)
    }
  })
}

for (const nsis of [undefined, "0.0.0"] as const) {
  for (const icon of [false, true]) {
    test.ifWindows(`one-click banner progress never decreases (${nsis ?? "latest"}, icon=${icon})`, async ({ expect, tmpDir }) => {
      const dir = await tmpDir.getTempDir({ prefix: "nsis-one-click-progress" })
      const payloadDir = path.join(dir, "payload")
      await fs.mkdir(payloadDir, { recursive: true })
      for (let i = 0; i < 8; i++) {
        await fs.writeFile(path.join(payloadDir, `${i}.txt`), Buffer.alloc(1024 * 1024, i))
      }
      await exec(await getPath7za(), ["a", "-t7z", "-ms=off", path.join(dir, "payload.7z"), `${payloadDir}${path.sep}*`])
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
        `!include "${path.join(templates, "include/extractAppPackage.nsh")}"`,
        '!define PRODUCT_NAME "Progress test"',
        'LangString appCannotBeClosed 1033 "Cannot copy"',
        "Section",
        `!include "${path.join(templates, "installSection.nsh")}"`,
        "SectionEnd",
      ].join("\n")
      // Observe real callback positions; all production instructions and both plugins remain unchanged.
      const extraction = await fs.readFile(path.join(templates, "include/extractAppPackage.nsh"), "utf8")
      const observed = extraction.replace(
        "SendMessage $R3 ${PBM_SETPOS} $R6 0",
        'SendMessage $R3 ${PBM_SETPOS} $R6 0\nSendMessage $R3 ${PBM_GETPOS} 0 0 $0\nFileWrite $9 "progress:$0$\\r$\\n"'
      )
      const observedPath = path.join(dir, "observed-extraction.nsh")
      await fs.writeFile(observedPath, observed)
      await spawnAndWriteWithOutput(makensis.path, ["-WX", "-V2", "-"], script.replace(path.join(templates, "include/extractAppPackage.nsh"), observedPath), {
        env: { ...process.env, ...makensis.env },
      })

      // Real non-silent NSIS UI and SpiderBanner, but no installation, registry writes, or elevation.
      await exec(installer, [], { timeout: 30_000 })
      const output = (await fs.readFile(path.join(dir, "result.txt"), "utf8")).trim().split(/\r?\n/)
      const lines = output.filter(line => !line.startsWith("progress:"))
      const progress = output.filter(line => line.startsWith("progress:")).map(line => Number(line.slice("progress:".length)))
      expect(progress.length).toBeGreaterThan(1)
      expect(progress.some(value => value > 0 && value < 30000)).toBe(true)
      expect(progress).toEqual([...progress].sort((a, b) => a - b))
      expect(await fs.readFile(path.join(dir, "registers.txt"), "utf8")).toBe("preserved-2,preserved-3,preserved-4,preserved-5,preserved-6,preserved-7")
      expect(lines.filter((_, i) => i % 2 === 0)).toEqual(Array(3).fill("1,1,1"))
      const positions = lines.filter((_, i) => i % 2 === 1).map(Number)
      expect(positions[0]).toBeGreaterThan(0)
      expect(progress[0]).toBeGreaterThanOrEqual(positions[0])
      expect(progress[progress.length - 1]).toBeLessThanOrEqual(positions[1])
      expect(positions[1]).toBe(30000)
      expect(positions[2]).toBeGreaterThanOrEqual(positions[1])
      for (let i = 0; i < 8; i++) {
        expect((await fs.readFile(path.join(dir, "extracted", `${i}.txt`))).equals(Buffer.alloc(1024 * 1024, i))).toBe(true)
      }
      await exec(installer, ["/S"], { timeout: 30_000 })
      for (let i = 0; i < 8; i++) {
        expect((await fs.readFile(path.join(dir, "extracted-silent", `${i}.txt`))).equals(Buffer.alloc(1024 * 1024, i))).toBe(true)
      }
      expect(await fs.readFile(path.join(dir, "result.txt"), "utf8")).toBe("silent\r\n")
    })
  }
}
