import { PlatformSpecificBuildOptions } from "../metadata"

/*
 ### `.build.win`

 Windows specific build options.
 */
export interface WinBuildOptions extends PlatformSpecificBuildOptions {
  /*
   Target package type: list of `nsis`, `squirrel`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`. Defaults to `nsis`.
  */
  readonly target?: Array<string> | null

  /*
   Array of signing algorithms used. Defaults to `['sha1', 'sha256']`
   */
  readonly signingHashAlgorithms?: Array<string> | null

  /*
   The path to application icon. Defaults to `build/icon.ico` (consider using this convention instead of complicating your configuration).
   */
  readonly icon?: string | null

  /*
  The trademarks and registered trademarks.
   */
  readonly legalTrademarks?: string | null

  /*
  The path to the *.pfx certificate you want to sign with. Required only if you build on macOS and need different certificate than the one set in `CSC_LINK` - see [Code Signing](https://github.com/electron-userland/electron-builder/wiki/Code-Signing).
   */
  readonly certificateFile?: string

  /*
  The password to the certificate provided in `certificateFile`. Required only if you build on macOS and need to use a different password than the one set in `CSC_KEY_PASSWORD` - see [Code Signing](https://github.com/electron-userland/electron-builder/wiki/Code-Signing).
   */
  readonly certificatePassword?: string

  /*
  The name of the subject of the signing certificate. Required only for EV Code Signing and works only on Windows.
   */
  readonly certificateSubjectName?: string

  /*
  The URL of the RFC 3161 time stamp server. Defaults to `http://timestamp.comodoca.com/rfc3161`.
   */
  readonly rfc3161TimeStampServer?: string
}

/*
 ### `.build.nsis`

 See [NSIS target notes](https://github.com/electron-userland/electron-builder/wiki/NSIS).
 */
export interface NsisOptions {
  /*
  One-click installation. Defaults to `true`.
   */
  readonly oneClick?: boolean

  /*
  Defaults to `false`.

  If `oneClick` is `true` (default): Install per all users (per-machine).

  If `oneClick` is `false`: no install mode installer page (choice per-machine or per-user), always install per-machine.
   */
  readonly perMachine?: boolean

  /*
   *boring installer only.* Allow requesting for elevation. If false, user will have to restart installer with elevated permissions. Defaults to `true`.
   */
  readonly allowElevation?: boolean

  /*
   *one-click installer only.* Run application after finish. Defaults to `true`.
   */
  readonly runAfterFinish?: boolean

  /*
  See [GUID vs Application Name](https://github.com/electron-userland/electron-builder/wiki/NSIS#guid-vs-application-name).
   */
  readonly guid?: string | null

  /*
   *boring installer only.* `MUI_HEADERIMAGE`, relative to the project directory. Defaults to `build/installerHeader.bmp`
   */
  readonly installerHeader?: string | null

  /*
   *one-click installer only.* The path to header icon (above the progress bar), relative to the project directory. Defaults to `build/installerHeaderIcon.ico` or application icon.
   */
  readonly installerHeaderIcon?: string | null

  /*
  The path to NSIS include script to customize installer. Defaults to `build/installer.nsh`. See [Custom NSIS script](https://github.com/electron-userland/electron-builder/wiki/NSIS#custom-nsis-script).
   */
  readonly include?: string | null

  /*
  The path to NSIS script to customize installer. Defaults to `build/installer.nsi`. See [Custom NSIS script](https://github.com/electron-userland/electron-builder/wiki/NSIS#custom-nsis-script).
   */
  readonly script?: string | null

  /*
  The path to EULA license file. Defaults to `build/license.rtf` or `build/license.txt`.
   */
  readonly license?: string | null

  /*
   * [LCID Dec](https://msdn.microsoft.com/en-au/goglobal/bb964664.aspx), defaults to `1033`(`English - United States`).
   */
  readonly language?: string | null

  /*
   Defaults to `false`.

   If `warningsAsErrors` is `true` (default): NSIS will treat warnings as errors.

   If `warningsAsErrors` is `false`: NSIS will allow warnings.
   */
  readonly warningsAsErrors?: boolean
}

/*
 ### `.build.squirrelWindows`
 */
export interface SquirrelWindowsOptions extends WinBuildOptions {
  /*
    A URL to an ICO file to use as the application icon (displayed in Control Panel > Programs and Features). Defaults to the Electron icon.

   Please note — [local icon file url is not accepted](https://github.com/atom/grunt-electron-installer/issues/73), must be https/http.

   * If you don't plan to build windows installer, you can omit it.
   * If your project repository is public on GitHub, it will be `https://github.com/${u}/${p}/blob/master/build/icon.ico?raw=true` by default.
   */
  readonly iconUrl?: string | null

  /*
   The path to a .gif file to display during install. `build/install-spinner.gif` will be used if exists (it is a recommended way to set)
   (otherwise [default](https://github.com/electron/windows-installer/blob/master/resources/install-spinner.gif)).
   */
  readonly loadingGif?: string | null

  /*
   Whether to create an MSI installer. Defaults to `false` (MSI is not created).
   */
  readonly msi?: boolean

  /*
   A URL to your existing updates. Or `true` to automatically set to your GitHub repository. If given, these will be downloaded to create delta updates.
   */
  readonly remoteReleases?: string | boolean | null

  /*
   Authentication token for remote updates
   */
  readonly remoteToken?: string | null

  /*
   Use `appId` to identify package instead of `name`.
   */
  readonly useAppIdAsId?: boolean
}