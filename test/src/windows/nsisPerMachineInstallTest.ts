import { Configuration, WinPackager } from "app-builder-lib"
import { NsisTarget } from "app-builder-lib/src/targets/win/nsis/NsisTarget"
import { AppPackageHelper, CopyElevateHelper } from "app-builder-lib/src/targets/win/nsis/nsisUtil"
import { log } from "builder-util"
import * as fs from "fs/promises"
import * as path from "path"
import { TmpDir } from "temp-file"
import { afterEach, beforeEach, vi } from "vitest"

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

describe("warning for custom scripts that act on a per-user installation", () => {
  const WARNING_KEY = "nsis-per-machine-per-user-uninstall"

  beforeEach(() => {
    log.resetLimits(WARNING_KEY)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // A real NsisTarget over a minimal fake Packager (the pattern of nsisUseZipTest.ts), with the given files in its build resources dir.
  async function createTarget(tmpDir: TmpDir, config: Configuration, buildFiles: Record<string, string>, targetName = "nsis"): Promise<NsisTarget> {
    const projectDir = await tmpDir.getTempDir({ prefix: "nsis-per-user-hooks" })
    const buildResourcesDir = path.join(projectDir, "build")
    await fs.mkdir(buildResourcesDir, { recursive: true })
    for (const [name, content] of Object.entries(buildFiles)) {
      await fs.writeFile(path.join(buildResourcesDir, name), content)
    }
    const fakePackagerInfo = {
      config: { appId: "org.electron-builder.testApp", ...config },
      metadata: { name: "TestApp", productName: "Test App", version: "1.1.0", description: "Test Application", author: { name: "Foo Bar" } },
      devMetadata: null,
      options: {},
      projectDir,
      buildResourcesDir,
      relativeBuildResourcesDirname: "build",
      repositoryInfo: Promise.resolve(null),
      tempDirManager: tmpDir,
      framework: { defaultAppIdPrefix: "com.electron." },
    }
    return new NsisTarget(new WinPackager(fakePackagerInfo as any), projectDir, targetName, new AppPackageHelper(new CopyElevateHelper()))
  }

  async function warnings(target: NsisTarget): Promise<Array<unknown>> {
    const warn = vi.spyOn(log, "warn")
    await (target as any).warnAboutPerUserUninstallHooks()
    return warn.mock.calls.map(call => call[1])
  }

  const LINK = "https://www.electron.build/docs/migration/v27-runtime-changes#nsis-a-per-machine-install-leaves-a-per-user-install-in-place"

  test("warns once per process when a custom include defines customUnInstallCheckCurrentUser", async ({ expect, tmpDir }) => {
    const include = "!macro customUnInstallCheckCurrentUser\n  DetailPrint `per-user uninstall result: $R0`\n!macroend\n"
    const warn = vi.spyOn(log, "warn")
    const target = await createTarget(tmpDir, {}, { "installer.nsh": include })
    await (target as any).warnAboutPerUserUninstallHooks()
    await (target as any).warnAboutPerUserUninstallHooks()
    await ((await createTarget(tmpDir, {}, { "installer.nsh": include })) as any).warnAboutPerUserUninstallHooks()

    expect(warn).toHaveBeenCalledTimes(1)
    const [fields, message] = warn.mock.calls[0]
    expect(fields).toMatchObject({ uses: "customUnInstallCheckCurrentUser" })
    expect(message).toMatch(/^electron-builder v27: a per-machine NSIS installer no longer runs or acts on a per-user installation of the app\./)
    expect(message).toMatch(new RegExp(`See ${LINK.replace(/[.?]/g, "\\$&")}$`))
  })

  test("warns when a custom installer script calls uninstallOldVersion HKEY_CURRENT_USER", async ({ expect, tmpDir }) => {
    const script = '!insertmacro uninstallOldVersion SHELL_CONTEXT\n  !insertmacro uninstallOldVersion "HKEY_CURRENT_USER"\n'
    const target = await createTarget(tmpDir, { nsis: { oneClick: false } }, { "installer.nsi": script })
    const messages = await warnings(target)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain("uninstallOldVersion HKEY_CURRENT_USER returns without running anything in per-machine mode")
  })

  test("does not warn without a custom script, for one that does not use them, or for the portable target", async ({ expect, tmpDir }) => {
    expect(await warnings(await createTarget(tmpDir, {}, {}))).toEqual([])

    // commented-out code and the per-mode uninstall do not count
    const unrelated = "# !macro customUnInstallCheckCurrentUser\n; !insertmacro uninstallOldVersion HKEY_CURRENT_USER\n!macro customUnInstallCheck\n!macroend\n"
    expect(await warnings(await createTarget(tmpDir, {}, { "installer.nsh": unrelated }))).toEqual([])

    const include = "!macro customUnInstallCheckCurrentUser\n!macroend\n"
    expect(await warnings(await createTarget(tmpDir, { portable: { include: "installer.nsh" } }, { "installer.nsh": include }, "portable"))).toEqual([])
    // nothing above used up the once-per-process warning
    expect(await warnings(await createTarget(tmpDir, {}, { "installer.nsh": include }))).toHaveLength(1)
  })
})
