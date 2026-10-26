import { asArray, Nullish } from "builder-util-runtime"
import { AsyncLocalStorage } from "async_hooks"
import { accessSync, constants, statSync } from "fs"
import { homedir } from "os"
import * as path from "path"
import { fileURLToPath, pathToFileURL } from "url"
import { log } from "./log.js"
import { exec, InvalidConfigurationError } from "./util.js"

/**
 * The name of a host program that electron-builder starts, as a key of `toolsets.executables`. Names are the same
 * on every host and have no `.exe` suffix (`powershell` is `powershell.exe` on Windows).
 */
export type ExecutableName =
  | "powershell"
  | "pwsh"
  | "prlctl"
  | "wine"
  | "mono"
  | "productbuild"
  | "pkgbuild"
  | "hdiutil"
  | "codesign"
  | "actool"
  | "tiffutil"
  | "sips"
  | "zip"
  | "notarytool"
  | "stapler"
  | "pkgutil"
  | "lzip"
  | "snapcraft"
  | "flatpak"
  | "flatpak-builder"

/**
 * One `file://` URI, or a list of them, of an executable file on the build machine, such as `file:///opt/homebrew/bin/mono` or
 * `file:///C:/Program%20Files/PowerShell/7/pwsh.exe`. The first that is an executable file is used, so one list can name the
 * locations of several hosts: a URI with a Windows drive letter is skipped on macOS and Linux, and one without it on Windows.
 * Plain paths, `~` and URIs that name another host (`file://server/share/...`) are not accepted.
 */
export type ExecutableLocation = string | string[]

/**
 * The locations of host programs, by {@link ExecutableName}. An unset or `null` entry uses the built-in default locations.
 */
export type ExecutablesConfig = { readonly [K in ExecutableName]?: ExecutableLocation | null }

// Host programs are started by absolute path, never by a bare name: a bare name is resolved through PATH (on Windows also the
// current directory), where package managers prepend directories such as node_modules/.bin that a dependency can write to.
// Each program comes from its `toolsets.executables` entry when it is set, otherwise from the default install locations below.

type DefaultLocations = Partial<Record<NodeJS.Platform, () => ReadonlyArray<string>>>

// The value of an environment variable in any casing: a host can have SYSTEMROOT rather than SystemRoot, which only Windows' own
// process.env finds by either name (off Windows, as in tests, the keys are case-sensitive)
function windowsEnv(name: string): string | undefined {
  const value = process.env[name]
  if (value) {
    return value
  }
  const lowerName = name.toLowerCase()
  return Object.entries(process.env).find(([key, it]) => key.toLowerCase() === lowerName && it != null && it !== "")?.[1]
}

// A Windows directory from the first of `names` that is set (the first name is the one errors use), accepted only as a drive-absolute
// path: a relative, drive-relative ("\Program Files") or UNC value would be resolved against the current directory or drive, or reach
// out to another host
function windowsDirectory(...names: [string, ...Array<string>]): string {
  const value = names.map(windowsEnv).find(it => it != null)
  if (value == null) {
    throw new Error(`${names[0]} is not set`)
  }
  if (!/^[a-zA-Z]:[\\/]/.test(value)) {
    throw new Error(`${names[0]} is not an absolute path (${value})`)
  }
  return value
}

const inUsrBinOnMac = (name: string): DefaultLocations => ({ darwin: () => [`/usr/bin/${name}`] })
const inUsrBinOnLinux = (name: string): DefaultLocations => ({ linux: () => [`/usr/bin/${name}`, `/usr/local/bin/${name}`] })

/**
 * The default install locations of each host program, in the order they are tried. Where a program has several, the order is that
 * of the default `PATH` (Homebrew's shellenv and MacPorts prepend their `bin`; /etc/paths puts /usr/local/bin first on macOS).
 * Windows locations come from `SystemRoot` (or `windir`) and `ProgramFiles`, which must be drive-absolute.
 */
