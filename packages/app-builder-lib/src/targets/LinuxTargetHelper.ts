import { asArray, exists, InvalidConfigurationError, isEmptyOrSpaces, log } from "builder-util"
import { deepAssign } from "builder-util-runtime"
import { outputFile } from "fs-extra"
import { Lazy } from "lazy-val"
import { join } from "path"
import * as semver from "semver"
import { CompressionLevel } from "../core"
import { LinuxPackager } from "../linuxPackager"
import { CommonLinuxOptions } from "../options/linuxOptions"
import { SnapCore } from "./snap/SnapTarget"
import { SnapCore24 } from "./snap/core24"
import { SnapCoreCustom } from "./snap/coreCustom"
import { SnapCoreLegacy } from "./snap/coreLegacy"
import { IconInfo } from "../util/iconConverter"

/**
 * Escape a string value for use in a freedesktop .desktop file string field
 * (Name, Comment, StartupWMClass, etc.).
 *
 * The freedesktop Desktop Entry Specification requires that the following
 * characters be escaped in string / localestring values:
 *   \n  →  \\n      (newline — would inject new key=value lines otherwise)
 *   \r  →  \\r
 *   \t  →  \\t
 *   \\  →  \\\\
 *
 * Without escaping, a productName or description containing a literal newline
 * can inject arbitrary key=value pairs into the generated .desktop file,
 * potentially overriding the Exec key.
 *
 * @see https://specifications.freedesktop.org/desktop-entry-spec/desktop-entry-spec-latest.html#value-types
 */
function desktopStringEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
}

/**
 * Characters that require an Exec argument to be double-quoted per the
 * freedesktop Desktop Entry Specification.  Plain alphanumeric args and
 * field codes must NOT be wrapped in quotes.
 *
 * @see https://specifications.freedesktop.org/desktop-entry-spec/desktop-entry-spec-latest.html#exec-variables
 */
