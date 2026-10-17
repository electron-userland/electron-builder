import { getElectronWrapperScript, getWaylandFlags } from "app-builder-lib/src/targets/linux/FlatpakTarget"
import { spawnSync } from "child_process"
import { existsSync } from "fs"
import { chmod, writeFile } from "fs/promises"
import * as path from "path"
import { TmpDir } from "temp-file"

// Runs the generated /app/bin/electron-wrapper with a stub zypak-wrapper on the PATH, which prints its process id, TMPDIR and its
// arguments, one per line. Under dash where it is installed, which has none of bash's extensions; otherwise under /bin/sh.
const SHELL = existsSync("/bin/dash") ? "/bin/dash" : "/bin/sh"

const WAYLAND_FLAGS = ["--enable-features=UseOzonePlatform", "--ozone-platform=wayland"]

interface Run {
  /** the arguments zypak-wrapper received */
  argv: string[]
  tmpdir: string
  /** whether zypak-wrapper replaced the shell that ran the wrapper */
  execd: boolean
}

// the directory is the test's own tmpDir, removed when the test ends
async function runWrapper(tmpDir: TmpDir, script: string, launchArgs: string[], sessionType?: string): Promise<Run> {
  const dir = await tmpDir.createTempDir({ prefix: "flatpak-wrapper" })
  const stub = path.join(dir, "zypak-wrapper")
  await writeFile(stub, `#!/bin/sh\necho "$$"\necho "$TMPDIR"\nfor arg in "$@"; do printf '%s\\n' "$arg"; done\n`)
  await chmod(stub, 0o755)
  const wrapper = path.join(dir, "electron-wrapper")
  await writeFile(wrapper, script)

  const env: NodeJS.ProcessEnv = { PATH: `${dir}${path.delimiter}${process.env.PATH}`, XDG_RUNTIME_DIR: "/run/user/1000", FLATPAK_ID: "org.example.App" }
  if (sessionType != null) {
    env.XDG_SESSION_TYPE = sessionType
  }
  const result = spawnSync(SHELL, [wrapper, ...launchArgs], { env, encoding: "utf8" })
  if (result.status !== 0) {
    throw new Error(`the wrapper exited with ${result.status}: ${result.stderr}`)
  }
  const [pid, tmp, ...argv] = result.stdout.replace(/\n$/, "").split("\n")
  return { argv, tmpdir: tmp, execd: Number(pid) === result.pid }
}

describe.ifNotWindows("flatpak electron-wrapper", () => {
  test("execs zypak-wrapper with the executableArgs, quoted, before the launch arguments", async ({ expect, tmpDir }) => {
    const script = getElectronWrapperScript("testapp", ["--js-flags=--max-old-space-size=4096", "it's", "$HOME", "a b"], [])
    expect(await runWrapper(tmpDir, script, ["--file", "x y"])).toEqual({
      argv: ["testapp", "--js-flags=--max-old-space-size=4096", "it's", "$HOME", "a b", "--file", "x y"],
      tmpdir: "/run/user/1000/app/org.example.App",
      execd: true,
    })
  })

  test("without executableArgs only the launch arguments are passed", async ({ expect, tmpDir }) => {
    const script = getElectronWrapperScript("testapp", null, [])
    expect(script).toBe('#!/bin/sh\nexport TMPDIR="$XDG_RUNTIME_DIR/app/$FLATPAK_ID"\nexec zypak-wrapper "testapp" "$@"\n')
    expect((await runWrapper(tmpDir, script, [])).argv).toEqual(["testapp"])
  })

  test("the Wayland flags are added between the executableArgs and the launch arguments in a Wayland session", async ({ expect, tmpDir }) => {
    const script = getElectronWrapperScript("testapp", ["--foo"], WAYLAND_FLAGS)
    expect(await runWrapper(tmpDir, script, ["--bar"], "wayland")).toEqual({
      argv: ["testapp", "--foo", ...WAYLAND_FLAGS, "--bar"],
      tmpdir: "/run/user/1000/app/org.example.App",
      execd: true,
    })
  })

  test.for([["x11"], ["tty"], [undefined]])("the Wayland flags are left out when XDG_SESSION_TYPE is %s", async ([sessionType], { expect, tmpDir }) => {
    const script = getElectronWrapperScript("testapp", ["--foo"], WAYLAND_FLAGS)
    expect(await runWrapper(tmpDir, script, ["--bar"], sessionType)).toEqual({
      argv: ["testapp", "--foo", "--bar"],
      tmpdir: "/run/user/1000/app/org.example.App",
      execd: true,
    })
  })

  test("an executableName with shell metacharacters is rejected", ({ expect }) => {
    expect(() => getElectronWrapperScript('test"app', null, [])).toThrow(/executableName/)
  })
})

describe("flatpak useWaylandFlags", () => {
  test.for<[string | null, string[]]>([
    ["44.7.2", []],
    ["38.0.0", []],
    ["37.10.3", ["--ozone-platform=wayland"]],
    ["38.0.0-beta.1", ["--ozone-platform=wayland"]],
    ["16.0.0", ["--ozone-platform=wayland"]],
    ["15.5.7", WAYLAND_FLAGS],
    ["12.0.0", WAYLAND_FLAGS],
    [null, WAYLAND_FLAGS],
    ["38", WAYLAND_FLAGS],
    ["custom", WAYLAND_FLAGS],
  ])("Electron %s gets %j", ([electronVersion, flags], { expect }) => {
    expect(getWaylandFlags(electronVersion)).toEqual(flags)
  })

  // Chromium keeps the last value of a repeated switch
  test.ifNotWindows("from Electron 16 the --enable-features of the executableArgs is the only one", async ({ expect, tmpDir }) => {
    const script = getElectronWrapperScript("testapp", ["--enable-features=WaylandWindowDecorations"], getWaylandFlags("30.0.0"))
    expect((await runWrapper(tmpDir, script, [], "wayland")).argv).toEqual(["testapp", "--enable-features=WaylandWindowDecorations", "--ozone-platform=wayland"])
  })
})
