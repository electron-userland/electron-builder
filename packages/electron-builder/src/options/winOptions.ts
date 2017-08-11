import { TargetConfigType, TargetSpecificOptions } from "../core"
import { PlatformSpecificBuildOptions } from "../metadata"

export interface WinBuildOptions extends PlatformSpecificBuildOptions {
  /**
   * Target package type: list of `nsis`, `nsis-web` (Web installer), `portable` (portable app without installation), `appx`, `squirrel`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`.
   * AppX package can be built only on Windows 10.
   *
   * To use Squirrel.Windows please install `electron-builder-squirrel-windows` dependency.
   *
   * For `portable` app, `PORTABLE_EXECUTABLE_DIR` env is set (dir where portable executable located).
   *
   * @default nsis
  */
  readonly target?: TargetConfigType

  /**
   * Array of signing algorithms used. For AppX `sha256` is always used.
   * @default ['sha1', 'sha256']
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
  readonly certificateFile?: string | null

  /**
   * The password to the certificate provided in `certificateFile`. Please use it only if you cannot use env variable `CSC_KEY_PASSWORD` (`WIN_CSC_KEY_PASSWORD`) for some reason.
   * Please see [Code Signing](https://github.com/electron-userland/electron-builder/wiki/Code-Signing).
   */
  readonly certificatePassword?: string | null

  /**
   * The name of the subject of the signing certificate. Required only for EV Code Signing and works only on Windows.
   */
  readonly certificateSubjectName?: string | null

  /**
   * The SHA1 hash of the signing certificate. The SHA1 hash is commonly specified when multiple certificates satisfy the criteria specified by the remaining switches. Works only on Windows.
   */
  readonly certificateSha1?: string | null

  /**
   * The path to an additional certificate file you want to add to the signature block.
   */
  readonly additionalCertificateFile?: string | null

  /**
   * The URL of the RFC 3161 time stamp server.
   * @default http://timestamp.comodoca.com/rfc3161
   */
  readonly rfc3161TimeStampServer?: string | null

  /**
   * The URL of the time stamp server.
   * @default http://timestamp.verisign.com/scripts/timstamp.dll
   */
  readonly timeStampServer?: string | null

  /**
   * [The publisher name](https://github.com/electron-userland/electron-builder/issues/1187#issuecomment-278972073), exactly as in your code signed certificate. Several names can be provided.
   * Defaults to common name from your code signing certificate.
   */
  readonly publisherName?: string | Array<string> | null

  /**
   * Whether to verify the signature of an available update before installation.
   * The [publisher name](WinBuildOptions#publisherName) will be used for the signature verification.
   *
   * @default true
   */
  readonly verifyUpdateCodeSignature?: boolean

  /**
   * The [security level](https://msdn.microsoft.com/en-us/library/6ad1fshk.aspx#Anchor_9) at which the application requests to be executed.
   * Cannot be specified per target, allowed only in the `win`.
   * @default asInvoker
   */
  readonly requestedExecutionLevel?: RequestedExecutionLevel | null
}

export type RequestedExecutionLevel = "asInvoker" | "highestAvailable" | "requireAdministrator"

/**
 * Squirrel.Windows options. Squirrel.Windows target is maintained, but deprecated. Please use `nsis` instead.
 *
 * To use Squirrel.Windows please install `electron-builder-squirrel-windows` dependency.
 * To build for Squirrel.Windows on macOS, please install `mono`: `brew install mono`.
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

  /**
   * https://github.com/electron-userland/electron-builder/issues/1743
   * @private
   */
  readonly name?: string
}

/**
 * AppX options. See [Windows AppX docs](https://msdn.microsoft.com/en-us/library/windows/apps/br211453.aspx).
 */
export interface AppXOptions extends TargetSpecificOptions {
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
   * The name. Corresponds to [Identity.Name](https://msdn.microsoft.com/en-us/library/windows/apps/br211441.aspx).
   * @default ${name}
   */
  readonly identityName?: string | null

  /**
   * The list of [supported languages](https://docs.microsoft.com/en-us/windows/uwp/globalizing/manage-language-and-region#specify-the-supported-languages-in-the-apps-manifest) that will be listed in the Windows Store.
   * The first entry (index 0) will be the default language.
   * Defaults to en-US if omitted.
   */
  readonly languages?: Array<string> | string | null

  /**
   * @default false
   */
  readonly electronUpdaterAware?: boolean
}
