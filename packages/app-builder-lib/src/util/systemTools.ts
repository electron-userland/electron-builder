import { exec, InvalidConfigurationError, log } from "builder-util"
import { asArray, Nullish, windowsPowerShellPath } from "builder-util-runtime"
import { accessSync, constants, statSync } from "fs"
import { homedir } from "os"
import * as path from "path"
import { fileURLToPath, pathToFileURL } from "url"
import { ExecutableName, ExecutablesConfig } from "../configuration.js"

// Host programs are started by absolute path, never by a bare name: a bare name is resolved through PATH (on Windows also the
// current directory), where package managers prepend directories such as node_modules/.bin that a dependency can write to.
// Each program comes from its `toolsets.executables` entry when it is set, otherwise from the default install locations below.

type DefaultLocations = Partial<Record<NodeJS.Platform, () => ReadonlyArray<string>>>

// %ProgramFiles%, accepted only as a drive-absolute path: a relative, drive-relative ("\Program Files") or UNC value would be
// resolved against the current directory or drive, or reach out to another host
function windowsProgramFiles(): string {
  // process.env is case-insensitive on Windows
  const value = process.env.ProgramFiles
  if (!value) {
    throw new Error("ProgramFiles is not set")
  }
  if (!/^[a-zA-Z]:[\\/]/.test(value)) {
    throw new Error(`ProgramFiles is not an absolute path (${value})`)
  }
  return value
}

const inUsrBinOnMac = (name: string): DefaultLocations => ({ darwin: () => [`/usr/bin/${name}`] })
const inUsrBinOnLinux = (name: string): DefaultLocations => ({ linux: () => [`/usr/bin/${name}`, `/usr/local/bin/${name}`] })

/**
 * The default install locations of each host program, in the order they are tried. Where a program has several, the order is that
 * of the default `PATH` (Homebrew's shellenv and MacPorts prepend their `bin`; /etc/paths puts /usr/local/bin first on macOS).
 * Windows locations come from `SystemRoot` and `ProgramFiles`, which must be drive-absolute.
 */
export const DEFAULT_EXECUTABLES: Readonly<Record<ExecutableName, DefaultLocations>> = {
  // the in-box Windows PowerShell 5.1
  powershell: { win32: () => [windowsPowerShellPath()] },
  // PowerShell 7 from Microsoft's packages: the MSI installer on Windows, the pkg or Homebrew cask on macOS, deb/rpm or snap on Linux
  pwsh: {
    win32: () => [path.win32.join(windowsProgramFiles(), "PowerShell", "7", "pwsh.exe")],
    darwin: () => ["/usr/local/microsoft/powershell/7/pwsh"],
    linux: () => ["/opt/microsoft/powershell/7/pwsh", "/snap/bin/pwsh"],
  },
  // the Parallels Desktop command line tool, in the app bundle and the link its installer creates
  prlctl: { darwin: () => ["/Applications/Parallels Desktop.app/Contents/MacOS/prlctl", "/usr/local/bin/prlctl"] },
  // Homebrew, MacPorts and the WineHQ app bundles (Homebrew casks wine-stable, wine@devel, wine@staging) on macOS; source builds,
  // distribution packages and WineHQ packages (which install to /opt/wine-<branch>) on Linux
  wine: {
    darwin: () => [
      "/opt/homebrew/bin/wine",
      "/usr/local/bin/wine",
      "/opt/local/bin/wine",
      "/Applications/Wine Stable.app/Contents/Resources/wine/bin/wine",
      "/Applications/Wine Devel.app/Contents/Resources/wine/bin/wine",
      "/Applications/Wine Staging.app/Contents/Resources/wine/bin/wine",
    ],
    linux: () => ["/usr/local/bin/wine", "/usr/bin/wine", "/opt/wine-stable/bin/wine", "/opt/wine-devel/bin/wine", "/opt/wine-staging/bin/wine"],
  },
  // Homebrew, MacPorts and the Mono framework of the official macOS package (the Commands directory its installer puts on PATH, and
  // the framework's bin) on macOS; Homebrew, source builds and distribution or Mono project packages on Linux
  mono: {
    darwin: () => [
      "/opt/homebrew/bin/mono",
      "/usr/local/bin/mono",
      "/opt/local/bin/mono",
      "/Library/Frameworks/Mono.framework/Versions/Current/Commands/mono",
      "/Library/Frameworks/Mono.framework/Versions/Current/bin/mono",
    ],
    linux: () => ["/home/linuxbrew/.linuxbrew/bin/mono", "/usr/local/bin/mono", "/usr/bin/mono"],
  },
  productbuild: inUsrBinOnMac("productbuild"),
  pkgbuild: inUsrBinOnMac("pkgbuild"),
  hdiutil: inUsrBinOnMac("hdiutil"),
  codesign: inUsrBinOnMac("codesign"),
  // an xcrun shim, which runs the actool of the selected Xcode (xcode-select)
  actool: inUsrBinOnMac("actool"),
  tiffutil: inUsrBinOnMac("tiffutil"),
  sips: inUsrBinOnMac("sips"),
  zip: inUsrBinOnMac("zip"),
  // no fixed location: by default it is the notarytool of the selected Xcode, found with /usr/bin/xcrun (see resolveNotarytool)
  notarytool: {},
  // on macOS lzip comes from the linuxToolsMac toolset
  lzip: inUsrBinOnLinux("lzip"),
  snapcraft: {
    darwin: () => ["/opt/homebrew/bin/snapcraft", "/usr/local/bin/snapcraft"],
    linux: () => ["/snap/bin/snapcraft", "/usr/bin/snapcraft"],
  },
  flatpak: inUsrBinOnLinux("flatpak"),
  "flatpak-builder": inUsrBinOnLinux("flatpak-builder"),
}

