import { CommonWindowsInstallerConfiguration } from "../../../options/CommonWindowsInstallerConfiguration.js"
import { TargetSpecificOptions } from "../../../core.js"

export interface CommonNsisOptions {
  /**
   * Whether to create [Unicode installer](http://nsis.sourceforge.net/Docs/Chapter1.html#intro-unicode).
   * @default true
   */
  readonly unicode?: boolean

  /**
   * The GUID for the installer. Used to identify the application for upgrade and uninstall operations.
   * If not specified, a deterministic GUID is generated from the app ID (`appId`) — but this means
   * changing your `appId` will break silent upgrades of existing installs.
   *
   * @see [GUID vs Application Name](https://www.electron.build/docs/nsis#guid-vs-application-name)
   */
  readonly guid?: string | null

  /**
   * If `warningsAsErrors` is `true` (default): NSIS will treat warnings as errors. If `warningsAsErrors` is `false`: NSIS will allow warnings.
   * @default true
   */
  readonly warningsAsErrors?: boolean

  /**
   * Use zip instead of 7z (LZMA) for the embedded app package. Only applies to portable targets and to installers built with `differentialPackage: false`; ignored (with a warning) when `differentialPackage` is enabled and for `nsis-web`, which always use 7z.
   * @default false
   */
  readonly useZip?: boolean
}

export interface NsisOptions extends CommonNsisOptions, CommonWindowsInstallerConfiguration, TargetSpecificOptions {
  /**
   * Whether to create one-click installer or assisted.
   * @default true
   */
  readonly oneClick?: boolean

  /**
   * Whether to enable NSIS logging in the installer and uninstaller (`LogSet on`, which writes `install.log` to the installation
   * directory). In your custom NSIS scripts, write to the log via `${LogText}`.
   *
   * Requires a log-enabled NSIS: `makensis` and its stubs compiled with `NSIS_CONFIG_LOG=yes`. The default `toolsets.nsis` bundle
   * is not log-enabled, so supply one as a custom `toolsets.nsis` bundle; the build fails otherwise.
   * Replaces the v26 `customNsisBinary.debugLogging`.
   * @see https://www.electron.build/docs/migration/v27-breaking-changes#nsiscustomnsisbinary-toolsetsnsis
   * @default false
   */
  readonly installerDebugLogging?: boolean

  /**
   * Whether to show install mode installer page (choice per-machine or per-user) for assisted installer. Or whether installation always per all users (per-machine).
   *
   * If `oneClick` is `true` (default): Whether to install per all users (per-machine).
   *
   * If `oneClick` is `false` and `perMachine` is `true`: no install mode installer page, always install per-machine.
   *
   * If `oneClick` is `false` and `perMachine` is `false` (default): install mode installer page.
   * @default false
   */
  readonly perMachine?: boolean

  /**
   * Whether to set per-machine or per-user installation as default selection on the install mode installer page.
   *
   * @default false
   */
  readonly selectPerMachineByDefault?: boolean

  /**
   * *assisted installer only.* Allow requesting for elevation. If false, user will have to restart installer with elevated permissions.
   * @default true
   */
  readonly allowElevation?: boolean

  /**
   * *assisted installer only.* Whether to allow user to change installation directory.
   * @default false
   */
  readonly allowToChangeInstallationDirectory?: boolean

  /**
   * *assisted installer only.* remove the default uninstall welcome page.
   * @default false
   */
  readonly removeDefaultUninstallWelcomePage?: boolean

