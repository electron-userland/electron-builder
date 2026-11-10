import { exec, Executables, InvalidConfigurationError, log } from "builder-util"
import { Nullish, parseXml, XElement } from "builder-util-runtime"
import { readFile } from "fs/promises"
import * as path from "path"
import { LinuxMetainfoConfiguration } from "../../options/linuxOptions.js"
import type { PlatformPackager } from "../../platformPackager.js"

/**
 * Handling of the user-supplied AppStream metainfo file (`LinuxAppStreamOptions.metainfo`).
 *
 * The file is staged by the deb/rpm/pacman/apk (fpm), AppImage and flatpak targets into the
 * target-specific `metainfo` directory. Before staging it is validated (unless `validate: false`)
 * — hard errors abort the build, softer issues are logged as warnings, and, when `appstreamcli`
 * happens to be installed, its `validate --no-net` result is reported as a non-fatal warning.
 *
 * @see https://www.freedesktop.org/software/appstream/docs/chap-Quickstart.html
 */

/** The packager the file is resolved and validated for: every target and arch of one packager shares the checks of one file. */
export type MetainfoPackager = Pick<PlatformPackager<any>, "getResource">

export interface MetainfoOptions {
  packager: MetainfoPackager
  /** The `metainfo` option value. */
  metainfo: string | LinuxMetainfoConfiguration
  /** The application id the current target uses — the expected AppStream component id. */
  appId: string
  /** The `.desktop` file name (including the `.desktop` suffix) installed by the current target. */
  expectedDesktopId: string
}

export interface StagedMetainfo {
  /** Absolute path to the source metainfo file. */
  file: string
  /**
   * File name to install under the target's metainfo directory (e.g. `/usr/share/metainfo`). The flatpak target ignores it
   * and always installs the file as `<flatpak id>.metainfo.xml`, the only name flatpak-builder composes AppStream data from.
   */
  installBasename: string
}

interface ParsedMetainfo {
  componentId: string
  /** the values of the `<launchable type="desktop-id">` elements */
  desktopIds: Array<string>
}

// the fpm formats installed where AppStream consumers look (/usr/share/metainfo). freebsd installs under /usr/local, and p5p (Solaris)
// and sh (self-extracting script) have no AppStream consumer
const METAINFO_FPM_FORMATS = new Set(["deb", "rpm", "pacman", "apk"])

/** Whether the fpm target `format` stages the metainfo file. */
export function fpmFormatUsesMetainfo(format: string): boolean {
  return METAINFO_FPM_FORMATS.has(format)
}

/** Normalizes the string and object forms of the option. Returns null when the option is not set. */
export function normalizeMetainfoOption(value: string | LinuxMetainfoConfiguration | Nullish): Required<LinuxMetainfoConfiguration> | null {
  if (value == null) {
    return null
  }
  if (typeof value === "string") {
    if (value.trim().length === 0) {
      throw new InvalidConfigurationError(`metainfo must name a file when it is a string, but found ${JSON.stringify(value)}`)
    }
    return { file: value, validate: true }
  }
  if (typeof value.file !== "string" || value.file.trim().length === 0) {
    // also the result of merging `linux.metainfo: "file.xml"` with a target's `metainfo: { validate: false }`: an object replaces a string
    throw new InvalidConfigurationError(`metainfo.file is required when metainfo is an object, but found ${JSON.stringify(value)}`)
  }
  return { file: value.file, validate: value.validate !== false }
}

// one parse (and appstreamcli run) per packager and file, shared by all its targets and archs
const parsedCache = new WeakMap<MetainfoPackager, Map<string, Promise<ParsedMetainfo>>>()

/**
 * Resolves and validates the metainfo file (unless disabled) and computes where it should be installed.
 *
 * Installed basename rule: a basename ending in `.appdata.xml` (legacy naming, still expected by
 * appimagetool / AppImageHub for AppImages) is kept. Any other name is normalized to
 * `<component-id>.metainfo.xml`, the name the AppStream spec and `appstreamcli validate` expect.
 */
