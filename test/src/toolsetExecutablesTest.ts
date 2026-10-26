import { Packager } from "app-builder-lib"
import { getWineToolset } from "app-builder-lib/src/toolsets/wine.js"
import { DEFAULT_EXECUTABLES, defaultExecutableLocations, executableUriToPath, findExecutable, resolveExecutable, validateExecutablesConfig } from "builder-util/src/executables"
import { Executables, ExecutablesConfig, InvalidConfigurationError } from "builder-util"
import { ChildProcess, execFile } from "child_process"
import { promises as fs } from "fs"
import { homedir } from "os"
import * as path from "path"
import { pathToFileURL } from "url"
import { afterEach, describe, test, vi } from "vitest"

// only /usr/bin/xcrun is stood in for (see xcrun below); everything else looks at real files and starts real processes
vi.mock("child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("child_process")>()
  return { ...actual, execFile: vi.fn(actual.execFile) }
})

/** The next program started with execFile, which is /usr/bin/xcrun here, prints `result` or fails with it. */
function xcrun(result: string | Error) {
  vi.mocked(execFile).mockImplementationOnce(((_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
    setImmediate(() => (typeof result === "string" ? callback(null, result, "") : callback(result, "", "")))
    return {} as ChildProcess
  }) as typeof execFile)
}

function startedFiles() {
  return vi.mocked(execFile).mock.calls.map(call => [call[0], call[1]])
}

const originalPlatform = process.platform
function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: platform, configurable: true })
}

afterEach(() => {
  setPlatform(originalPlatform)
  vi.unstubAllEnvs()
  vi.mocked(execFile).mockReset()
})

function configError(fn: () => unknown): InvalidConfigurationError {
  try {
    fn()
  } catch (e: any) {
    if (e instanceof InvalidConfigurationError) {
      return e
    }
    throw e
  }
  throw new Error("expected an InvalidConfigurationError")
}

async function makeFile(dir: string, name: string, mode: number): Promise<string> {
  const file = path.join(dir, name)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, "#!/bin/sh\n", { mode })
  // the umask can drop bits on creation
  await fs.chmod(file, mode)
  return file
}

const uri = (file: string) => pathToFileURL(file).href

describe("executableUriToPath", () => {
  test("converts a file:// URI of a POSIX path, decoding percent-escapes", ({ expect }) => {
    expect(executableUriToPath("mono", "file:///opt/homebrew/bin/mono", "darwin")).toBe("/opt/homebrew/bin/mono")
    expect(executableUriToPath("mono", "file:///opt/my%20tools/mono", "linux")).toBe("/opt/my tools/mono")
    expect(executableUriToPath("mono", "file://localhost/usr/bin/mono", "linux")).toBe("/usr/bin/mono")
  })

  test("converts a file:// URI with a Windows drive letter on Windows", ({ expect }) => {
    expect(executableUriToPath("pwsh", "file:///C:/Program%20Files/PowerShell/7/pwsh.exe", "win32")).toBe("C:\\Program Files\\PowerShell\\7\\pwsh.exe")
    expect(executableUriToPath("powershell", "file:///d:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe", "win32")).toBe(
      "d:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
    )
  })

  test("skips the location of another operating system, so one list can serve several hosts", ({ expect }) => {
    expect(executableUriToPath("pwsh", "file:///C:/Program%20Files/PowerShell/7/pwsh.exe", "darwin")).toBeNull()
    expect(executableUriToPath("pwsh", "file:///C:/Program%20Files/PowerShell/7/pwsh.exe", "linux")).toBeNull()
    expect(executableUriToPath("pwsh", "file:///usr/local/microsoft/powershell/7/pwsh", "win32")).toBeNull()
  })

  test("refuses a URI that names another host (a UNC share)", ({ expect }) => {
    for (const value of ["file://server/share/mono", "file://server/share/pwsh.exe"]) {
      for (const platform of ["linux", "win32"] as const) {
        const error = configError(() => executableUriToPath("mono", value, platform))
        expect(error.message).toBe(`toolsets.executables.mono must be a file:// URI of a file on this machine, but "${value}" names the host "server"`)
      }
    }
  })

  test("refuses a plain path or ~, showing the file:// URI to write instead", ({ expect }) => {
    expect(configError(() => executableUriToPath("mono", "/opt/homebrew/bin/mono")).message).toBe(
      `toolsets.executables.mono must be a file:// URI, but "/opt/homebrew/bin/mono" is a plain path. Write it as "${pathToFileURL("/opt/homebrew/bin/mono").href}"`
    )
    expect(configError(() => executableUriToPath("pwsh", "C:\\Program Files\\PowerShell\\7\\pwsh.exe")).message).toContain(
      `Write it as "file:///C:/Program%20Files/PowerShell/7/pwsh.exe"`
    )
    expect(configError(() => executableUriToPath("mono", "~/bin/mono")).message).toContain(`Write it as "${pathToFileURL(path.join(homedir(), "bin", "mono")).href}"`)
    expect(configError(() => executableUriToPath("mono", "mono")).message).toContain("is a plain path")
  })

  test("refuses another scheme and a value that is not a string", ({ expect }) => {
    expect(configError(() => executableUriToPath("mono", "https://example.com/mono")).message).toBe(
      `toolsets.executables.mono must be a file:// URI of a file on this machine, but "https://example.com/mono" is a https: URI`
    )
    expect(configError(() => executableUriToPath("mono", 42)).message).toBe("toolsets.executables.mono must be a file:// URI or a list of them, but it has 42")
  })
})