  /**
   * The path to installer icon, relative to the [build resources](https://www.electron.build/docs/contents#extraresources) or to the project directory.
   * Defaults to `build/installerIcon.ico` or application icon.
   */
  readonly installerIcon?: string | null
  /**
   * The path to uninstaller icon, relative to the [build resources](https://www.electron.build/docs/contents#extraresources) or to the project directory.
   * Defaults to `build/uninstallerIcon.ico` or application icon.
   */
  readonly uninstallerIcon?: string | null
  /**
   * *assisted installer only.* `MUI_HEADERIMAGE`, relative to the [build resources](https://www.electron.build/docs/contents#extraresources) or to the project directory.
   * @default build/installerHeader.bmp
   */
  readonly installerHeader?: string | null
  /**
   * *one-click installer only.* The path to header icon (above the progress bar), relative to the [build resources](https://www.electron.build/docs/contents#extraresources) or to the project directory.
   * Defaults to `build/installerHeaderIcon.ico` or application icon.
   */
  readonly installerHeaderIcon?: string | null
  /**
   * *assisted installer only.* `MUI_WELCOMEFINISHPAGE_BITMAP`, relative to the [build resources](https://www.electron.build/docs/contents#extraresources) or to the project directory.
   * Defaults to `build/installerSidebar.bmp` or `${NSISDIR}\\Contrib\\Graphics\\Wizard\\nsis3-metro.bmp`. Image size 164 × 314 pixels.
   */
  readonly installerSidebar?: string | null
  /**
   * *assisted installer only.* `MUI_UNWELCOMEFINISHPAGE_BITMAP`, relative to the [build resources](https://www.electron.build/docs/contents#extraresources) or to the project directory.
   * Defaults to `installerSidebar` option or `build/uninstallerSidebar.bmp` or `build/installerSidebar.bmp` or `${NSISDIR}\\Contrib\\Graphics\\Wizard\\nsis3-metro.bmp`
   */
  readonly uninstallerSidebar?: string | null
  /**
   * The uninstaller display name in the control panel.
   * @default ${productName} ${version}
   */
  readonly uninstallDisplayName?: string | null
  /**
   * The URL to the uninstaller help page in the control panel. Defaults to [homepage](https://www.electron.build/docs/configuration#homepage) from application package.json.
   */
  readonly uninstallUrlHelp?: string | null
  /**
   * The URL to the uninstaller info about page in the control panel. Defaults to [homepage](https://www.electron.build/docs/configuration#homepage) from application package.json.
   */
  readonly uninstallUrlInfoAbout?: string | null
  /**
   * The URL to the uninstaller update info page in the control panel. Defaults to [homepage](https://www.electron.build/docs/configuration#homepage) from application package.json.
   */
  readonly uninstallUrlUpdateInfo?: string | null
  /**
   * The URL to the uninstaller readme page in the control panel. Defaults to [homepage](https://www.electron.build/docs/configuration#homepage) from application package.json.
   */
  readonly uninstallUrlReadme?: string | null

  /**
   * The path to NSIS include script to customize installer, or an array of such paths to include multiple scripts. Defaults to `build/installer.nsh`. See [Custom NSIS script](#custom-nsis-script).
   *
   * Each path is resolved relative to the [build resources directory](https://www.electron.build/docs/configuration#buildresources) first and then relative to the project directory.
   * When an array is provided, all scripts are included in the specified order.
   */
  readonly include?: string | Array<string> | null
  /**
   * The path to NSIS script to customize installer. Defaults to `build/installer.nsi`. See [Custom NSIS script](#custom-nsis-script).
   */
  readonly script?: string | null

  /**
   * The path to EULA license file. Defaults to `license.txt` or `eula.txt` (or uppercase variants). In addition to `txt`, `rtf` and `html` supported (don't forget to use `target="_blank"` for links).
   *
   * Multiple license files in different languages are supported — use lang postfix (e.g. `_de`, `_ru`). For example, create files `license_de.txt` and `license_en.txt` in the build resources.
   * If OS language is german, `license_de.txt` will be displayed. See map of [language code to name](https://github.com/meikidd/iso-639-1/blob/master/src/data.js).
   *
   * Appropriate license file will be selected by user OS language.
   */
  readonly license?: string | null

  /**
   * The [artifact file name template](https://www.electron.build/docs/configuration#artifact-file-name-template). Defaults to `${productName} Setup ${version}.${ext}`.
   */
  readonly artifactName?: string | null

  /**
   * *one-click installer only.* Whether to delete app data on uninstall.
   * @default false
   */
  readonly deleteAppDataOnUninstall?: boolean

  /**
   * Marks the package as built with differential download support for the update server, and selects how the
   * app package is compressed:
   *
   * - `false` — no differential download support.
   * - `"store-asar"` — differential-aware, with the app's `resources/app.asar` stored uncompressed (7-Zip
   *   `Copy`) inside the package. The differential updater diffs the *compressed* package with a
   *   content-defined blockmap, and the asar is a single compressed member — so any change to app code
   *   re-downloads the entire compressed asar (~100% of the member; its header rewrite alone diverges every
   *   block). Storing it keeps unchanged regions byte-identical between releases, making the delta
   *   proportional to what actually changed (measured on a ~32 MB asar: a one-line source change cost 0.2%
   *   instead of 100%). The stored asar's byte range is also chunked with finer content-defined blocks
   *   (4/8/16 KiB instead of the 8/16/32 KiB used for the rest of the installer), so a small change costs
   *   proportionally fewer bytes still. Trade-off: the installer and full package grow by roughly what
   *   compressing the asar saved. Without an `app.asar` (e.g. `asar` is disabled) there is nothing to store,
   *   so it behaves like `true`. Upgrading from an electron-builder without the finer chunking changes the
   *   block boundaries once: the first differential update from an installer built before it re-downloads
   *   close to the whole asar, and updates between installers built with it are proportional again.
   * - anything else (`true`, `"compressed"`, unset) — differential-aware, whole package compressed.
   * @default true
   */
  readonly differentialPackage?: boolean | "compressed" | "store-asar"

