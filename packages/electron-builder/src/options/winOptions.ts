import { PlatformSpecificBuildOptions } from "../configuration"
import { TargetConfigType, TargetSpecificOptions } from "../core"
import { CustomWindowsSign } from "../windowsCodeSign"

export interface WindowsConfiguration extends PlatformSpecificBuildOptions {
  /**
   * The target package type: list of `nsis`, `nsis-web` (Web installer), `portable` (portable app without installation), `appx`, `squirrel`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`.
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
   * The path to application icon.
   * @default build/icon.ico
   */
  readonly icon?: string | null

  /**
   * The trademarks and registered trademarks.
   */
  readonly legalTrademarks?: string | null

  /**
   * Array of signing algorithms used. For AppX `sha256` is always used.
   * @default ['sha1', 'sha256']
   */
  readonly signingHashAlgorithms?: Array<"sha1" | "sha256"> | null
  /**
   * The custom function (or path to file or module id) to sign Windows executable.
   */
  readonly sign?: CustomWindowsSign| string | null
  /**
   * The path to the *.pfx certificate you want to sign with. Please use it only if you cannot use env variable `CSC_LINK` (`WIN_CSC_LINK`) for some reason.
   * Please see [Code Signing](../code-signing.md).
   */
  readonly certificateFile?: string | null
  /**
   * The password to the certificate provided in `certificateFile`. Please use it only if you cannot use env variable `CSC_KEY_PASSWORD` (`WIN_CSC_KEY_PASSWORD`) for some reason.
   * Please see [Code Signing](../code-signing.md).
   */
  readonly certificatePassword?: string | null
  /**
   * The name of the subject of the signing certificate. Required only for EV Code Signing and works only on Windows (or on macOS if [Parallels Desktop](https://www.parallels.com/products/desktop/) Windows 10 virtual machines exits).
   */
  readonly certificateSubjectName?: string | null
  /**
   * The SHA1 hash of the signing certificate. The SHA1 hash is commonly specified when multiple certificates satisfy the criteria specified by the remaining switches. Works only on Windows (or on macOS if [Parallels Desktop](https://www.parallels.com/products/desktop/) Windows 10 virtual machines exits).
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
   * The [publisher name](#publisherName) will be used for the signature verification.
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

export interface AppXOptions extends TargetSpecificOptions {
  /**
   * The application id. Defaults to `identityName`. Can’t start with numbers.
   */
  readonly applicationId?: string

  /**
   * The background color of the app tile. See [Visual Elements](https://msdn.microsoft.com/en-us/library/windows/apps/br211471.aspx).
   * @default #464646
   */
  readonly backgroundColor?: string | null

  /**
   * A friendly name that can be displayed to users. Corresponds to [Properties.DisplayName](https://msdn.microsoft.com/en-us/library/windows/apps/br211432.aspx).
   * Defaults to the application product name.
   */
  readonly displayName?: string | null

  /**
   * The name. Corresponds to [Identity.Name](https://msdn.microsoft.com/en-us/library/windows/apps/br211441.aspx). Defaults to the [application name](/configuration/configuration#Metadata-name).
   */
  readonly identityName?: string | null

  /**
   * The Windows Store publisher. Not used if AppX is build for testing. See [AppX Package Code Signing](#appx-package-code-signing) below.
   */
  readonly publisher?: string | null

  /**
   * A friendly name for the publisher that can be displayed to users. Corresponds to [Properties.PublisherDisplayName](https://msdn.microsoft.com/en-us/library/windows/apps/br211460.aspx).
   * Defaults to company name from the application metadata.
   */
  readonly publisherDisplayName?: string | null

  /**
   * The list of [supported languages](https://docs.microsoft.com/en-us/windows/uwp/globalizing/manage-language-and-region#specify-the-supported-languages-in-the-apps-manifest) that will be listed in the Windows Store.
   * The first entry (index 0) will be the default language.
   * Defaults to en-US if omitted.
   */
  readonly languages?: Array<string> | string | null

  /**
   * @private
   * @default false
   */
  readonly electronUpdaterAware?: boolean

  /** @private */
  readonly makeappxArgs?: Array<string> | null
}