describe("validateExecutablesConfig", () => {
  test("refuses an unknown program, listing the valid names", ({ expect }) => {
    const error = configError(() => validateExecutablesConfig({ powershel: "file:///x" } as any))
    expect(error.message).toBe(`toolsets.executables has the unknown key "powershel". Valid names: ${Object.keys(DEFAULT_EXECUTABLES).join(", ")}`)
  })

  test("suggests the bare name for a key with .exe", ({ expect }) => {
    expect(configError(() => validateExecutablesConfig({ "pwsh.exe": "file:///C:/pwsh.exe" } as any)).message).toBe(
      `toolsets.executables has the key "pwsh.exe": program names have no .exe suffix, use "pwsh"`
    )
    expect(configError(() => validateExecutablesConfig({ "Mono.EXE": "file:///x" } as any)).message).toContain(`use "mono"`)
  })

  test("refuses an empty list and checks every URI of a list, on any host", ({ expect }) => {
    expect(configError(() => validateExecutablesConfig({ mono: [] })).message).toBe("toolsets.executables.mono is an empty list. Leave it unset to use the default locations")
    expect(configError(() => validateExecutablesConfig({ mono: ["file:///C:/mono.exe", "/usr/bin/mono"] })).message).toContain(`"/usr/bin/mono" is a plain path`)
    expect(() => validateExecutablesConfig({ mono: null, pwsh: ["file:///C:/pwsh.exe", "file:///opt/pwsh"] })).not.toThrow()
  })

  test("is also applied when a program is resolved, for a configuration that bypassed the schema", ({ expect }) => {
    expect(() => resolveExecutable("mono", { "mono.exe": "file:///x" } as any)).toThrow(InvalidConfigurationError)
    expect(() => findExecutable("mono", { mono: "mono" })).toThrow(InvalidConfigurationError)
  })
})