/** The same executables inside a Parallels Windows guest, at the locations of a default Windows installation. */
export const PARALLELS_GUEST_WINDOWS_POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
export const PARALLELS_GUEST_PWSH = "C:\\Program Files\\PowerShell\\7\\pwsh.exe"

function isExecutableName(name: string): name is ExecutableName {
  return Object.prototype.hasOwnProperty.call(DEFAULT_EXECUTABLES, name)
}

function exampleEntry(name: ExecutableName, platform: NodeJS.Platform): string {
  const uri = platform === "win32" ? `file:///C:/path/to/${name}.exe` : `file:///path/to/${name}`
  return `"toolsets": { "executables": { "${name}": "${uri}" } }`
}

// The file:// URI of what was written as a plain path, for the error that refuses it
function suggestedUri(value: string): string {
  if (value === "~" || value.startsWith("~/") || value.startsWith("~\\")) {
    return pathToFileURL(path.join(homedir(), value.slice(1))).href
  }
  if (/^[a-zA-Z]:[\\/]/.test(value)) {
    return pathToFileURL(value, { windows: true }).href
  }
  return pathToFileURL(path.resolve(value)).href
}

/**
 * The path of a `file://` URI of a `toolsets.executables` entry, or null when it is the location of a file on another operating
 * system (a URI with a Windows drive letter on macOS or Linux, one without it on Windows). Anything but a `file://` URI of a local
 * file is a configuration error.
 */
