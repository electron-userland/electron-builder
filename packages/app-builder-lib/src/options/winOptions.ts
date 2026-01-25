import { Nullish } from "builder-util-runtime"
import { CustomWindowsSign } from "../codeSign/windowsSignToolManager"
import { PlatformSpecificBuildOptions, TargetConfigType } from "../index"

export interface WindowsConfiguration extends PlatformSpecificBuildOptions {
  /**
   * The target package type: list of `nsis`, `nsis-web` (Web installer), `portable` ([portable]./nsis.md#portable) app without installation), `appx`, `msi`, `msi-wrapped`, `squirrel`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`.
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
   * `win-codesign` version to use for signing Windows artifacts.
   * Located at https://github.com/electron-userland/electron-builder-binaries/releases?q=win-codesign&expanded=true
   * 0.0.0 - legacy toolset (winCodeSign)
   * 1.0.0 - windows-kits-bundle-10_0_26100_0
   * 1.1.0 - windows-kits-bundle-10_0_26100_0 with updated osslsigncode
   * @default "0.0.0"
   *
   */
  readonly winCodeSign?: "0.0.0" | "1.0.0" | "1.1.0" | null

  /**
   * Options for usage with signtool.exe
   * Cannot be used in conjunction with `azureSignOptions`, signing will default to Azure Trusted Signing
   */
  readonly signtoolOptions?: WindowsSigntoolConfiguration | null

  /**
   * Options for usage of Azure Trusted Signing service
   * Cannot be used in conjunction with `signtoolOptions`, signing will default to Azure Trusted Signing
   */
  readonly azureSignOptions?: WindowsAzureSigningConfiguration | null

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
   * Whether to sign and add metadata to executable.
   * Metadata includes information about the app name/description/version, publisher, copyright, etc.
   * This property also is responsible for adding the app icon and setting execution level.
   * (Advanced option leveraging `rcedit`)
   * @default true
   */
  readonly signAndEditExecutable?: boolean

  /**
   * Explicit file name/extensions (`str.endsWith`) to also sign. Advanced option.
   * Supports negative patterns, e.g. example that excludes `.appx` files: `["somefilename", ".dll", "!.appx"]`.
   * @see https://github.com/electron-userland/electron-builder/issues/7329
   * @default null
   */
  readonly signExts?: string[] | null
}

export type RequestedExecutionLevel = "asInvoker" | "highestAvailable" | "requireAdministrator"

export interface WindowsSigntoolConfiguration {
  /**
   * The custom function (or path to file or module id) to sign Windows executables
   */
  readonly sign?: CustomWindowsSign | string | null

  /**
   * Array of signing algorithms used. For AppX `sha256` is always used.
   * @default ['sha1', 'sha256']
   */
  readonly signingHashAlgorithms?: Array<"sha1" | "sha256"> | null

  /**
   * The path to the *.pfx certificate you want to sign with. Please use it only if you cannot use env variable `CSC_LINK` (`WIN_CSC_LINK`) for some reason.
   * Please see [Code Signing](./code-signing.md).
   */
  readonly certificateFile?: string | null

  /**
   * The password to the certificate provided in `certificateFile`. Please use it only if you cannot use env variable `CSC_KEY_PASSWORD` (`WIN_CSC_KEY_PASSWORD`) for some reason.
   * Please see [Code Signing](./code-signing.md).
   */
  readonly certificatePassword?: string | null

  /**
   * The name of the subject of the signing certificate, which is often labeled with the field name `issued to`. Required only for EV Code Signing and works only on Windows (or on macOS if [Parallels Desktop](https://www.parallels.com/products/desktop/) Windows 10 virtual machines exits).
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
   * @default http://timestamp.digicert.com
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
}

// https://learn.microsoft.com/en-us/azure/trusted-signing/how-to-signing-integrations
export interface WindowsAzureSigningConfiguration {
  /**
   * [The publisher name](https://github.com/electron-userland/electron-builder/issues/1187#issuecomment-278972073), exactly as in your code signed certificate. Several names can be provided.
   */
  readonly publisherName: string
  /**
   * The Trusted Signing Account endpoint. The URI value must have a URI that aligns to the
   * region your Trusted Signing Account and Certificate Profile you are specifying were created
   * in during the setup of these resources.
   *
   * Translates to field: Endpoint
   *
   * Requires one of environment variable configurations for authenticating to Microsoft Entra ID per [Microsoft's documentation](https://learn.microsoft.com/en-us/dotnet/api/azure.identity.environmentcredential?view=azure-dotnet#definition)
   */
  readonly endpoint: string
  /**
   * The Certificate Profile name. Translates to field: CertificateProfileName
   */
  readonly certificateProfileName: string
  /**
   * The Code Signing Signing Account name. Translates to field: CodeSigningAccountName
   */
  readonly codeSigningAccountName: string
  /**
   * The File Digest for signing each file. Translates to field: FileDigest
   * @default SHA256
   */
  readonly fileDigest?: string
  /**
   * The Timestamp rfc3161 server. Translates to field: TimestampRfc3161
   * @default http://timestamp.acs.microsoft.com
   */
  readonly timestampRfc3161?: string
  /**
   * The Timestamp Digest. Translates to field: TimestampDigest
   * @default SHA256
   */
  readonly timestampDigest?: string
  /**
   * Allow other CLI parameters (verbatim case-sensitive) to `Invoke-TrustedSigning`
   * Note: Key-Value pairs with `undefined`/`null` value are filtered out of the command.
   */
  [k: string]: string | Nullish
}