describe.skipIf(process.platform === "win32")("resolveExecutable with toolsets.executables", () => {
  test("uses the first location that is an executable regular file, in list order", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "executables-order" })
    const first = await makeFile(dir, "a/mono", 0o755)
    const second = await makeFile(dir, "b/mono", 0o755)
    const missing = path.join(dir, "missing", "mono")
    expect(resolveExecutable("mono", { mono: [uri(missing), uri(second), uri(first)] })).toBe(second)
    expect(resolveExecutable("mono", { mono: uri(first) })).toBe(first)
  })

  test("skips a file that is not executable and a directory", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "executables-skip" })
    const plain = await makeFile(dir, "plain/mono", 0o644)
    const directory = path.join(dir, "dir", "mono")
    await fs.mkdir(directory, { recursive: true })
    const tool = await makeFile(dir, "tool/mono", 0o755)
    expect(findExecutable("mono", { mono: [uri(plain), uri(directory)] })).toBeNull()
    expect(resolveExecutable("mono", { mono: [uri(plain), uri(directory), uri(tool)] })).toBe(tool)
  })

  test("decodes a path with a space", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "executables-space" })
    const tool = await makeFile(dir, "my tools/mono", 0o755)
    expect(uri(tool)).toContain("%20")
    expect(resolveExecutable("mono", { mono: uri(tool) })).toBe(tool)
  })

  test("an entry replaces the default locations, and the error names only its own locations", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "executables-replace" })
    const missing = path.join(dir, "missing", "wine")
    const error = configError(() => resolveExecutable("wine", { wine: uri(missing) }, "linux"))
    expect(error.message).toBe(
      `none of the locations in toolsets.executables.wine is an executable file on this machine (tried "${missing}"). ` +
        `electron-builder starts wine only from an absolute path, never from PATH: set the file:// URI of its location, for example "toolsets": { "executables": { "wine": "file:///path/to/wine" } }`
    )
    expect(error.message).not.toContain("/usr/bin/wine")
  })

  test("an entry with no location for this operating system leaves the default locations there", ({ expect }) => {
    const outcome = (executables: ExecutablesConfig | null) => {
      try {
        return resolveExecutable("pwsh", executables, "linux")
      } catch (e: any) {
        return e.message
      }
    }
    expect(outcome({ pwsh: "file:///C:/Program%20Files/PowerShell/7/pwsh.exe" })).toBe(outcome(null))
  })
})

