import { TargetConfigType } from "electron-builder-core"
import { PlatformSpecificBuildOptions } from "../metadata"

/**
 * Windows Specific Options
 */
export interface WinBuildOptions extends PlatformSpecificBuildOptions {
  /**
   * Target package type: list of `nsis`, `nsis-web` (Web installer), `portable` (portable app without installation), `appx`, `squirrel`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`. Defaults to `nsis`.
   * AppX package can be built only on Windows 10.
   * 
   * To use Squirrel.Windows please install `electron-builder-squirrel-windows` dependency.
  */
  readonly target?: TargetConfigType

  /**
   * Array of signing algorithms used. Defaults to `['sha1', 'sha256']`
   * 
   * For AppX `sha256` is always used.
   */
  readonly signingHashAlgorithms?: Array<"sha1" | "sha256"> | null

  /**
   * The path to application icon.
   * @default build/icon.ico
   */
  readonly icon?: string | null

  /**
   * The trademarks and registered trademarks.
   */
  readonly legalTrademarks?: string | null

  /**
   * The path to the *.pfx certificate you want to sign with. Please use it only if you cannot use env variable `CSC_LINK` (`WIN_CSC_LINK`) for some reason.
   * Please see [Code Signing](https://github.com/electron-userland/electron-builder/wiki/Code-Signing).
   */
  readonly certificateFile?: string

  /**
   * The password to the certificate provided in `certificateFile`. Please use it only if you cannot use env variable `CSC_KEY_PASSWORD` (`WIN_CSC_KEY_PASSWORD`) for some reason.
   * Please see [Code Signing](https://github.com/electron-userland/electron-builder/wiki/Code-Signing).
   */
  readonly certificatePassword?: string

  /**
   * The name of the subject of the signing certificate. Required only for EV Code Signing and works only on Windows.
   */
  readonly certificateSubjectName?: string

  /**
   * The SHA1 hash of the signing certificate. The SHA1 hash is commonly specified when multiple certificates satisfy the criteria specified by the remaining switches. Works only on Windows.
   */
  readonly certificateSha1?: string

  /**
   * The URL of the RFC 3161 time stamp server. Defaults to `http://timestamp.comodoca.com/rfc3161`.
   */
  readonly rfc3161TimeStampServer?: string

  /**
   * The URL of the time stamp server. Defaults to `http://timestamp.verisign.com/scripts/timstamp.dll`.
   */
  readonly timeStampServer?: string

  /**
   * [The publisher name](https://github.com/electron-userland/electron-builder/issues/1187#issuecomment-278972073), exactly as in your code signed certificate. Several names can be provided.
   * Defaults to common name from your code signing certificate.
   */
  readonly publisherName?: string | Array<string> | null
}

/**
 * NSIS specific options
 * See [NSIS target notes](https://github.com/electron-userland/electron-builder/wiki/NSIS).
 */
export interface NsisOptions {
  /**
   * One-click installation.
   * @default true
   */
  readonly oneClick?: boolean

  /*** 
   * If `oneClick` is `true` (default): Install per all users (per-machine).
   * 
   * If `oneClick` is `false`: no install mode installer page (choice per-machine or per-user), always install per-machine.
   * @default false
   */
  readonly perMachine?: boolean

  /**
   * *boring installer only.* Allow requesting for elevation. If false, user will have to restart installer with elevated permissions.
   * @default true
   */
  readonly allowElevation?: boolean

  /**
   * *boring installer only.* Whether to allow user to change installation directory.
   * @default false
   */
  readonly allowToChangeInstallationDirectory?: boolean

  /**
   * *one-click installer only.* Run application after finish.
   * @default true
   */
  readonly runAfterFinish?: boolean

  /**
   * See [GUID vs Application Name](https://github.com/electron-userland/electron-builder/wiki/NSIS#guid-vs-application-name).
   */
  readonly guid?: string | null

  /**
   * The path to installer icon, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory.
   * Defaults to `build/installerIcon.ico` or application icon.
   */
  readonly installerIcon?: string | null

  /**
   * *boring installer only.* `MUI_HEADERIMAGE`, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory.
   * @default build/installerHeader.bmp
   */
  readonly installerHeader?: string | null

  /**
   * *boring installer only.* `MUI_WELCOMEFINISHPAGE_BITMAP`, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory.
   * Defaults to `build/installerSidebar.bmp` or `${NSISDIR}\\Contrib\\Graphics\\Wizard\\nsis3-metro.bmp`
   */
  readonly installerSidebar?: string | null

  /**
   * *boring installer only.* `MUI_UNWELCOMEFINISHPAGE_BITMAP`, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory.
   * Defaults to `installerSidebar` option or `build/uninstallerSidebar.bmp` or `build/installerSidebar.bmp` or `${NSISDIR}\\Contrib\\Graphics\\Wizard\\nsis3-metro.bmp`
   */
  readonly uninstallerSidebar?: string | null

  /**
   * *one-click installer only.* The path to header icon (above the progress bar), relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory.
   * Defaults to `build/installerHeaderIcon.ico` or application icon.
   */
  readonly installerHeaderIcon?: string | null

  /**
   * The path to NSIS include script to customize installer. Defaults to `build/installer.nsh`. See [Custom NSIS script](https://github.com/electron-userland/electron-builder/wiki/NSIS#custom-nsis-script).
   */
  readonly include?: string | null

