import { Arch, Configuration, WinPackager } from "app-builder-lib"
import type { Commands } from "app-builder-lib/src/targets/win/nsis/Commands"
import type { Defines } from "app-builder-lib/src/targets/win/nsis/Defines"
import { NsisTarget } from "app-builder-lib/src/targets/win/nsis/NsisTarget"
import { nsisEscapeString } from "app-builder-lib/src/targets/win/nsis/nsisScriptGenerator"
import { nsisTemplatesDir, UninstallerReader } from "app-builder-lib/src/targets/win/nsis/nsisUtil"
import { getMakeNsisPath } from "app-builder-lib/src/toolsets/nsis"
import { spawnAndWriteWithOutput } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { mkdir } from "fs/promises"
import * as path from "path"
import { TmpDir } from "temp-file"
import { afterEach, MockInstance, vi } from "vitest"

// nsis.allowUnelevatedPerMachineUpdate, offline: a real NsisTarget over a minimal fake Packager (as in nsisInstallerStoreTest.ts). The
// defines are captured from `effectiveOptionComputed`; the uninstaller and installer scripts are captured instead of compiled, then
// preprocessed by makensis (-PPO) to show which code each configuration gets.

afterEach(() => {
  vi.restoreAllMocks()
})

interface Script {
  defines: Defines
  commands: Commands
  script: string
}

const STOP = "stop after the installer script"

async function createTarget(tmpDir: TmpDir, nsis: Configuration["nsis"], effectiveOptionComputed?: (options: [Defines, Commands]) => Promise<boolean>) {
  const projectDir = await tmpDir.getTempDir({ prefix: "nsis-unelevated-update" })
  await mkdir(path.join(projectDir, "win-unpacked", "resources"), { recursive: true })
  const fakePackagerInfo = {
    config: { appId: "org.electron-builder.testApp", nsis },
    metadata: { name: "TestApp", productName: "Test App", version: "1.1.0", description: "Test Application", author: { name: "Foo Bar" } },
    devMetadata: null,
    options: { effectiveOptionComputed },
    projectDir,
    buildResourcesDir: path.join(projectDir, "build"),
    relativeBuildResourcesDirname: "build",
    repositoryInfo: Promise.resolve(null),
    tempDirManager: tmpDir,
    framework: { name: "electron", defaultAppIdPrefix: "com.electron." },
    cancellationToken: new CancellationToken(),
  }
  const packager = new WinPackager(fakePackagerInfo as any)
  vi.spyOn(packager, "emitArtifactBuildStarted").mockResolvedValue()
  vi.spyOn(packager, "emitArtifactBuildCompleted").mockResolvedValue()
  vi.spyOn(packager, "getIconPath").mockResolvedValue(null)
  vi.spyOn(packager, "signIf").mockResolvedValue("skipped:disabled")
  const packageHelper: any = {
    refCount: 0,
    packArch: (arch: Arch) => Promise.resolve({ fileInfo: { path: path.join(projectDir, `app-${Arch[arch]}.nsis.7z`), sha512: "" }, unpackedSize: 0, storedMemberFiles: [] }),
  }
  const target = new NsisTarget(packager, projectDir, "nsis", packageHelper)
  const build = () => (target as any).buildInstaller(new Map([[Arch.x64, path.join(projectDir, "win-unpacked")]]))
  return { target, build }
}

// whether the option reaches makensis as ALLOW_UNELEVATED_PER_MACHINE_UPDATE
async function isDefined(tmpDir: TmpDir, nsis: Configuration["nsis"]): Promise<boolean> {
  const captured: Array<Defines> = []
  const { build } = await createTarget(tmpDir, nsis, ([defines]) => {
    captured.push({ ...defines })
    // stop before makensis
    return Promise.resolve(true)
  })
  await build()
  if (captured.length !== 1) {
    throw new Error(`expected one installer, got ${captured.length}`)
  }
  return "ALLOW_UNELEVATED_PER_MACHINE_UPDATE" in captured[0]
}