export async function prepareMetainfoFile(options: MetainfoOptions): Promise<StagedMetainfo> {
  const { file: configured, validate } = normalizeMetainfoOption(options.metainfo)!
  // getResource throws InvalidConfigurationError when the file is found neither in the build resources nor in the project dir
  const file = (await options.packager.getResource(configured))!

  let componentId: string | null = null
  if (validate) {
    let perFile = parsedCache.get(options.packager)
    if (perFile == null) {
      perFile = new Map()
      parsedCache.set(options.packager, perFile)
    }
    let parsed = perFile.get(file)
    if (parsed == null) {
      parsed = parseAndValidate(file).then(async it => {
        await validateWithAppstreamCli(file)
        return it
      })
      perFile.set(file, parsed)
    }
    const result = await parsed
    warnForTarget(result, file, options.appId, options.expectedDesktopId, options.packager)
    componentId = result.componentId
  } else {
    log.debug({ file: log.filePath(file) }, "metainfo validation is disabled (validate: false), staging file as-is")
  }

  const basename = path.basename(file)
  let installBasename: string
  if (basename.endsWith(".appdata.xml")) {
    installBasename = basename
  } else {
    if (componentId == null) {
      // validation was skipped — still try to read the component id for the installed file name
      componentId = (await tryReadComponentId(file)) ?? options.appId
    }
    installBasename = `${componentId}.metainfo.xml`
  }

  // the basename flows into filesystem paths (stage dirs, fpm `src=dest` mappings) — reject path separators / NUL
  if (/[/\\]/.test(installBasename) || [...installBasename].some(c => c.charCodeAt(0) === 0)) {
    throw new InvalidConfigurationError(`metainfo component id produces an invalid file name "${installBasename}" — remove any path separators or NUL characters`)
  }

  // one success line per build and file: every target and arch of the packager stages the same file
  const appstreamcli = validate ? ((await findAppstreamCli())?.version ?? null) : null
  log
    .once(`metainfo-staged:${file}`, options.packager)
    .info({ file: path.basename(file), validated: validate ? "yes" : "no", ...(appstreamcli == null ? {} : { appstreamcli }) }, "metainfo staged")

  return { file, installBasename }
}

/**
 * Two-tier validation of an AppStream metainfo file, without caching or deduplication of the warnings.
 *
 * Hard failures (accumulated, then thrown as a single {@link InvalidConfigurationError}):
 * missing/unreadable file, malformed XML, root element not `<component>`, `type` attribute not
 * `desktop-application` (the legacy alias `desktop` is accepted), or a missing/empty required
 * child (`id`, `name`, `summary`, `description`, `metadata_license`).
 *
 * Warnings (logged, never fatal): component id not reverse-DNS-shaped, component id differing
 * from `appId`, and a missing or mismatching `<launchable type="desktop-id">` for the `.desktop`
 * file the current target installs.
 *
 * @returns the component id from the file
 */
export async function validateMetainfoFile(file: string, appId: string, expectedDesktopId: string): Promise<string> {
  const parsed = await parseAndValidate(file)
  warnForTarget(parsed, file, appId, expectedDesktopId, null)
  return parsed.componentId
}

/** The checks that do not depend on the target: hard failures and the reverse-DNS warning. */
async function parseAndValidate(file: string): Promise<ParsedMetainfo> {
  const errors: Array<string> = []

  let content: string | null = null
  try {
    content = await readFile(file, "utf8")
  } catch (e: any) {
    errors.push(`cannot read metainfo file: ${e.message}`)
  }

  let root: XElement | null = null
  if (content != null) {
    try {
      root = parseXml(content)
    } catch (e: any) {
      errors.push(`metainfo file is not well-formed XML: ${e.message}`)
    }
  }

  if (root != null) {
    if (root.name !== "component") {
      errors.push(`root element must be <component>, but found <${root.name}>`)
    } else {
      const type = root.attributes?.type
      // "desktop" is the legacy alias of "desktop-application" (https://www.freedesktop.org/software/appstream/docs/sect-Metadata-Application.html)
      if (type !== "desktop-application" && type !== "desktop") {
        errors.push(`component "type" attribute must be "desktop-application" for a desktop application, but found ${type == null ? "no type attribute" : `"${type}"`}`)
      }
      for (const name of ["id", "name", "summary", "metadata_license"]) {
        if (isElementValueEmpty(root.elementOrNull(name))) {
          errors.push(`required element <${name}> is missing or empty`)
        }
      }
      const description = root.elementOrNull("description")
      if (description == null || (isElementValueEmpty(description) && (description.elements == null || description.elements.length === 0))) {
        errors.push(`required element <description> is missing or empty`)
      }
    }
  }

  if (errors.length > 0) {
    throw new InvalidConfigurationError(
      `Invalid AppStream metainfo file ${file}:\n  - ${errors.join("\n  - ")}\nSee https://www.freedesktop.org/software/appstream/docs/chap-Quickstart.html (set metainfo: { file, validate: false } to skip this check)`
    )
  }

  const componentId = root!.elementValueOrEmpty("id").trim()
  // simple reverse-DNS heuristic: at least one dot, no whitespace
  if (!/^\S+\.\S+$/.test(componentId)) {
    log.warn({ id: componentId, file: log.filePath(file) }, 'metainfo component <id> should be a reverse-DNS identifier (e.g. "com.example.MyApp")')
  }

  const desktopIds = root!
    .getElements("launchable")
    .filter(it => it.attributes?.type === "desktop-id")
    .map(it => it.value.trim())
  return { componentId, desktopIds }
}