  /**
   * The path to NSIS script to customize installer. Defaults to `build/installer.nsi`. See [Custom NSIS script](https://github.com/electron-userland/electron-builder/wiki/NSIS#custom-nsis-script).
   */
  readonly script?: string | null

  /**
   * The path to EULA license file. Defaults to `build/license.rtf` or `build/license.txt`.
   */
  readonly license?: string | null

  /**
   * [LCID Dec](https://msdn.microsoft.com/en-au/goglobal/bb964664.aspx), defaults to `1033`(`English - United States`).
   */
  readonly language?: string | null

  /**
   * *boring installer only.* Whether to create multi-language installer. Defaults to `unicode` option value.
   * [Not all strings are translated](https://github.com/electron-userland/electron-builder/issues/646#issuecomment-238155800).
   */
  readonly multiLanguageInstaller?: boolean

  /**
   * If `warningsAsErrors` is `true` (default): NSIS will treat warnings as errors. If `warningsAsErrors` is `false`: NSIS will allow warnings.
   * @default true
   */
  readonly warningsAsErrors?: boolean

  /**
   * Whether to create submenu for start menu shortcut and program files directory. If `true`, company name will be used. Or string value.
   * @default false
   */
  readonly menuCategory?: boolean | string

  /**
   * @private defaults to false
   */
  readonly useZip?: boolean

  /**
   * The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern). Defaults to `${productName} Setup ${version}.${ext}`.
   */
  readonly artifactName?: string | null

  /**
   * Whether to create [Unicode installer](http://nsis.sourceforge.net/Docs/Chapter1.html#intro-unicode).
   * @default true
   */
  readonly unicode?: boolean

  /**
   * *one-click installer only.* Whether to delete app data on uninstall.
   * @default false
   */
  readonly deleteAppDataOnUninstall?: boolean
}

/** 
 * Web Installer Specific Options
 */
export interface NsisWebOptions extends NsisOptions {
  /**
   * The application package download URL. Optional — by default computed using publish configuration.
   * 
   * URL like `https://example.com/download/latest` allows web installer to be version independent (installer will download latest application package).
   * 
   * Custom `X-Arch` http header is set to `32` or `64`.
   */
  readonly appPackageUrl?: string | null

  /**
   * The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern). Defaults to `${productName} Web Setup ${version}.${ext}`.
   */
  readonly artifactName?: string | null
}

/**
 * Squirrel.Windows Options.
 * To use Squirrel.Windows please install `electron-builder-squirrel-windows` dependency. Squirrel.Windows target is maintained, but deprecated. Please use `nsis` instead.
 */
export interface SquirrelWindowsOptions extends WinBuildOptions {
  /**
   * A URL to an ICO file to use as the application icon (displayed in Control Panel > Programs and Features). Defaults to the Electron icon.
   * 
   * Please note — [local icon file url is not accepted](https://github.com/atom/grunt-electron-installer/issues/73), must be https/http.
   * 
   * If you don't plan to build windows installer, you can omit it.
   * If your project repository is public on GitHub, it will be `https://github.com/${u}/${p}/blob/master/build/icon.ico?raw=true` by default.
   */
  readonly iconUrl?: string | null

  /**
   * The path to a .gif file to display during install. `build/install-spinner.gif` will be used if exists (it is a recommended way to set)
   * (otherwise [default](https://github.com/electron/windows-installer/blob/master/resources/install-spinner.gif)).
   */
  readonly loadingGif?: string | null

  /**
   * Whether to create an MSI installer. Defaults to `false` (MSI is not created).
   */
  readonly msi?: boolean

  /**
   * A URL to your existing updates. Or `true` to automatically set to your GitHub repository. If given, these will be downloaded to create delta updates.
   */
  readonly remoteReleases?: string | boolean | null

  /**
   * Authentication token for remote updates
   */
  readonly remoteToken?: string | null

  /**
   * Use `appId` to identify package instead of `name`.
   */
  readonly useAppIdAsId?: boolean
}

/**
 * AppX Options
 * @see [Windows AppX docs](https://msdn.microsoft.com/en-us/library/windows/apps/br211453.aspx).
 */
export interface AppXOptions {
  /**
   * The background color of the app tile.
   * @see [Visual Elements](https://msdn.microsoft.com/en-us/library/windows/apps/br211471.aspx).
   */
  readonly backgroundColor?: string | null

  /**
   * @private
   */
  readonly makeappxArgs?: Array<string> | null

  /**
   * Describes the publisher information in a form `CN=your name exactly as in your cert`. The Publisher attribute must match the publisher subject information of the certificate used to sign a package.
   * By default will be extracted from code sign certificate.
   */
  readonly publisher?: string | null

  /**
   * A friendly name that can be displayed to users. Corresponds to [Properties.DisplayName](https://msdn.microsoft.com/en-us/library/windows/apps/br211432.aspx).
   */
  readonly displayName?: string | null

  /**
   * A friendly name for the publisher that can be displayed to users. Corresponds to [Properties.PublisherDisplayName](https://msdn.microsoft.com/en-us/library/windows/apps/br211460.aspx).
   */
  readonly publisherDisplayName?: string | null

  /**
   * Describes the contents of the package. The Name attribute is case-sensitive. Corresponds to [Identity.Name](https://msdn.microsoft.com/en-us/library/windows/apps/br211441.aspx).
   */
  readonly identityName?: string | null
}
