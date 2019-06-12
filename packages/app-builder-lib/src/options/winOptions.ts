import { PlatformSpecificBuildOptions, TargetConfigType } from "../index"
import { CustomWindowsSign } from "../codeSign/windowsCodeSign"

export interface WindowsConfiguration extends PlatformSpecificBuildOptions {
  /**
   * The target package type: list of `nsis`, `nsis-web` (Web installer), `portable` ([portable](/configuration/nsis#portable) app without installation), `appx`, `msi`, `squirrel`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`.
   * AppX package can be built only on Windows 10.
   *
   * To use Squirrel.Windows please install `electron-builder-squirrel-windows` dependency.
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
   * Please see [Code Signing](/code-signing).
   */
  readonly certificateFile?: string | null
  /**
   * The password to the certificate provided in `certificateFile`. Please use it only if you cannot use env variable `CSC_KEY_PASSWORD` (`WIN_CSC_KEY_PASSWORD`) for some reason.
   * Please see [Code Signing](/code-signing).
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
   * @default http://timestamp.digicert.com
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

  /**
   * Whether to sign and add metadata to executable. Advanced option.
   * @default true
   */
  readonly signAndEditExecutable?: boolean

  /**
   * Whether to sign DLL files. Advanced option.
   * @see https://github.com/electron-userland/electron-builder/issues/3101#issuecomment-404212384
   * @default false
   */
  readonly signDlls?: boolean
}

export type RequestedExecutionLevel = "asInvoker" | "highestAvailable" | "requireAdministrator"