export const DEFAULT_EXECUTABLES: Readonly<Record<ExecutableName, DefaultLocations>> = {
  // the in-box Windows PowerShell 5.1, under SystemRoot (or windir, its legacy name). A 32-bit Node is redirected to SysWOW64, like any
  // System32 path. electron-updater looks Windows PowerShell up on the end user's machine itself (builder-util-runtime).
  powershell: { win32: () => [path.win32.join(windowsDirectory("SystemRoot", "windir"), "System32", "WindowsPowerShell", "v1.0", "powershell.exe")] },
  // PowerShell 7 from Microsoft's packages: the MSI installer on Windows, the pkg or Homebrew cask on macOS, deb/rpm or snap on Linux
  pwsh: {
    win32: () => [path.win32.join(windowsDirectory("ProgramFiles"), "PowerShell", "7", "pwsh.exe")],
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
  // no fixed location: by default it is the notarytool of the selected Xcode, found with /usr/bin/xcrun (see Executables.notarytool)
  notarytool: {},
  // likewise the stapler of the selected Xcode, found with /usr/bin/xcrun (see Executables.stapler)
  stapler: {},
  pkgutil: { darwin: () => ["/usr/sbin/pkgutil"] },
  // on macOS lzip comes from the linuxToolsMac toolset
  lzip: inUsrBinOnLinux("lzip"),
  snapcraft: {
    darwin: () => ["/opt/homebrew/bin/snapcraft", "/usr/local/bin/snapcraft"],
    linux: () => ["/snap/bin/snapcraft", "/usr/bin/snapcraft"],
  },
  flatpak: inUsrBinOnLinux("flatpak"),
  "flatpak-builder": inUsrBinOnLinux("flatpak-builder"),
}

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

/** The locations of the `toolsets.executables` entry of a program for an operating system: none when it has no entry, or none for it. */
function configuredLocations(name: ExecutableName, executables: ExecutablesConfig | Nullish, platform: NodeJS.Platform): Array<string> {
  validateExecutablesConfig(executables)
  const entry = executables?.[name]
  return entry == null
    ? []
    : asArray(entry)
        .map(uri => executableUriToPath(name, uri, platform))
        .filter((it): it is string => it != null)
}

/**
 * Where to look for a program: the locations of its entry for this operating system, which replace the default locations, or the
 * default locations when there are none. An entry applies only on the hosts it has a location for, so that one configuration can
 * serve several.
 */
function candidates(name: ExecutableName, executables: ExecutablesConfig | Nullish, platform: NodeJS.Platform): Candidates {
  const paths = configuredLocations(name, executables, platform)
  if (paths.length > 0) {
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

// What a program resolved to, by name, operating system and candidate locations, within one Executables.run scope
type ResolvedPaths = Map<string, string>

function findIn(name: ExecutableName, paths: ReadonlyArray<string>, platform: NodeJS.Platform, cache: ResolvedPaths): string | null {
  const key = JSON.stringify([name, platform, paths])
  const cached = cache.get(key)
  if (cached != null) {
    return cached
  }
  const found = paths.find(it => isExecutableFile(it, platform)) ?? null
  if (found != null) {
    cache.set(key, found)
    log.debug({ program: name, path: found }, "using host program")
  }
  return found
}

function notFoundError(name: ExecutableName, { isConfigured, paths, unavailable }: Candidates, platform: NodeJS.Platform): InvalidConfigurationError {
  const rule = `electron-builder starts ${name} only from an absolute path, never from PATH`
  const tried = paths.map(it => `"${it}"`).join(", ")
  let found: string
  if (isConfigured) {
    found = `none of the locations in toolsets.executables.${name} is an executable file on this machine (tried ${tried})`
  } else if (paths.length === 0) {
    found = `${name} has no default install location on ${platform}${unavailable == null ? "" : ` (${unavailable})`}`
  } else {
    found = `${name} is not installed at its default install locations (tried ${tried})`
  }
  return new InvalidConfigurationError(`${found}. ${rule}: set the file:// URI of its location, for example ${exampleEntry(name, platform)}`)
}

/**
 * The absolute path of a host program: the first location of its `toolsets.executables` entry, or else of its default install
 * locations when the entry has none for this operating system, that is an executable file (on Windows, an `.exe`). Null when there
 * is none; an invalid entry still throws.
 * @internal use {@link Executables}; exported for tests
 */
export function findExecutable(
  name: ExecutableName,
  executables: ExecutablesConfig | Nullish,
  platform: NodeJS.Platform = process.platform,
  cache: ResolvedPaths = new Map()
): string | null {
  return findIn(name, candidates(name, executables, platform).paths, platform, cache)
}

/**
 * Like {@link findExecutable}, but a program that is not found is an {@link InvalidConfigurationError} that lists the locations tried.
 * @internal use {@link Executables}; exported for tests
 */
export function resolveExecutable(
  name: ExecutableName,
  executables: ExecutablesConfig | Nullish,
  platform: NodeJS.Platform = process.platform,
  cache: ResolvedPaths = new Map()
): string {
  const found = candidates(name, executables, platform)
  const result = findIn(name, found.paths, platform, cache)
  if (result == null) {
    throw notFoundError(name, found, platform)
  }
  return result
}

const XCRUN = "/usr/bin/xcrun"

/** The developer tools of the selected Xcode that have no fixed location, and are found with `/usr/bin/xcrun --find`. */
type XcodeToolName = "notarytool" | "stapler"

async function findWithXcrun(name: XcodeToolName): Promise<string> {
  const notFound = (reason: string) =>
    new InvalidConfigurationError(
      `${XCRUN} --find ${name} ${reason}. electron-builder starts ${name} only from an absolute path, never from PATH: install Xcode or its command line tools, or set the file:// URI of its location, for example ${exampleEntry(name, "darwin")}`
    )
  let found: string
  try {
    found = (await exec(XCRUN, ["--find", name])).trim()
  } catch (e: any) {
    throw notFound(`failed: ${e.message}`)
  }
  if (!path.isAbsolute(found) || !isExecutableFile(found, process.platform)) {
    throw notFound(`did not return the absolute path of an executable file (it returned "${found}")`)
  }
  log.debug({ program: name, path: found }, "using host program")
  return found
}

interface Scope {
  readonly config: ExecutablesConfig | Nullish
  readonly resolved: ResolvedPaths
  // what /usr/bin/xcrun --find found, by tool
  readonly xcodeTools: Map<XcodeToolName, Promise<string>>
}

const newScope = (config: ExecutablesConfig | Nullish): Scope => ({ config, resolved: new Map(), xcodeTools: new Map() })

const scopes = new AsyncLocalStorage<Scope>()
// outside any Executables.run: the default locations
const defaultScope: Scope = newScope(null)

/**
 * The host programs electron-builder starts, from the `toolsets.executables` configuration of the current build. A build runs inside
 * {@link Executables.run}, which scopes the configuration to everything the build does, including its asynchronous work, so that
 * builds in one process do not see each other's configuration. Outside any build the default install locations are used. A program
 * is never looked up on `PATH`.
 */
export class Executables {
  /**
   * Runs `fn` with `executables` (the `toolsets.executables` configuration) as the configuration of every program it resolves.
   * The configuration is checked first: an unknown name, a name with `.exe`, or a location that is not a `file://` URI of a local file
   * is an {@link InvalidConfigurationError}.
   */
  static run<T>(executables: ExecutablesConfig | Nullish, fn: () => T): T {
    validateExecutablesConfig(executables)
    return scopes.run(newScope(executables), fn)
  }

  private static get scope(): Scope {
    return scopes.getStore() ?? defaultScope
  }

  /** The absolute path of a program, or an {@link InvalidConfigurationError} that lists the locations tried. */
  static resolve(name: ExecutableName): string {
    const { config, resolved } = Executables.scope
    return resolveExecutable(name, config, process.platform, resolved)
  }

  /** The absolute path of a program, or null when it is not installed (for a program that is optional, like PowerShell 7). */
  static find(name: ExecutableName): string | null {
    const { config, resolved } = Executables.scope
    return findExecutable(name, config, process.platform, resolved)
  }

  /** The `toolsets.executables` configuration of the current {@link Executables.run} scope (none outside of one). */
  static get configuration(): ExecutablesConfig | Nullish {
    return Executables.scope.config
  }

  /**
   * Whether the configuration has a location of the program for this operating system. An entry with locations for other operating
   * systems only, from a configuration shared by several hosts, does not count.
   */
  static isConfigured(name: ExecutableName): boolean {
    return configuredLocations(name, Executables.configuration, process.platform).length > 0
  }

  /**
   * notarytool: its `toolsets.executables` entry when it is set, otherwise the notarytool of the selected Xcode, which
   * `/usr/bin/xcrun --find notarytool` locates, so that notarytool never runs through an `xcrun` looked up on PATH.
   */
  static notarytool(): Promise<string> {
    return Executables.xcodeTool("notarytool")
  }

  /**
   * stapler (`stapler validate` checks a stapled notarization ticket): its `toolsets.executables` entry when it is set, otherwise
   * the stapler of the selected Xcode, which `/usr/bin/xcrun --find stapler` locates.
   */
  static stapler(): Promise<string> {
    return Executables.xcodeTool("stapler")
  }

  private static xcodeTool(name: XcodeToolName): Promise<string> {
    if (Executables.isConfigured(name)) {
      return Promise.resolve(Executables.resolve(name))
    }
    const { xcodeTools } = Executables.scope
    let found = xcodeTools.get(name)
    if (found == null) {
      found = findWithXcrun(name).catch(e => {
        // looked up again next time, after the developer tools may have been installed
        xcodeTools.delete(name)
        throw e
      })
      xcodeTools.set(name, found)
    }
    return found
  }
}