export function executableUriToPath(name: ExecutableName, uri: unknown, platform: NodeJS.Platform = process.platform): string | null {
  const where = `toolsets.executables.${name}`
  if (typeof uri !== "string") {
    throw new InvalidConfigurationError(`${where} must be a file:// URI or a list of them, but it has ${JSON.stringify(uri)}`)
  }
  let url: URL | null = null
  try {
    url = new URL(uri)
  } catch {
    // not a URI
  }
  // "C:\..." parses as a URI with the scheme "c:"
  if (url == null || /^[a-zA-Z]:[\\/]/.test(uri)) {
    throw new InvalidConfigurationError(`${where} must be a file:// URI, but "${uri}" is a plain path. Write it as "${suggestedUri(uri)}"`)
  }
  if (url.protocol !== "file:") {
    throw new InvalidConfigurationError(`${where} must be a file:// URI of a file on this machine, but "${uri}" is a ${url.protocol} URI`)
  }
  if (url.hostname !== "" && url.hostname !== "localhost") {
    throw new InvalidConfigurationError(`${where} must be a file:// URI of a file on this machine, but "${uri}" names the host "${url.hostname}"`)
  }
  const isWindowsUri = /^\/[a-zA-Z]:\//.test(url.pathname)
  if (isWindowsUri !== (platform === "win32")) {
    return null
  }
  try {
    return fileURLToPath(url, { windows: platform === "win32" })
  } catch (e: any) {
    throw new InvalidConfigurationError(`${where} has "${uri}", which is not the URI of a file: ${e.message}`)
  }
}

const validatedConfigs = new WeakSet<object>()

/**
 * Checks the names and URIs of `toolsets.executables`. The schema does the same for JSON and YAML configuration, but not for a
 * configuration that is passed programmatically.
 */
export function validateExecutablesConfig(executables: ExecutablesConfig | Nullish): void {
  if (executables == null || validatedConfigs.has(executables)) {
    return
  }
  if (typeof executables !== "object" || Array.isArray(executables)) {
    throw new InvalidConfigurationError(`toolsets.executables must be an object that maps program names to file:// URIs`)
  }
  for (const [key, value] of Object.entries(executables)) {
    if (!isExecutableName(key)) {
      const bare = key.toLowerCase().endsWith(".exe") ? key.slice(0, -".exe".length).toLowerCase() : null
      throw new InvalidConfigurationError(
        bare != null && isExecutableName(bare)
          ? `toolsets.executables has the key "${key}": program names have no .exe suffix, use "${bare}"`
          : `toolsets.executables has the unknown key "${key}". Valid names: ${Object.keys(DEFAULT_EXECUTABLES).join(", ")}`
      )
    }
    if (value == null) {
      continue
    }
    if (Array.isArray(value) && value.length === 0) {
      throw new InvalidConfigurationError(`toolsets.executables.${key} is an empty list. Leave it unset to use the default locations`)
    }
    for (const uri of asArray(value)) {
      executableUriToPath(key, uri)
    }
  }
  validatedConfigs.add(executables)
}

/** The default install locations of a program on the given operating system, in the order they are tried. */
export function defaultExecutableLocations(name: ExecutableName, platform: NodeJS.Platform = process.platform): ReadonlyArray<string> {
  return DEFAULT_EXECUTABLES[name][platform]?.() ?? []
}

interface Candidates {
  isConfigured: boolean
  paths: ReadonlyArray<string>
  // why a default location could not be computed, such as a SystemRoot that is not absolute
  unavailable: string | null
}

function candidates(name: ExecutableName, executables: ExecutablesConfig | Nullish, platform: NodeJS.Platform): Candidates {
  validateExecutablesConfig(executables)
  const entry = executables?.[name]
  if (entry != null) {
    const paths = asArray(entry)
      .map(uri => executableUriToPath(name, uri, platform))
      .filter((it): it is string => it != null)
    return { isConfigured: true, paths, unavailable: null }
  }
  try {
    return { isConfigured: false, paths: defaultExecutableLocations(name, platform), unavailable: null }
  } catch (e: any) {
    return { isConfigured: false, paths: [], unavailable: e.message }
  }
}