  /**
   * Whether to display a language selection dialog. Not recommended (by default will be detected using OS language).
   * @default false
   */
  readonly displayLanguageSelector?: boolean
  /**
   * The installer languages (e.g. `en_US`, `de_DE`). Change only if you understand what do you do and for what.
   */
  readonly installerLanguages?: Array<string> | string | null
  /**
   * [LCID Dec](https://msdn.microsoft.com/en-au/goglobal/bb964664.aspx), defaults to `1033`(`English - United States`).
   */
  readonly language?: string | null
  /**
   * Whether to create multi-language installer. Defaults to `unicode` option value.
   */
  readonly multiLanguageInstaller?: boolean
  /**
   * Whether to pack the `elevate.exe` helper into the app's `resources` directory. electron-updater elevates a per-machine
   * (`isAdminRightsRequired`) install through Windows PowerShell (`Start-Process -Verb RunAs`) and uses `elevate.exe` as the
   * fallback, so the helper is still required for environments where PowerShell is unavailable or blocked (e.g. AppLocker/WDAC).
   * Keep it enabled if a per-machine installer is used or can be used in the future. Ignored if `perMachine` is set to `true`.
   * @default true
   */
  readonly packElevateHelper?: boolean

  /**
   * The file extension of files that will be not compressed. Applicable only for `extraResources` and `extraFiles` files.
   * @default [".avi", ".mov", ".m4v", ".mp4", ".m4p", ".qt", ".mkv", ".webm", ".vmdk"]
   */
  readonly preCompressedFileExtensions?: Array<string> | string | null

  /**
   * Disable building an universal installer of the archs specified in the target configuration
   * *Not supported for nsis-web*
   * @default true
   */
  readonly buildUniversalInstaller?: boolean
}

/**
 * Portable options.
 */
export interface PortableOptions extends TargetSpecificOptions, CommonNsisOptions {
  /**
   * The [requested execution level](http://nsis.sourceforge.net/Reference/RequestExecutionLevel) for Windows.
   * @default user
   */
  readonly requestExecutionLevel?: "user" | "highest" | "admin"

  /**
   * The unpack directory for the portable app resources.
   *
   * If set to a string, it will be the name in [TEMP](https://www.askvg.com/where-does-windows-store-temporary-files-and-how-to-change-temp-folder-location/) directory
   * If set explicitly to `false`, it will use the Windows temp directory ($PLUGINSDIR) that is unique to each launch of the portable application.
   *
   * Defaults to [uuid](https://github.com/segmentio/ksuid) of build (changed on each build of portable executable).
   */
  readonly unpackDirName?: string | boolean

  /**
   * The image to show while the portable executable is extracting. This image must be a bitmap (`.bmp`) image.
   */
  readonly splashImage?: string | null

  /**
   * Disable building an universal installer of the archs specified in the target configuration
   * @default true
   */
  readonly buildUniversalInstaller?: boolean

  /**
   * The path to NSIS include script to customize the portable launcher, or an array of such paths to include multiple scripts. See [Custom NSIS script](#custom-nsis-script).
   *
   * Each path is resolved relative to the [build resources directory](https://www.electron.build/docs/configuration#buildresources) first and then relative to the project directory.
   * When an array is provided, all scripts are included in the specified order.
   *
   * Unlike the installer targets, the portable target does **not** fall back to `build/installer.nsh` — a custom script is only included when this option is explicitly set.
   */
  readonly include?: string | Array<string> | null
}

/**
 * Web Installer options.
 */
export interface NsisWebOptions extends NsisOptions {
  /**
   * The application package download URL. Optional — by default computed using publish configuration.
   *
   * URL like `https://example.com/download/latest` allows web installer to be version independent (installer will download latest application package).
   * Please note — it is [full URL](https://github.com/electron-userland/electron-builder/issues/1810#issuecomment-317650878).
   *
   * Custom `X-Arch` http header is set to `32` or `64`.
   *
   * The installer does not checksum-verify a package downloaded from an explicit `appPackageUrl`; a package downloaded from the default (publish-derived) URL is verified against the packages built with the installer.
   */
  readonly appPackageUrl?: string | null

  /**
   * Whether the web installer may install an app package that doesn't match any package built with it: a package passed via `--package-file`,
   * or (when `appPackageUrl` is not set) the downloaded package. By default such a package aborts the installation.
   *
   * Enable only if you intentionally run one web installer with packages of other builds (e.g. a version-independent installer with `--package-file`).
   * @default false
   */
  readonly allowUnverifiedAppPackage?: boolean

  /**
   * The [artifact file name template](https://www.electron.build/docs/configuration#artifact-file-name-template). Defaults to `${productName} Web Setup ${version}.${ext}`.
   */
  readonly artifactName?: string | null

  /**
   * Override for `NsisOptions.buildUniversalInstaller`. nsis-web requires universal installer
   * @default true
   */
  readonly buildUniversalInstaller?: true
}