describe("default locations", () => {
  test("are absolute paths on every operating system", ({ expect }) => {
    vi.stubEnv("SystemRoot", "C:\\Windows")
    vi.stubEnv("ProgramFiles", "C:\\Program Files")
    for (const name of Object.keys(DEFAULT_EXECUTABLES) as Array<keyof typeof DEFAULT_EXECUTABLES>) {
      for (const platform of ["darwin", "linux"] as const) {
        for (const location of defaultExecutableLocations(name, platform)) {
          expect(path.posix.isAbsolute(location), `${name} ${platform}`).toBe(true)
        }
      }
      for (const location of defaultExecutableLocations(name, "win32")) {
        expect(/^[A-Z]:\\.+\.exe$/.test(location), name).toBe(true)
      }
    }
  })

  test("of Windows PowerShell and PowerShell 7 come from drive-absolute SystemRoot and ProgramFiles", ({ expect }) => {
    vi.stubEnv("SystemRoot", "D:/Win")
    vi.stubEnv("ProgramFiles", "E:\\Programs")
    expect(defaultExecutableLocations("powershell", "win32")).toEqual(["D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"])
    expect(defaultExecutableLocations("pwsh", "win32")).toEqual(["E:\\Programs\\PowerShell\\7\\pwsh.exe"])
    vi.stubEnv("SystemRoot", "")
    vi.stubEnv("windir", "C:\\Windows")
    expect(defaultExecutableLocations("powershell", "win32")).toEqual(["C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"])
  })

  // process.env keeps the casing a variable was set with, which on some Windows hosts is SYSTEMROOT rather than SystemRoot
  test("of Windows PowerShell and PowerShell 7 read SystemRoot and ProgramFiles in any casing", ({ expect }) => {
    for (const name of ["SystemRoot", "windir", "ProgramFiles"]) {
      vi.stubEnv(name, undefined)
    }
    vi.stubEnv("SYSTEMROOT", "E:\\WinNT")
    vi.stubEnv("PROGRAMFILES", "F:\\Programs")
    expect(defaultExecutableLocations("powershell", "win32")).toEqual(["E:\\WinNT\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"])
    expect(defaultExecutableLocations("pwsh", "win32")).toEqual(["F:\\Programs\\PowerShell\\7\\pwsh.exe"])
  })

  test("of Windows PowerShell are unavailable without SystemRoot and windir, and a configured location does not need them", ({ expect }) => {
    for (const name of ["SystemRoot", "SYSTEMROOT", "windir"]) {
      vi.stubEnv(name, undefined)
    }
    expect(configError(() => resolveExecutable("powershell", null, "win32")).message).toContain("powershell has no default install location on win32 (SystemRoot is not set)")
    // the configured location replaces the defaults, which are not computed: only its file is looked for
    expect(configError(() => resolveExecutable("powershell", { powershell: "file:///D:/Tools/missing/powershell.exe" }, "win32")).message).toContain(
      'none of the locations in toolsets.executables.powershell is an executable file on this machine (tried "D:\\Tools\\missing\\powershell.exe")'
    )
  })

  test("of a Windows program are unavailable when the environment variable is not absolute, which the error says", ({ expect }) => {
    for (const value of ["Program Files", "\\Program Files", "\\\\server\\share"]) {
      vi.stubEnv("ProgramFiles", value)
      expect(configError(() => resolveExecutable("pwsh", null, "win32")).message).toContain(
        `pwsh has no default install location on win32 (ProgramFiles is not an absolute path (${value}))`
      )
    }
    vi.stubEnv("SystemRoot", "Windows")
    vi.stubEnv("windir", "")
    expect(configError(() => resolveExecutable("powershell", null, "win32")).message).toContain("SystemRoot is not an absolute path (Windows)")
  })

  test("of the macOS system tools are in /usr/bin, and only on macOS", ({ expect }) => {
    for (const name of ["productbuild", "pkgbuild", "hdiutil", "codesign", "actool", "tiffutil", "sips", "zip"] as const) {
      expect(defaultExecutableLocations(name, "darwin")).toEqual([`/usr/bin/${name}`])
      expect(defaultExecutableLocations(name, "linux")).toEqual([])
      expect(defaultExecutableLocations(name, "win32")).toEqual([])
    }
  })

  test("of pkgutil is /usr/sbin/pkgutil, and stapler and notarytool have none (they are found with /usr/bin/xcrun)", ({ expect }) => {
    expect(defaultExecutableLocations("pkgutil", "darwin")).toEqual(["/usr/sbin/pkgutil"])
    expect(defaultExecutableLocations("pkgutil", "linux")).toEqual([])
    for (const name of ["stapler", "notarytool"] as const) {
      for (const platform of ["darwin", "linux", "win32"] as const) {
        expect(defaultExecutableLocations(name, platform)).toEqual([])
      }
    }
  })

  test("of the Linux tools, snapcraft, Mono, Wine, pwsh and prlctl, in PATH order", ({ expect }) => {
    expect(defaultExecutableLocations("lzip", "linux")).toEqual(["/usr/bin/lzip", "/usr/local/bin/lzip"])
    // macOS uses the linuxToolsMac toolset
    expect(defaultExecutableLocations("lzip", "darwin")).toEqual([])
    expect(defaultExecutableLocations("flatpak-builder", "linux")).toEqual(["/usr/bin/flatpak-builder", "/usr/local/bin/flatpak-builder"])
    expect(defaultExecutableLocations("snapcraft", "linux")).toEqual(["/snap/bin/snapcraft", "/usr/bin/snapcraft"])
    expect(defaultExecutableLocations("snapcraft", "darwin")).toEqual(["/opt/homebrew/bin/snapcraft", "/usr/local/bin/snapcraft"])
    expect(defaultExecutableLocations("mono", "linux")).toEqual(["/home/linuxbrew/.linuxbrew/bin/mono", "/usr/local/bin/mono", "/usr/bin/mono"])
    expect(defaultExecutableLocations("wine", "darwin")[0]).toBe("/opt/homebrew/bin/wine")
    expect(defaultExecutableLocations("pwsh", "linux")).toEqual(["/opt/microsoft/powershell/7/pwsh", "/snap/bin/pwsh"])
    expect(defaultExecutableLocations("prlctl", "darwin")).toEqual(["/Applications/Parallels Desktop.app/Contents/MacOS/prlctl", "/usr/local/bin/prlctl"])
    expect(defaultExecutableLocations("prlctl", "linux")).toEqual([])
    expect(defaultExecutableLocations("notarytool", "darwin")).toEqual([])
  })

  test("are used for an unset or null entry, and the error lists them with an example entry", ({ expect }) => {
    for (const executables of [undefined, null, {}, { prlctl: null }]) {
      const error = configError(() => resolveExecutable("prlctl", executables, "linux"))
      expect(error.message).toBe(
        `prlctl has no default install location on linux. electron-builder starts prlctl only from an absolute path, never from PATH: set the file:// URI of its location, for example "toolsets": { "executables": { "prlctl": "file:///path/to/prlctl" } }`
      )
    }
    // not where a Windows host (such as a CI runner) may have PowerShell 7
    vi.stubEnv("ProgramFiles", "C:\\electron-builder-test-missing")
    expect(configError(() => resolveExecutable("pwsh", null, "win32")).message).toContain(`"toolsets": { "executables": { "pwsh": "file:///C:/path/to/pwsh.exe" } }`)
  })
})