const EXEC_RESERVED_RE = /[\s"'`\\<>~|&;$*?#()]/

/**
 * Quote a single argument for use in a .desktop file Exec key.
 *
 * Field codes (`%f`, `%u`, `%F`, `%U`, etc.) MUST be left unquoted — the
 * desktop launcher only expands them in unquoted token positions.  Wrapping
 * them in `"…"` causes the launcher to treat them as literal strings, which
 * breaks file-association / drag-and-drop functionality.
 *
 * For all other arguments, double-quoting is used when the argument contains
 * any character that would be misinterpreted by the launcher without quoting
 * (spaces, shell metacharacters, etc.).  Safe plain-word args are passed
 * through unchanged to keep the Exec line readable.
 *
 * @see https://specifications.freedesktop.org/desktop-entry-spec/desktop-entry-spec-latest.html#exec-variables
 */
function desktopExecArgEscape(arg: string): string {
  // Field codes (%f, %u, %F, %U, %i, %c, %k, …) must never be quoted.
  if (/^%[a-zA-Z]$/.test(arg)) {
    return arg
  }
  // Only quote when the arg actually contains characters that need it.
  if (EXEC_RESERVED_RE.test(arg)) {
    return `"${arg.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
  }
  return arg
}

function mapLinuxCompressionToSnap(level: CompressionLevel | null | undefined): "xz" | "lzo" | undefined {
  if (level === "store") {
    return "lzo"
  }
  if (level === "maximum") {
    return "xz"
  }
  return undefined
}

export const installPrefix = "/opt"

export class LinuxTargetHelper {
  private readonly iconPromise = new Lazy(() => this.computeDesktopIcons())

  private readonly mimeTypeFilesPromise = new Lazy(() => this.computeMimeTypeFiles())

  maxIconPath: string | null = null

  constructor(private packager: LinuxPackager) {}

  get icons(): Promise<Array<IconInfo>> {
    return this.iconPromise.value
  }

  get mimeTypeFiles(): Promise<string | null> {
    return this.mimeTypeFilesPromise.value
  }

  getSnapCore(): SnapCore<any> {
    const { snapcraft, snap: legacySnap } = this.packager.config
    if (snapcraft != null && legacySnap != null) {
      log.warn("Both `snapcraft` and `snap` configurations are present. `snapcraft` takes precedence; please remove the `snap` key to silence this warning.")
    }

    // Merge linux-level options (category, description, mimeTypes, etc.) as the base so they
    // propagate into the generated snapcraft.yaml and .desktop file without requiring users to
    // duplicate them under core24/core18/etc. Per-core options always win for conflicts.
    // linux.compression is a CompressionLevel ("store"/"normal"/"maximum"); snap compression is an
    // algorithm ("xz"/"lzo"). Map the level to the nearest algorithm; per-core options override.
    const { compression: linuxCompression, ...linuxOptions } = this.packager.platformSpecificBuildOptions
    const snapLinuxOptions = { ...linuxOptions, compression: mapLinuxCompressionToSnap(linuxCompression) }

    if (snapcraft != null) {
      const core = snapcraft.base
      const options = snapcraft[core] || {}
      switch (core) {
        case "core18":
        case "core20":
        case "core22":
          if (!this.isElectronVersionGreaterOrEqualThan("4.0.0")) {
            if (!this.isElectronVersionGreaterOrEqualThan("2.0.0-beta.1")) {
              throw new InvalidConfigurationError("Electron 2 and higher is required to build Snap with core18/core20/core22")
            }
            log.warn(null, "electron 4 and higher is highly recommended for Snap with core18/core20/core22")
          }
          return new SnapCoreLegacy(this.packager, this, deepAssign({}, snapLinuxOptions, { base: core, ...options }))
        case "core24":
          if (!this.isElectronVersionGreaterOrEqualThan("28.0.0")) {
            if (!this.isElectronVersionGreaterOrEqualThan("25.0.0")) {
              throw new InvalidConfigurationError("Electron 25 and higher is required to build Snap with core24")
            }
            log.warn(null, "electron 28 and higher is highly recommended for Snap with core24")
          }
          return new SnapCore24(this.packager, this, deepAssign({}, snapLinuxOptions, options))
        case "custom":
          // Pass-through: do not inject linux options into user-supplied yaml
          return new SnapCoreCustom(this.packager, this, snapcraft.custom || {})
      }
    }

    if (legacySnap != null) {
      log.warn(
        {
          reason: "`snap` configuration is deprecated",
          docs: "https://www.electron.build/snapcraft",
        },
        "please consider migrating `snap` configuration to `snapcraft.<core>` and remove `snap` configuration"
      )
    }
    return new SnapCoreLegacy(this.packager, this, deepAssign({}, snapLinuxOptions, legacySnap ?? {}))
  }

  isElectronVersionGreaterOrEqualThan(version: string, fallback?: string): boolean {
    const electronVersion = this.packager.config.electronVersion
    if (!electronVersion) {
      return fallback ? semver.gte(fallback, version) : true
    }
    return semver.gte(electronVersion, version)
  }

  private async computeMimeTypeFiles(): Promise<string | null> {
    const items: Array<string> = []
    for (const fileAssociation of this.packager.fileAssociations) {
      if (!fileAssociation.mimeType) {
        continue
      }

      const data = `<mime-type type="${fileAssociation.mimeType}">
  <glob pattern="*.${fileAssociation.ext}"/>
    ${fileAssociation.description ? `<comment>${fileAssociation.description}</comment>` : ""}
  <icon name="x-office-document" />
</mime-type>`
      items.push(data)
    }

    if (items.length === 0) {
      return null
    }

    const file = await this.packager.getTempFile(".xml")
    await outputFile(
      file,
      '<?xml version="1.0" encoding="utf-8"?>\n<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">\n' + items.join("\n") + "\n</mime-info>"
    )
    return file
  }

  // must be name without spaces and other special characters, but not product name used
  private async computeDesktopIcons(): Promise<Array<IconInfo>> {
    const packager = this.packager
    const { platformSpecificBuildOptions, config } = packager

    const sources = [platformSpecificBuildOptions.icon, config.mac?.icon ?? config.icon].filter(str => !!str) as string[]

    // If no explicit sources are defined, fallback to buildResources directory, then default framework icon
    let fallbackSources = [...asArray(packager.getDefaultFrameworkIcon())]
    const buildResources = config.directories?.buildResources
    if (buildResources && (await exists(join(buildResources, "icons")))) {
      fallbackSources = [buildResources, ...fallbackSources]
    }

    // need to put here and not as default because need to resolve image size
    const result = await packager.resolveIcon(sources, fallbackSources, "set")
    this.maxIconPath = result[result.length - 1].file

    // Ignore .icon files for linux (they are exclusive for macOS)
    return result.filter(icon => !icon.file.endsWith(".icon"))
  }

  getDescription(options: CommonLinuxOptions) {
    return options.description || this.packager.appInfo.description
  }

  getSanitizedVersion(target: string) {
    const {
      appInfo: { version },
    } = this.packager
    switch (target) {
      case "pacman":
        return version.replace(/-/g, "_")
      case "rpm":
      case "deb":
        return version.replace(/-/g, "~")
      default:
        return version
    }
  }

  async writeDesktopEntry(targetSpecificOptions: CommonLinuxOptions, exec?: string, destination?: string | null, extra?: Record<string, string>): Promise<string> {
    const data = await this.computeDesktopEntry(targetSpecificOptions, exec, extra)
    const file = destination || (await this.packager.getTempFile(`${this.packager.appInfo.productFilename}.desktop`))
    await outputFile(file, data)
    return file
  }

  computeDesktopEntry(targetSpecificOptions: CommonLinuxOptions, exec?: string, extra?: Record<string, string>): Promise<string> {
    if (exec != null && exec.length === 0) {
      throw new Error("Specified exec is empty")
    }
    // https://github.com/electron-userland/electron-builder/issues/3418
    if (targetSpecificOptions.desktop?.entry?.Exec) {
      throw new Error("Please specify executable name as linux.executableName instead of linux.desktop.Exec")
    }

    const packager = this.packager
    const appInfo = packager.appInfo

    const executableArgs = targetSpecificOptions.executableArgs
    if (exec == null) {
      exec = `${installPrefix}/${appInfo.sanitizedProductName}/${packager.executableName}`
      if (!/^[/0-9A-Za-z._-]+$/.test(exec)) {
        exec = `"${exec}"`
      }
      if (executableArgs) {
        exec += " "
        // Each arg is double-quoted per the freedesktop Exec key spec so that
        // spaces, $, ;, & and other reserved characters are not misinterpreted.
        exec += executableArgs.map(desktopExecArgEscape).join(" ")
      }
      // https://specifications.freedesktop.org/desktop-entry-spec/desktop-entry-spec-latest.html#exec-variables
      const execCodes = ["%f", "%u", "%F", "%U"]
      if (executableArgs == null || executableArgs.findIndex(arg => execCodes.includes(arg)) === -1) {
        exec += " %U"
      }
    }

    // https://github.com/electron-userland/electron-builder/issues/9103
    // Electron derives app_id from desktopName in package.json; StartupWMClass must match.
    // https://github.com/electron/electron/blob/9a7b73b5334f1d72c08e2d5e94106706ed751186/lib/browser/init.ts#L128-L133
    const trimmedDesktopName = packager.info.metadata.desktopName?.trim()
    const wmClass = !isEmptyOrSpaces(trimmedDesktopName) ? trimmedDesktopName.replace(/\.desktop$/, "") : appInfo.productName

    const desktopMeta = deepAssign<any>(
      {
        // String values are escaped per the freedesktop spec (\\, \n, \r, \t)
        // so that a product name containing a newline cannot inject new key=value
        // pairs into the .desktop file (e.g. overriding the Exec key).
        Name: desktopStringEscape(appInfo.productName),
        Exec: exec,
        Terminal: "false",
        Type: "Application",
        Icon: packager.executableName,
        // https://askubuntu.com/questions/367396/what-represent-the-startupwmclass-field-of-a-desktop-file
        // Set to desktopName (minus .desktop suffix) when provided, so it matches Electron's
        // app_id and desktop environments can associate running windows with this entry.
        // Falls back to productName for apps that don't set desktopName.
        // to get WM_CLASS of running window: xprop WM_CLASS
        // StartupWMClass doesn't work for unicode
        // https://github.com/electron/electron/blob/2-0-x/atom/browser/native_window_views.cc#L226
        StartupWMClass: desktopStringEscape(wmClass),
      },
      extra,
      targetSpecificOptions.desktop?.entry ?? {}
    )

    const description = this.getDescription(targetSpecificOptions)
    if (!isEmptyOrSpaces(description)) {
      desktopMeta.Comment = desktopStringEscape(description)
    }

    const mimeTypes: Array<string> = asArray(targetSpecificOptions.mimeTypes)
    for (const fileAssociation of packager.fileAssociations) {
      if (fileAssociation.mimeType != null) {
        mimeTypes.push(fileAssociation.mimeType)
      }
    }

    for (const protocol of asArray(packager.config.protocols).concat(asArray(packager.platformSpecificBuildOptions.protocols))) {
      for (const scheme of asArray(protocol.schemes)) {
        mimeTypes.push(`x-scheme-handler/${scheme}`)
      }
    }

    if (mimeTypes.length !== 0) {
      desktopMeta.MimeType = mimeTypes.join(";") + ";"
    }

    let category = targetSpecificOptions.category
    if (isEmptyOrSpaces(category)) {
      const macCategory = (packager.config.mac || {}).category
      if (macCategory != null) {
        category = macToLinuxCategory[macCategory]
      }

      if (category == null) {
        // https://github.com/develar/onshape-desktop-shell/issues/48
        if (macCategory != null) {
          log.warn({ macCategory }, "cannot map macOS category to Linux. If possible mapping is known for you, please file issue to add it.")
        }
        log.warn(
          {
            reason: "linux.category is not set and cannot map from macOS",
            docs: "https://www.electron.build/linux",
          },
          'application Linux category is set to default "Utility"'
        )
        category = "Utility"
      }
    }
    desktopMeta.Categories = `${category}${category.endsWith(";") ? "" : ";"}`

    let data = `[Desktop Entry]`
    for (const name of Object.keys(desktopMeta)) {
      data += `\n${name}=${desktopMeta[name]}`
    }
    data += "\n"
    const desktopActions = targetSpecificOptions.desktop?.desktopActions ?? {}
    for (const [actionName, config] of Object.entries(desktopActions)) {
      if (!Object.keys(config ?? {}).length) {
        continue
      }
      data += `\n[Desktop Action ${actionName}]`
      for (const [key, value] of Object.entries(config ?? {})) {
        data += `\n${key}=${value}`
      }
      data += "\n"
    }
    return Promise.resolve(data)
  }
}

const macToLinuxCategory: any = {
  "public.app-category.graphics-design": "Graphics",
  "public.app-category.developer-tools": "Development",
  "public.app-category.education": "Education",
  "public.app-category.games": "Game",
  "public.app-category.video": "Video;AudioVideo",
  "public.app-category.utilities": "Utility",
  "public.app-category.social-networking": "Network;Chat",
  "public.app-category.finance": "Office;Finance",
  "public.app-category.music": "Audio;AudioVideo",
}
