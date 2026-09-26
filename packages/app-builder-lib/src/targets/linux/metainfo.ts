import { exec, InvalidConfigurationError, log } from "builder-util"
import { parseXml, XElement } from "builder-util-runtime"
import { readFile } from "fs/promises"
import { Lazy } from "lazy-val"
import * as path from "path"

/**
 * Handling of the user-supplied AppStream metainfo file (`CommonLinuxOptions.metainfo`).
 *
 * The file is staged by the deb/rpm/pacman (fpm), AppImage and flatpak targets into the
 * target-specific `metainfo` directory. Before staging it is validated (unless
 * `disableMetainfoValidation` is set) — hard errors abort the build, softer issues are logged
 * as warnings, and, when `appstreamcli` happens to be installed, its `validate --no-net`
 * result is reported as a non-fatal warning.
 *
 * @see https://www.freedesktop.org/software/appstream/docs/chap-Quickstart.html
 */

export interface MetainfoOptions {
  /** Project directory the `metainfo` option is resolved against. */
  projectDir: string
  /** The `metainfo` option value — path to the metainfo XML file, relative to `projectDir` (or absolute). */
  metainfo: string
  /** The application id (`appInfo.id`) — the expected AppStream component id. */
  appId: string
  /** The `.desktop` file name (including the `.desktop` suffix) installed by the current target. */
  expectedDesktopId: string
  /** When true the validator (including the optional `appstreamcli` check) is skipped entirely; staging still happens. */
  disableValidation: boolean
}

export interface StagedMetainfo {
  /** Absolute path to the source metainfo file. */
  file: string
  /** File name to install under the target's metainfo directory (e.g. `/usr/share/metainfo`). */
  installBasename: string
}

/**
 * Validates the metainfo file (unless disabled) and computes where it should be installed.
 *
 * Installed basename rule: the user's basename is kept when it already ends in `.metainfo.xml`
 * (AppStream spec naming) or `.appdata.xml` (legacy naming, still expected by appimagetool /
 * AppImageHub for AppImages) — the choice between the two is deliberately never warned about.
 * Any other name is normalized to `<component-id>.metainfo.xml`.
 */
export async function prepareMetainfoFile(options: MetainfoOptions): Promise<StagedMetainfo> {
  const file = path.resolve(options.projectDir, options.metainfo)

  let componentId: string | null = null
  if (options.disableValidation) {
    log.debug({ file: log.filePath(file) }, "metainfo validation is disabled (disableMetainfoValidation), staging file as-is")
  } else {
    componentId = await validateMetainfoFile(file, options.appId, options.expectedDesktopId)
    await validateWithAppstreamCli(file)
  }

  const basename = path.basename(file)
  let installBasename: string
  if (/\.(metainfo|appdata)\.xml$/.test(basename)) {
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
  return { file, installBasename }
}

/**
 * Two-tier validation of an AppStream metainfo file.
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
 * @returns the component id from the file, or null when it could not be determined
 */
export async function validateMetainfoFile(file: string, appId: string, expectedDesktopId: string): Promise<string | null> {
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
      `Invalid AppStream metainfo file ${file}:\n  - ${errors.join("\n  - ")}\nSee https://www.freedesktop.org/software/appstream/docs/chap-Quickstart.html (set disableMetainfoValidation to skip this check)`
    )
  }

  const componentId = root!.elementValueOrEmpty("id").trim()
  // simple reverse-DNS heuristic: at least one dot, no whitespace
  if (!/^\S+\.\S+$/.test(componentId)) {
    log.warn({ id: componentId, file: log.filePath(file) }, 'metainfo component <id> should be a reverse-DNS identifier (e.g. "com.example.MyApp")')
  }
  if (componentId !== appId) {
    log.warn({ id: componentId, appId, file: log.filePath(file) }, "metainfo component <id> differs from the configured appId")
  }

  const launchable = root!.getElements("launchable").find(it => it.attributes?.type === "desktop-id")
  if (launchable == null) {
    log.warn(
      { expected: expectedDesktopId, file: log.filePath(file) },
      `metainfo file has no <launchable type="desktop-id"> element — software centers may not be able to associate the entry with the installed .desktop file`
    )
  } else if (launchable.value.trim() !== expectedDesktopId) {
    log.warn(
      { launchable: launchable.value.trim(), expected: expectedDesktopId, file: log.filePath(file) },
      `metainfo <launchable type="desktop-id"> does not match the .desktop file installed by this target`
    )
  }

  return componentId
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

// probe once per process — appstreamcli availability does not change during a build
const appstreamCliVersion = new Lazy<string | null>(async () => {
  try {
    return (await exec("appstreamcli", ["--version"])).trim()
  } catch (e: any) {
    log.debug({ error: e.message }, "appstreamcli is not installed — skipping external metainfo validation")
    return null
  }
})

/**
 * Runs `appstreamcli validate --no-net` when the tool is available on PATH.
 * Failures are reported as warnings and never fail the build; an absent tool is only debug-logged.
 */
async function validateWithAppstreamCli(file: string): Promise<void> {
  if ((await appstreamCliVersion.value) == null) {
    return
  }
  try {
    const stdout = await exec("appstreamcli", ["validate", "--no-net", file])
    log.debug({ file: log.filePath(file), output: stdout.trim() }, "appstreamcli validation passed")
  } catch (e: any) {
    // builder-util's exec folds stdout/stderr into the ExecError message
    log.warn({ file: log.filePath(file), output: e.message }, "appstreamcli validate reported issues (non-fatal)")
  }
}