/**
 * The checks that depend on the target (its app id and `.desktop` name). With a `scope`, each distinct warning is logged once per
 * packager: every arch of a target, and the targets sharing an app id and `.desktop` name, would otherwise repeat it.
 */
function warnForTarget(parsed: ParsedMetainfo, file: string, appId: string, expectedDesktopId: string, scope: object | null) {
  const warn = (key: string, fields: Record<string, string>, message: string) => {
    if (scope == null) {
      log.warn(fields, message)
    } else {
      log.once(`metainfo:${key}:${file}:${JSON.stringify(fields)}`, scope).warn(fields, message)
    }
  }

  const { componentId, desktopIds } = parsed
  if (componentId !== appId) {
    warn("id", { id: componentId, appId, file: log.filePath(file) }, "metainfo component <id> differs from the configured appId")
  }
  if (desktopIds.length === 0) {
    warn(
      "launchable",
      { expected: expectedDesktopId, file: log.filePath(file) },
      `metainfo file has no <launchable type="desktop-id"> element — software centers may not be able to associate the entry with the installed .desktop file`
    )
  } else if (!desktopIds.includes(expectedDesktopId)) {
    warn(
      "launchable",
      { launchable: desktopIds.join(", "), expected: expectedDesktopId, file: log.filePath(file) },
      `metainfo <launchable type="desktop-id"> does not match the .desktop file installed by this target`
    )
  }
}

function isElementValueEmpty(element: XElement | null): boolean {
  return element == null || element.value.trim().length === 0
}

async function tryReadComponentId(file: string): Promise<string | null> {
  try {
    const id = parseXml(await readFile(file, "utf8"))
      .elementValueOrEmpty("id")
      .trim()
    return id.length === 0 ? null : id
  } catch (_e: any) {
    return null
  }
}

// what `appstreamcli --version` printed, by resolved path — probed once per binary and process, since the path a scope
// resolves can differ between builds (toolsets.executables) but the same binary keeps its version
const appstreamCliVersions = new Map<string, Promise<{ path: string; version: string } | null>>()

/**
 * The absolute path and version of appstreamcli, an optional tool: null when it is not installed (at its
 * `toolsets.executables` location or the default install locations — never looked up on PATH, where package managers
 * prepend directories such as node_modules/.bin) or when it does not run, which only skips the external validation.
 */
function findAppstreamCli(): Promise<{ path: string; version: string } | null> {
  const file = Executables.find("appstreamcli")
  if (file == null) {
    log.debug(null, "appstreamcli is not installed — skipping external metainfo validation")
    return Promise.resolve(null)
  }
  let probed = appstreamCliVersions.get(file)
  if (probed == null) {
    probed = exec(file, ["--version"]).then(
      it => ({ path: file, version: it.trim() }),
      (e: any) => {
        log.debug({ error: e.message }, "appstreamcli failed to run — skipping external metainfo validation")
        return null
      }
    )
    appstreamCliVersions.set(file, probed)
  }
  return probed
}

/**
 * Runs `appstreamcli validate --no-net` when the tool is installed (see {@link findAppstreamCli}).
 * Failures are reported as warnings and never fail the build; an absent tool is only debug-logged.
 */
async function validateWithAppstreamCli(file: string): Promise<void> {
  const appstreamCli = await findAppstreamCli()
  if (appstreamCli == null) {
    return
  }
  try {
    const stdout = await exec(appstreamCli.path, ["validate", "--no-net", file])
    log.debug({ file: log.filePath(file), output: stdout.trim() }, "appstreamcli validation passed")
  } catch (e: any) {
    // builder-util's exec folds stdout/stderr into the ExecError message
    log.warn({ file: log.filePath(file), output: e.message }, "appstreamcli validate reported issues (non-fatal)")
  }
}
