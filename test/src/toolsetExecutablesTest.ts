import { getWineToolset } from "app-builder-lib/src/toolsets/wine.js"
import {
  DEFAULT_EXECUTABLES,
  defaultExecutableLocations,
  executableUriToPath,
  findExecutable,
  resolveExecutable,
  resolveNotarytool,
  validateExecutablesConfig,
} from "app-builder-lib/src/util/systemTools.js"
import { exec, InvalidConfigurationError } from "builder-util"
import { promises as fs } from "fs"
import { homedir } from "os"
import * as path from "path"
import { pathToFileURL } from "url"
import { afterEach, describe, test, vi } from "vitest"

// only /usr/bin/xcrun is mocked; everything else looks at real files
vi.mock("builder-util", async importOriginal => {
  const actual = await importOriginal<typeof import("builder-util")>()
  return { ...actual, exec: vi.fn<typeof actual.exec>() }
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.mocked(exec).mockReset()
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

  test("an entry with no location for this operating system is an error, not a fallback to the defaults", ({ expect }) => {
    expect(configError(() => resolveExecutable("pwsh", { pwsh: "file:///C:/Program%20Files/PowerShell/7/pwsh.exe" }, "linux")).message).toContain(
      "toolsets.executables.pwsh has no location for this operating system"
    )
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
    expect(configError(() => resolveExecutable("pwsh", null, "win32")).message).toContain(`"toolsets": { "executables": { "pwsh": "file:///C:/path/to/pwsh.exe" } }`)
  })
})

describe.skipIf(process.platform === "win32")("getWineToolset and toolsets.executables.wine", () => {
  test("the host Wine comes from toolsets.executables.wine", async ({ expect, tmpDir }) => {
    const wine = await makeFile(await tmpDir.getTempDir({ prefix: "executables-wine" }), "bin/wine", 0o755)
    for (const toolset of [undefined, "latest", "system"] as const) {
      expect((await getWineToolset(toolset, "", { wine: uri(wine) })).execPath).toBe(wine)
    }
  })

  test("a Wine bundle and toolsets.executables.wine together are a configuration error", async ({ expect }) => {
    for (const toolset of ["0.0.0", "1.0.1", { url: "file:///opt/my-wine-bundle" }] as const) {
      const result = getWineToolset(toolset, "", { wine: "file:///opt/homebrew/bin/wine" })
      await expect(result).rejects.toBeInstanceOf(InvalidConfigurationError)
      await expect(result).rejects.toThrow("and toolsets.executables.wine a host Wine: set only one of them")
    }
  })
})

describe.skipIf(process.platform === "win32")("resolveNotarytool", { concurrent: false }, () => {
  test("uses toolsets.executables.notarytool without running xcrun", async ({ expect, tmpDir }) => {
    const notarytool = await makeFile(await tmpDir.getTempDir({ prefix: "executables-notarytool" }), "notarytool", 0o755)
    expect(await resolveNotarytool({ notarytool: uri(notarytool) })).toBe(notarytool)
    expect(vi.mocked(exec)).not.toHaveBeenCalled()
  })

  test("is a configuration error when /usr/bin/xcrun cannot find notarytool", async ({ expect }) => {
    vi.mocked(exec).mockRejectedValue(new Error('xcrun: error: unable to find utility "notarytool"'))
    const result = resolveNotarytool(null)
    await expect(result).rejects.toBeInstanceOf(InvalidConfigurationError)
    await expect(result).rejects.toThrow("/usr/bin/xcrun --find notarytool failed")
    vi.mocked(exec).mockResolvedValue("notarytool\n")
    await expect(resolveNotarytool(null)).rejects.toThrow(`did not return the absolute path of an executable file (it returned "notarytool")`)
  })

  test("otherwise is the notarytool that /usr/bin/xcrun finds", async ({ expect, tmpDir }) => {
    const notarytool = await makeFile(await tmpDir.getTempDir({ prefix: "executables-xcrun" }), "Xcode.app/usr/bin/notarytool", 0o755)
    vi.mocked(exec).mockResolvedValue(`${notarytool}\n`)
    expect(await resolveNotarytool(undefined)).toBe(notarytool)
    expect(vi.mocked(exec).mock.calls).toEqual([["/usr/bin/xcrun", ["--find", "notarytool"]]])
  })
})