describe.skipIf(process.platform === "win32")("getWineToolset and toolsets.executables.wine", () => {
  test("the host Wine comes from toolsets.executables.wine", async ({ expect, tmpDir }) => {
    const wine = await makeFile(await tmpDir.getTempDir({ prefix: "executables-wine" }), "bin/wine", 0o755)
    for (const toolset of [undefined, "latest", "system"] as const) {
      expect((await Executables.run({ wine: uri(wine) }, () => getWineToolset(toolset, ""))).execPath).toBe(wine)
    }
  })

  test("a Wine bundle and toolsets.executables.wine together are a configuration error", async ({ expect }) => {
    setPlatform("darwin")
    for (const toolset of ["0.0.0", "1.0.1", { url: "file:///opt/my-wine-bundle" }] as const) {
      const result = Executables.run({ wine: "file:///opt/homebrew/bin/wine" }, () => getWineToolset(toolset, ""))
      await expect(result).rejects.toBeInstanceOf(InvalidConfigurationError)
      await expect(result).rejects.toThrow("and toolsets.executables.wine a host Wine: set only one of them")
    }
  })

  test("toolsets.executables.wine with Windows locations only does not conflict with a Wine bundle on macOS", async ({ expect }) => {
    setPlatform("darwin")
    const error = await Executables.run({ wine: "file:///C:/wine/wine.exe" }, () => getWineToolset({ url: "file:///opt/my-wine-bundle" }, "")).catch((e: Error) => e)
    expect(error).not.toBeInstanceOf(InvalidConfigurationError)
  })

  test("on Linux a version pin selects no bundle, so it goes with toolsets.executables.wine (a config shared with macOS)", async ({ expect, tmpDir }) => {
    const wine = await makeFile(await tmpDir.getTempDir({ prefix: "executables-wine-linux" }), "bin/wine", 0o755)
    setPlatform("linux")
    for (const toolset of ["0.0.0", "1.0.1"] as const) {
      expect((await Executables.run({ wine: uri(wine) }, () => getWineToolset(toolset, ""))).execPath).toBe(wine)
    }
    // a custom bundle is used on Linux too, so it still conflicts
    await expect(Executables.run({ wine: uri(wine) }, () => getWineToolset({ url: "file:///opt/my-wine-bundle" }, ""))).rejects.toThrow("set only one of them")
  })
})