function isExecutableFile(file: string, platform: NodeJS.Platform): boolean {
  try {
    // follows a symlink: the location is configured by the project or is a system location, both trusted like the build itself
    if (!statSync(file).isFile()) {
      return false
    }
    if (platform === "win32") {
      return file.toLowerCase().endsWith(".exe")
    }
    accessSync(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

const resolvedPaths = new Map<string, string>()

function findIn(name: ExecutableName, paths: ReadonlyArray<string>, platform: NodeJS.Platform): string | null {
  const key = JSON.stringify([name, platform, paths])
  const cached = resolvedPaths.get(key)
  if (cached != null) {
    return cached
  }
  const found = paths.find(it => isExecutableFile(it, platform)) ?? null
  if (found != null) {
    resolvedPaths.set(key, found)
    log.debug({ program: name, path: found }, "using host program")
  }
  return found
}

function notFoundError(name: ExecutableName, { isConfigured, paths, unavailable }: Candidates, platform: NodeJS.Platform): InvalidConfigurationError {
  const rule = `electron-builder starts ${name} only from an absolute path, never from PATH`
  const tried = paths.map(it => `"${it}"`).join(", ")
  let found: string
  if (isConfigured) {
    found =
      paths.length === 0
        ? `toolsets.executables.${name} has no location for this operating system (a URI with a drive letter is for Windows, one without it for macOS and Linux)`
        : `none of the locations in toolsets.executables.${name} is an executable file on this machine (tried ${tried})`
  } else if (paths.length === 0) {
    found = `${name} has no default install location on ${platform}${unavailable == null ? "" : ` (${unavailable})`}`
  } else {
    found = `${name} is not installed at its default install locations (tried ${tried})`
  }
  return new InvalidConfigurationError(`${found}. ${rule}: set the file:// URI of its location, for example ${exampleEntry(name, platform)}`)
}

/**
 * The absolute path of a host program: the first location of its `toolsets.executables` entry, or else of its default install
 * locations, that is an executable file (on Windows, an `.exe`). Null when there is none; an invalid entry still throws.
 */
export function findExecutable(name: ExecutableName, executables: ExecutablesConfig | Nullish, platform: NodeJS.Platform = process.platform): string | null {
  return findIn(name, candidates(name, executables, platform).paths, platform)
}

/** Like {@link findExecutable}, but a program that is not found is an {@link InvalidConfigurationError} that lists the locations tried. */
export function resolveExecutable(name: ExecutableName, executables: ExecutablesConfig | Nullish, platform: NodeJS.Platform = process.platform): string {
  const found = candidates(name, executables, platform)
  const result = findIn(name, found.paths, platform)
  if (result == null) {
    throw notFoundError(name, found, platform)
  }
  return result
}

const XCRUN = "/usr/bin/xcrun"

let defaultNotarytool: Promise<string> | null = null

/**
 * notarytool: its `toolsets.executables` entry when it is set, otherwise the notarytool of the selected Xcode, which
 * `/usr/bin/xcrun --find notarytool` locates, so that notarytool never runs through an `xcrun` looked up on PATH.
 */
export function resolveNotarytool(executables: ExecutablesConfig | Nullish): Promise<string> {
  validateExecutablesConfig(executables)
  if (executables?.notarytool != null) {
    return Promise.resolve(resolveExecutable("notarytool", executables))
  }
  defaultNotarytool ??= findNotarytoolWithXcrun().catch(e => {
    // looked up again next time, after the developer tools may have been installed
    defaultNotarytool = null
    throw e
  })
  return defaultNotarytool
}

async function findNotarytoolWithXcrun(): Promise<string> {
  const notFound = (reason: string) =>
    new InvalidConfigurationError(
      `${XCRUN} --find notarytool ${reason}. electron-builder starts notarytool only from an absolute path, never from PATH: install Xcode or its command line tools, or set the file:// URI of its location, for example ${exampleEntry("notarytool", "darwin")}`
    )
  let found: string
  try {
    found = (await exec(XCRUN, ["--find", "notarytool"])).trim()
  } catch (e: any) {
    throw notFound(`failed: ${e.message}`)
  }
  if (!path.isAbsolute(found) || !isExecutableFile(found, process.platform)) {
    throw notFound(`did not return the absolute path of an executable file (it returned "${found}")`)
  }
  log.debug({ program: "notarytool", path: found }, "using host program")
  return found
}
