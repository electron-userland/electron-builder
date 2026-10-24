import { InvalidConfigurationError } from "builder-util"
import { accessSync, constants } from "fs"
import * as path from "path"

// System tools are started by absolute path, never by a bare name: a bare name is resolved through PATH (on Windows also the
// current directory), where package managers prepend directories such as node_modules/.bin that a dependency can write to.

// An environment variable that names a Windows directory, accepted only as a drive-absolute path: a relative, drive-relative
// ("\Windows") or UNC value would be resolved against the current directory or drive, or reach out to another host.
function windowsDirectoryFromEnv(names: ReadonlyArray<string>): { dir: string } | { error: string } {
  const name = names.find(it => process.env[it])
  // process.env is case-insensitive on Windows
  const value = name == null ? undefined : process.env[name]
  if (value == null) {
    return { error: `${names[0]} is not set` }
  }
  if (!/^[a-zA-Z]:[\\/]/.test(value)) {
    return { error: `${names[0]} is not an absolute path (${value})` }
  }
  return { dir: value }
}

/** The in-box Windows PowerShell 5.1 of this machine: `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`. */
export function windowsPowerShellPath(): string {
  const systemRoot = windowsDirectoryFromEnv(["SystemRoot", "windir"])
  if ("error" in systemRoot) {
    throw new Error(`cannot locate Windows PowerShell: ${systemRoot.error}`)
  }
  return path.win32.join(systemRoot.dir, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
}

/** PowerShell 7 of this machine at the install location of its MSI installer, `%ProgramFiles%\PowerShell\7\pwsh.exe`, or the reason it has no such location. */
export function windowsPwshPath(): { path: string } | { error: string } {
  const programFiles = windowsDirectoryFromEnv(["ProgramFiles"])
  return "error" in programFiles ? programFiles : { path: path.win32.join(programFiles.dir, "PowerShell", "7", "pwsh.exe") }
}

/** The same executables inside a Parallels Windows guest, at the locations of a default Windows installation. */
export const PARALLELS_GUEST_WINDOWS_POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
export const PARALLELS_GUEST_PWSH = "C:\\Program Files\\PowerShell\\7\\pwsh.exe"

/** Install locations of PowerShell 7 from Microsoft's packages for macOS (pkg, Homebrew cask) and Linux (deb/rpm, snap). */
export const HOST_PWSH_PATHS: Partial<Record<NodeJS.Platform, ReadonlyArray<string>>> = {
  darwin: ["/usr/local/microsoft/powershell/7/pwsh"],
  linux: ["/opt/microsoft/powershell/7/pwsh", "/snap/bin/pwsh"],
}

/** Install locations of the Parallels Desktop command line tool (in the app bundle, and the link its installer creates). */
export const PRLCTL_PATHS: ReadonlyArray<string> = ["/Applications/Parallels Desktop.app/Contents/MacOS/prlctl", "/usr/local/bin/prlctl"]

/** The first of `candidates` that is an executable file, or null. */
export function findExecutable(candidates: ReadonlyArray<string>): string | null {
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // not installed there
    }
  }
  return null
}

/** PowerShell 7 of this macOS or Linux machine, or null when it is not installed at one of {@link HOST_PWSH_PATHS}. */
export function findHostPwsh(): string | null {
  return findExecutable(HOST_PWSH_PATHS[process.platform] ?? [])
}

/**
 * Install locations of Wine: the WineHQ app bundles (Homebrew casks `wine-stable`, `wine@devel`, `wine@staging`), Homebrew
 * and MacPorts on macOS; distribution and WineHQ packages (which install to /opt/wine-<branch>) and source builds on Linux.
 */
export const HOST_WINE_PATHS: Partial<Record<NodeJS.Platform, ReadonlyArray<string>>> = {
  darwin: [
    "/Applications/Wine Stable.app/Contents/Resources/wine/bin/wine",
    "/Applications/Wine Devel.app/Contents/Resources/wine/bin/wine",
    "/Applications/Wine Staging.app/Contents/Resources/wine/bin/wine",
    "/opt/homebrew/bin/wine",
    "/usr/local/bin/wine",
    "/opt/local/bin/wine",
  ],
  linux: ["/usr/bin/wine", "/usr/local/bin/wine", "/opt/wine-stable/bin/wine", "/opt/wine-devel/bin/wine", "/opt/wine-staging/bin/wine"],
}

/** Wine of this macOS or Linux machine, or null when it is not installed at one of {@link HOST_WINE_PATHS}. */
export function findHostWine(): string | null {
  return findExecutable(HOST_WINE_PATHS[process.platform] ?? [])
}

/** The Parallels Desktop command line tool, or null when it is not installed at one of {@link PRLCTL_PATHS} (or this is not macOS). */
export function findPrlctl(): string | null {
  return process.platform === "darwin" ? findExecutable(PRLCTL_PATHS) : null
}

export function hostPwshNotFoundError(): InvalidConfigurationError {
  const paths = HOST_PWSH_PATHS[process.platform] ?? []
  return new InvalidConfigurationError(
    `PowerShell (pwsh) is used only from the install location of Microsoft's package${paths.length === 0 ? "" : ` (${paths.join(", ")})`}, where it was not found. ` +
      `Install it per https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell`
  )
}
