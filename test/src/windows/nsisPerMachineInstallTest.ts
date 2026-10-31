import * as fs from "fs/promises"
import * as path from "path"

const templates = path.resolve(__dirname, "../../../packages/app-builder-lib/templates/nsis")

// The statements of a template, in order, without comments.
async function statements(file: string): Promise<string[]> {
  return (await fs.readFile(path.join(templates, file), "utf8"))
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== "" && !line.startsWith("#") && !line.startsWith(";"))
}

// The per-user uninstaller and its directory can be written by the current user, so the elevated per-machine installer must not run it.
test("installSection.nsh uninstalls only the installed version of the install mode, not a per-user one", async ({ expect }) => {
  const section = await statements("installSection.nsh")
  expect(section.filter(line => /uninstallOldVersion|handleUninstallResult/.test(line))).toEqual([
    "!insertmacro uninstallOldVersion SHELL_CONTEXT",
    "!insertmacro handleUninstallResult SHELL_CONTEXT",
  ])
  expect(section.filter(line => line.includes("HKEY_CURRENT_USER") || line.includes("HKCU"))).toEqual([])
})

// A custom script that still calls uninstallOldVersion HKEY_CURRENT_USER gets nothing run in per-machine mode: the function returns
// with $R0 = 0 (success) before it reads the per-user registry.
test("uninstallOldVersion returns before reading the per-user registry in per-machine mode", async ({ expect }) => {
  const installUtil = await statements("include/installUtil.nsh")
  const start = installUtil.indexOf("Function uninstallOldVersion")
  const body = installUtil.slice(start, installUtil.indexOf("FunctionEnd", start))
  const guard = body.indexOf('${if} $installMode == "all"')
  expect(body.slice(guard, guard + 5)).toEqual(['${if} $installMode == "all"', '${andIf} $rootKey == "HKEY_CURRENT_USER"', "ClearErrors", "Return", "${endIf}"])
  expect(guard).toBeGreaterThan(body.indexOf("Exch $rootKey"))
  expect(guard).toBeGreaterThan(body.indexOf("Pop $R0"))
  expect(guard).toBeLessThan(body.findIndex(line => line.startsWith("!insertmacro readReg")))
})