describe.skipIf(process.platform === "win32")("Executables.notarytool", { concurrent: false }, () => {
  test("uses toolsets.executables.notarytool without running xcrun", async ({ expect, tmpDir }) => {
    const notarytool = await makeFile(await tmpDir.getTempDir({ prefix: "executables-notarytool" }), "notarytool", 0o755)
    expect(await Executables.run({ notarytool: uri(notarytool) }, () => Executables.notarytool())).toBe(notarytool)
    expect(execFile).not.toHaveBeenCalled()
  })

  test("finds notarytool with /usr/bin/xcrun when toolsets.executables.notarytool has no location for macOS", async ({ expect, tmpDir }) => {
    const notarytool = await makeFile(await tmpDir.getTempDir({ prefix: "executables-xcrun" }), "Xcode.app/usr/bin/notarytool", 0o755)
    xcrun(`${notarytool}\n`)
    expect(await Executables.run({ notarytool: "file:///C:/Tools/notarytool.exe" }, () => Executables.notarytool())).toBe(notarytool)
    expect(startedFiles()).toEqual([["/usr/bin/xcrun", ["--find", "notarytool"]]])
  })

  test("is a configuration error when /usr/bin/xcrun cannot find notarytool", async ({ expect }) => {
    xcrun(new Error('xcrun: error: unable to find utility "notarytool"'))
    const result = Executables.run(null, () => Executables.notarytool())
    await expect(result).rejects.toBeInstanceOf(InvalidConfigurationError)
    await expect(result).rejects.toThrow("/usr/bin/xcrun --find notarytool failed")
    xcrun("notarytool\n")
    await expect(Executables.run(null, () => Executables.notarytool())).rejects.toThrow(`did not return the absolute path of an executable file (it returned "notarytool")`)
  })

  test("otherwise is the notarytool that /usr/bin/xcrun finds", async ({ expect, tmpDir }) => {
    const notarytool = await makeFile(await tmpDir.getTempDir({ prefix: "executables-xcrun" }), "Xcode.app/usr/bin/notarytool", 0o755)
    xcrun(`${notarytool}\n`)
    expect(await Executables.run(undefined, () => Executables.notarytool())).toBe(notarytool)
    expect(startedFiles()).toEqual([["/usr/bin/xcrun", ["--find", "notarytool"]]])
  })
})

describe.skipIf(process.platform === "win32")("Executables.stapler", { concurrent: false }, () => {
  test("uses toolsets.executables.stapler without running xcrun", async ({ expect, tmpDir }) => {
    const stapler = await makeFile(await tmpDir.getTempDir({ prefix: "executables-stapler" }), "stapler", 0o755)
    expect(await Executables.run({ stapler: uri(stapler) }, () => Executables.stapler())).toBe(stapler)
    expect(execFile).not.toHaveBeenCalled()
  })

  test("otherwise is the stapler that /usr/bin/xcrun finds, looked up once per run scope", async ({ expect, tmpDir }) => {
    const stapler = await makeFile(await tmpDir.getTempDir({ prefix: "executables-xcrun" }), "Xcode.app/usr/bin/stapler", 0o755)
    xcrun(`${stapler}\n`)
    expect(await Executables.run(null, async () => [await Executables.stapler(), await Executables.stapler()])).toEqual([stapler, stapler])
    expect(startedFiles()).toEqual([["/usr/bin/xcrun", ["--find", "stapler"]]])
  })

  test("is a configuration error when /usr/bin/xcrun cannot find it, and is looked up again after that", async ({ expect, tmpDir }) => {
    const stapler = await makeFile(await tmpDir.getTempDir({ prefix: "executables-xcrun" }), "Xcode.app/usr/bin/stapler", 0o755)
    await Executables.run(null, async () => {
      xcrun(new Error('xcrun: error: unable to find utility "stapler"'))
      const error = await Executables.stapler().catch((e: unknown) => e)
      expect(error).toBeInstanceOf(InvalidConfigurationError)
      expect((error as Error).message).toContain("/usr/bin/xcrun --find stapler failed")
      expect((error as Error).message).toContain(`"toolsets": { "executables": { "stapler": "file:///path/to/stapler" } }`)
      xcrun(`${stapler}\n`)
      expect(await Executables.stapler()).toBe(stapler)
    })
  })

  test("is cached separately from notarytool", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "executables-xcrun" })
    const stapler = await makeFile(dir, "Xcode.app/usr/bin/stapler", 0o755)
    const notarytool = await makeFile(dir, "Xcode.app/usr/bin/notarytool", 0o755)
    xcrun(`${notarytool}\n`)
    xcrun(`${stapler}\n`)
    expect(await Executables.run(null, async () => [await Executables.notarytool(), await Executables.stapler()])).toEqual([notarytool, stapler])
  })
})