// the scripts NsisTarget passes to makensis for the uninstaller and then the installer
async function captureScripts(tmpDir: TmpDir, nsis: Configuration["nsis"]): Promise<{ uninstaller: Script; installer: Script }> {
  const { target, build } = await createTarget(tmpDir, nsis)
  const scripts: Array<Script> = []
  const executeMakensis = vi.spyOn(target as any, "executeMakensis") as MockInstance<(defines: Defines, commands: Commands, script: string) => Promise<void>>
  executeMakensis.mockImplementation(async (defines, commands, script) => {
    scripts.push({ defines: { ...defines }, commands: { ...commands }, script })
    if (scripts.length === 2) {
      throw new Error(STOP)
    }
  })
  vi.spyOn(UninstallerReader, "exec").mockResolvedValue()
  await build()
  const error = await target.buildQueueManager.awaitTasks().then(
    () => null,
    (e: Error) => e
  )
  if (error?.message !== STOP) {
    throw error ?? new Error("expected the build to stop at the installer script")
  }
  return { uninstaller: scripts[0], installer: scripts[1] }
}

async function preprocess(dir: string, { defines, script }: Script, extraDefines: Partial<Defines> = {}): Promise<Array<string>> {
  const makensis = await getMakeNsisPath(undefined, dir)
  const args = ["-INPUTCHARSET", "UTF8", "-PPO"]
  for (const [name, value] of Object.entries({ ...defines, ...extraDefines }) as Array<[string, string | number | null | undefined]>) {
    args.push(value == null ? `-D${name}` : `-D${name}=${nsisEscapeString(String(value))}`)
  }
  const { stdout } = await spawnAndWriteWithOutput(makensis.path, [...args, "-"], script, { cwd: nsisTemplatesDir, env: { ...process.env, ...makensis.env } })
  return stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== "" && !line.startsWith("!verbose"))
}

// The option's code in a preprocessed script:
// - probes: the access checks (checkUnelevatedPerMachineUpdate)
// - probesPassSharingViolation: a probe that fails only with ERROR_SHARING_VIOLATION (32) doesn't clear $unelevatedAccess
// - onlyForUpdate: only a silent update (--updated) of the per-machine installation is checked
// - readsMarker: the installer skips elevation only when the installed version was built with the option
// - writesMarker: the installer records that it was
// - uninstallerElevatesFirst: setInstallModePerAllUsers elevates before it reads the installation folder, as without the option
// - uninstallerPassesExitCode: an uninstaller that elevates exits with the elevated uninstaller's exit code, which the installer waits for
function features(lines: Array<string>) {
  let uninstallerElevatesFirst = false
  lines.forEach((line, i) => {
    if (line.startsWith("ReadRegStr $perMachineInstallationFolder HKLM ")) {
      // the statements setInstallModePerAllUsers runs before it reads the folder; initMultiUser reads it too, without them
      const before = lines.slice(lines.lastIndexOf("SetShellVarContext all", i), i)
      if (!before.some(it => it.startsWith("ReadRegStr $perMachineInstallationFolder "))) {
        uninstallerElevatesFirst ||= before.includes("UAC::_ 0")
      }
    }
  })
  // the statements without LogicLib's numbered labels and its comments, to find a block of them in a row
  const statements = lines.map(line => line.replace(/_LogicLib_\w+?_\d+/g, "_LogicLib_").replace(/\s+;.*$/, ""))
  const hasBlock = (block: Array<string | RegExp>) =>
    statements.some((_, i) => block.every((expected, j) => (typeof expected === "string" ? statements[i + j] === expected : expected.test(statements[i + j] ?? ""))))
  return {
    probes: lines.some(line => line.includes("kernel32::CreateFileW")),
    probesPassSharingViolation: hasBlock([
      /^System::Call 'kernel32::CreateFileW\(w ".+", i 0x[0-9a-f]+, i 7, p 0, i 3, i 0x02000000, p 0\) p\.r0 \?e'$/,
      "Pop $1",
      "IntCmp `$0` `-1` `_LogicLib_` `` ``",
      "System::Call 'kernel32::CloseHandle(p r0)'",
      "Goto _LogicLib_",
      "_LogicLib_:",
      "IntCmp `$1` `32` `_LogicLib_` `` ``",
      'StrCpy $unelevatedAccess "0"',
    ]),
    onlyForUpdate: hasBlock([
      'StrCpy $unelevatedAccess "0"',
      "IfSilent `` `_LogicLib_`",
      "push `updated`",
      "StdUtils::TestParameter /NOUNLOAD",
      "pop $R9",
      'StrCmp "$R9" "true" `` `_LogicLib_`',
      "StrCmp `$installMode` `all` `` `_LogicLib_`",
    ]),
    readsMarker: hasBlock([/^ReadRegStr \$0 HKLM ".+" UnelevatedUpdate$/, "StrCmp `$0` `true` `_LogicLib_` ``", 'StrCpy $unelevatedAccess "0"', "_LogicLib_:"]),
    writesMarker: lines.some(line => /^WriteRegStr SHELL_CONTEXT ".+" UnelevatedUpdate "true"$/.test(line)),
    uninstallerElevatesFirst,
    uninstallerPassesExitCode: hasBlock([
      "UAC::_ 0",
      "IntCmp `$0` `0` `` `_LogicLib_` `_LogicLib_`",
      "IntCmp `$1` `1` `` `_LogicLib_` `_LogicLib_`",
      "SetErrorLevel $2",
      "_LogicLib_:",
      "Quit",
    ]),
  }
}