describe("Executables", () => {
  test("outside any run scope uses the default locations, never PATH", ({ expect }) => {
    expect(Executables.configuration).toBeNull()
    // prlctl has no default location on Linux, and a bare name on PATH is never used
    if (process.platform === "linux") {
      expect(() => Executables.resolve("prlctl")).toThrow("prlctl has no default install location on linux")
    }
    expect(Executables.isConfigured("mono")).toBe(false)
  })

  test("an entry with locations for other operating systems only counts as not configured", ({ expect }) => {
    setPlatform("linux")
    Executables.run({ mono: "file:///C:/Mono/bin/mono.exe" }, () => {
      expect(Executables.isConfigured("mono")).toBe(false)
      expect(Executables.find("mono")).toBe(findExecutable("mono", null))
    })
    Executables.run({ mono: ["file:///C:/Mono/bin/mono.exe", "file:///opt/mono/bin/mono"] }, () => {
      expect(Executables.isConfigured("mono")).toBe(true)
    })
  })

  test("run checks the configuration before running anything", ({ expect }) => {
    const fn = vi.fn()
    expect(() => Executables.run({ "mono.exe": "file:///x" } as any, fn)).toThrow(InvalidConfigurationError)
    expect(() => Executables.run({ mono: "/usr/bin/mono" }, fn)).toThrow(`"/usr/bin/mono" is a plain path`)
    expect(fn).not.toHaveBeenCalled()
  })

  describe.skipIf(process.platform === "win32")("scopes", () => {
    test("two concurrent runs with different configurations resolve independently", async ({ expect, tmpDir }) => {
      const dir = await tmpDir.getTempDir({ prefix: "executables-scopes" })
      const first = await makeFile(dir, "first/mono", 0o755)
      const second = await makeFile(dir, "second/mono", 0o755)
      const resolveLater = () => new Promise<string>(resolve => setTimeout(() => resolve(Executables.resolve("mono")), 10))
      const [a, b] = await Promise.all([
        Executables.run({ mono: uri(first) }, async () => {
          await new Promise(resolve => setTimeout(resolve, 20))
          return [Executables.resolve("mono"), await resolveLater()]
        }),
        Executables.run({ mono: uri(second) }, async () => [Executables.resolve("mono"), await resolveLater()]),
      ])
      expect(a).toEqual([first, first])
      expect(b).toEqual([second, second])
      expect(Executables.configuration).toBeNull()
    })

    test("asynchronous work started inside a run sees its configuration", async ({ expect, tmpDir }) => {
      const mono = await makeFile(await tmpDir.getTempDir({ prefix: "executables-async" }), "mono", 0o755)
      const seen = await Executables.run({ mono: uri(mono) }, async () => {
        const fromTimer = await new Promise<string>(resolve => setTimeout(() => resolve(Executables.resolve("mono")), 5))
        const fromImmediate = await new Promise<string>(resolve => setImmediate(() => resolve(Executables.resolve("mono"))))
        const fromChain = await Promise.resolve()
          .then(() => fs.stat(mono))
          .then(() => Executables.resolve("mono"))
        // the callback of a child process, like those of exec and spawn
        const fromChild = await new Promise<string>((resolve, reject) => {
          execFile(process.execPath, ["-e", ""], error => (error == null ? resolve(Executables.resolve("mono")) : reject(error)))
        })
        return [fromTimer, fromImmediate, fromChain, fromChild]
      })
      expect(seen).toEqual([mono, mono, mono, mono])
    })
  })
})

describe("Packager", () => {
  // the private step of Packager.build after the configuration is loaded and validated
  type BuildStep = { buildWithValidatedConfig: () => Promise<unknown> }

  async function createPackager(projectDir: string, executables: Record<string, string>) {
    await fs.mkdir(projectDir, { recursive: true })
    await fs.writeFile(path.join(projectDir, "package.json"), JSON.stringify({ name: "app", version: "1.0.0", description: "App", author: "Foo Bar" }))
    return new Packager({ projectDir, config: { electronVersion: "38.0.0", toolsets: { executables } } })
  }

  test("builds in an Executables.run scope of its toolsets.executables", async ({ expect, tmpDir }) => {
    const executables = { mono: "file:///opt/mono/bin/mono" }
    const packager = await createPackager(await tmpDir.getTempDir({ prefix: "executables-packager" }), executables)
    // stands in for the build itself, which runs once the configuration is loaded and validated
    const build = vi.spyOn(packager as unknown as BuildStep, "buildWithValidatedConfig").mockImplementation(() => Promise.resolve(Executables.configuration))
    expect(await packager.build()).toEqual(executables)
    expect(build).toHaveBeenCalledTimes(1)
    expect(Executables.configuration).toBeNull()
  })

  test("refuses a toolsets.executables entry the schema lets through before building", async ({ expect, tmpDir }) => {
    const packager = await createPackager(await tmpDir.getTempDir({ prefix: "executables-packager" }), { mono: "/opt/mono/bin/mono" })
    const build = vi.spyOn(packager as unknown as BuildStep, "buildWithValidatedConfig")
    await expect(packager.build()).rejects.toThrow(`"/opt/mono/bin/mono" is a plain path`)
    expect(build).not.toHaveBeenCalled()
  })
})

// Windows PowerShell of the build machine comes from toolsets.executables (Executables), so that an explicit location is used as is;
// windowsPowerShellPath (builder-util-runtime) locates it from SystemRoot on the end user's machine, for electron-updater only
describe("windowsPowerShellPath", () => {
  test("is used by builder-util-runtime and electron-updater only, not by the build-time packages", async ({ expect }) => {
    const packagesDir = path.resolve(__dirname, "../../packages")
    const runtimePackages = new Set(["builder-util-runtime", "electron-updater"])
    const scanned: Array<string> = []
    const users: Array<string> = []
    for (const pkg of await fs.readdir(packagesDir, { withFileTypes: true })) {
      if (!pkg.isDirectory() || runtimePackages.has(pkg.name)) {
        continue
      }
      const srcDir = path.join(packagesDir, pkg.name, "src")
      const files = await fs.readdir(srcDir, { recursive: true }).catch(() => [])
      for (const file of files.filter(it => /\.[cm]?[jt]sx?$/.test(it))) {
        scanned.push(path.join(pkg.name, "src", file))
        if (/\bwindowsPowerShellPath\b/.test(await fs.readFile(path.join(srcDir, file), "utf8"))) {
          users.push(path.join(pkg.name, "src", file))
        }
      }
    }
    expect(scanned).toContain(path.join("app-builder-lib", "src", "codeSign", "win", "authenticodeSignature.ts"))
    expect(scanned).toContain(path.join("builder-util", "src", "executables.ts"))
    expect(users).toEqual([])
  })
})