const none = {
  probes: false,
  probesPassSharingViolation: false,
  onlyForUpdate: false,
  readsMarker: false,
  writesMarker: false,
  uninstallerElevatesFirst: false,
  uninstallerPassesExitCode: false,
}
const uninstallerWithoutOption = { ...none, uninstallerElevatesFirst: true }

test("allowUnelevatedPerMachineUpdate is off by default", async ({ expect, tmpDir }) => {
  expect(await isDefined(tmpDir, { oneClick: false })).toBe(false)
  expect(await isDefined(tmpDir, { oneClick: false, allowUnelevatedPerMachineUpdate: false })).toBe(false)
})

test("allowUnelevatedPerMachineUpdate defines ALLOW_UNELEVATED_PER_MACHINE_UPDATE for an assisted per-user installer", async ({ expect, tmpDir }) => {
  expect(await isDefined(tmpDir, { oneClick: false, allowUnelevatedPerMachineUpdate: true })).toBe(true)
})

test("allowUnelevatedPerMachineUpdate is a configuration error with oneClick or perMachine", async ({ expect, tmpDir }) => {
  const error = "allowUnelevatedPerMachineUpdate makes sense only for assisted installer without perMachine"
  await expect(isDefined(tmpDir, { allowUnelevatedPerMachineUpdate: true })).rejects.toThrow(error)
  await expect(isDefined(tmpDir, { perMachine: true, allowUnelevatedPerMachineUpdate: true })).rejects.toThrow(error)
  await expect(isDefined(tmpDir, { oneClick: false, perMachine: true, allowUnelevatedPerMachineUpdate: true })).rejects.toThrow(error)
})

// The templates gate the option on ONE_CLICK and INSTALL_MODE_PER_ALL_USERS too, for a script that defines it directly.
const cases: Array<{ name: string; nsis: Configuration["nsis"]; extraDefines?: Partial<Defines>; installer: typeof none; uninstaller: typeof none }> = [
  { name: "assisted, option off", nsis: { oneClick: false }, installer: none, uninstaller: uninstallerWithoutOption },
  {
    name: "assisted, option on",
    nsis: { oneClick: false, allowUnelevatedPerMachineUpdate: true },
    installer: { ...none, probes: true, probesPassSharingViolation: true, onlyForUpdate: true, readsMarker: true, writesMarker: true },
    uninstaller: { ...none, probes: true, probesPassSharingViolation: true, onlyForUpdate: true, uninstallerPassesExitCode: true },
  },
  {
    name: "assisted perMachine, option defined",
    nsis: { oneClick: false, perMachine: true },
    extraDefines: { ALLOW_UNELEVATED_PER_MACHINE_UPDATE: null },
    installer: none,
    uninstaller: uninstallerWithoutOption,
  },
  {
    name: "one-click, option defined",
    nsis: {},
    extraDefines: { ALLOW_UNELEVATED_PER_MACHINE_UPDATE: null },
    installer: none,
    uninstaller: none,
  },
  {
    name: "one-click perMachine, option defined",
    nsis: { perMachine: true },
    extraDefines: { ALLOW_UNELEVATED_PER_MACHINE_UPDATE: null },
    installer: none,
    uninstaller: uninstallerWithoutOption,
  },
]

for (const { name, nsis, extraDefines, installer, uninstaller } of cases) {
  test(`allowUnelevatedPerMachineUpdate templates: ${name}`, async ({ expect, tmpDir }) => {
    const scripts = await captureScripts(tmpDir, nsis)
    const dir = await tmpDir.getTempDir({ prefix: "nsis-ppo" })
    expect({
      installer: features(await preprocess(dir, scripts.installer, extraDefines)),
      uninstaller: features(await preprocess(dir, scripts.uninstaller, extraDefines)),
    }).toStrictEqual({ installer, uninstaller })
  })
}
