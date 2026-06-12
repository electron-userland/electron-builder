import { CustomWindowsSign } from "../codeSign/win/windowsSignToolManager.js"
import { TargetConfigType } from "../core.js"
import { PlatformSpecificBuildOptions } from "./PlatformSpecificBuildOptions.js"

export interface WindowsConfiguration extends PlatformSpecificBuildOptions {
  /**
   * The target package type: list of `nsis`, `nsis-web` (Web installer), `portable` ([portable]https://www.electron.build/nsis#portable) app without installation), `appx`, `msi`, `msi-wrapped`, `squirrel`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`.
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
   * Code signing configuration. Set to `false` or `null` to disable Windows code signing
   * (executable resources such as the icon and metadata are still edited). Leave unset to
   * sign using credentials discovered from the environment (e.g. `WIN_CSC_LINK`). Otherwise
   * provide exactly one of the following signing modes:
   *
   * - `{ type: "signtool", ... }` — Sign with a local certificate file (.pfx/.p12) or a
   *   certificate from the Windows certificate store.
   * - `{ type: "hsm", ... }` — Sign using a Hardware Security Module (HSM) or FIPS-compliant
   *   hardware token via signtool's `/csp` (cryptographic service provider) and `/kc` (key
   *   container) flags. Requires `toolsets.winCodeSign: "1.x"`. Windows-only.
   * - `{ type: "pkcs11", ... }` — Sign using a PKCS#11 hardware token via osslsigncode.
   *   Available on macOS and Linux CI without a Windows VM.
   * - `{ type: "azure", ... }` — Sign via Azure Trusted Signing (cloud service). Requires
   *   Azure Entra ID environment variables for authentication.
   */
  readonly sign?: WindowsSigningConfiguration | false | null

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
   * Explicit file name/extensions (`str.endsWith`) to also sign. Advanced option.
   * Supports negative patterns, e.g. example that excludes `.appx` files: `["somefilename", ".dll", "!.appx"]`.
   * @see https://github.com/electron-userland/electron-builder/issues/7329
   * @default null
   */
  readonly signExts?: string[] | null
}

export type RequestedExecutionLevel = "asInvoker" | "highestAvailable" | "requireAdministrator"

// ─── Shared base for signtool-family signing modes ───────────────────────────

interface WindowsSigningSharedOptions {
  /**
   * [The publisher name](https://github.com/electron-userland/electron-builder/issues/1187#issuecomment-278972073), exactly as in your code signed certificate. Several names can be provided.
   * Defaults to common name from your code signing certificate.
   */
  readonly publisherName?: string | Array<string> | null

  /**
   * Array of signing algorithms used. For AppX `sha256` is always used.
   * @default ['sha1', 'sha256']
   */
  readonly signingHashAlgorithms?: Array<"sha1" | "sha256"> | null

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
   * The path to an additional certificate file you want to add to the signature block.
   */
  readonly additionalCertificateFile?: string | null

  /**
   * The custom function (or path to file or module id) to sign Windows executables.
   */
  readonly sign?: CustomWindowsSign | string | null
}

// ─── Signing mode: signtool (file or Windows certificate store) ──────────────

export interface WindowsSigntoolSigningConfig extends WindowsSigningSharedOptions {
  readonly type: "signtool"

  /**
   * The path to the *.pfx or *.p12 certificate file. Prefer the `WIN_CSC_LINK` environment
   * variable when possible. See [Code Signing](https://www.electron.build/code-signing).
   */
  readonly certificateFile?: string | null

  /**
   * The password to the certificate provided in `certificateFile`. Prefer the
   * `WIN_CSC_KEY_PASSWORD` environment variable when possible.
   */
  readonly certificatePassword?: string | null

  /**
   * The name of the subject of the signing certificate. Required for EV Code Signing.
   * Works only on Windows (or macOS with Parallels Desktop).
   */
  readonly certificateSubjectName?: string | null

  /**
   * The SHA1 hash of the signing certificate. Works only on Windows (or macOS with Parallels Desktop).
   */
  readonly certificateSha1?: string | null
}

// ─── Signing mode: hsm (Hardware Security Module via signtool /csp /kc) ──────

export interface WindowsHsmSigningConfig extends WindowsSigningSharedOptions {
  readonly type: "hsm"

  /**
   * The name of the cryptographic service provider (CSP) that holds the private key.
   * Maps to signtool's `/csp` flag. Examples:
   * - Google Cloud KMS: `"Google Cloud KMS Provider"`
   * - Smart card / FIPS token: `"Microsoft Base Smart Card Crypto Provider"`
   *
   * Requires `toolsets.winCodeSign: "1.x"`. Windows-only — use `type: "pkcs11"` on macOS/Linux.
   */
  readonly cryptoServiceProvider: string

  /**
   * The key container name within the CSP. Maps to signtool's `/kc` flag.
   *
   * Example for Google Cloud KMS:
   * `"projects/PROJECT_ID/locations/LOCATION/keyRings/KEY_RING/cryptoKeys/KEY_NAME/cryptoKeyVersions/1"`
   */
  readonly keyContainer: string

  /**
   * Path to the certificate file containing the public certificate chain (.crt / .cer / .pfx).
   * The private key is NOT read from this file — it is provided by the HSM via `cryptoServiceProvider`.
   */
  readonly certificateFile?: string | null

  /**
   * The SHA1 thumbprint of the certificate in the Windows certificate store.
   */
  readonly certificateSha1?: string | null

  /**
   * The subject name of the certificate in the Windows certificate store.
   */
  readonly certificateSubjectName?: string | null
}

// ─── Signing mode: pkcs11 (cross-platform PKCS#11 via osslsigncode) ──────────

export interface WindowsPkcs11SigningConfig extends WindowsSigningSharedOptions {
  readonly type: "pkcs11"

  /**
   * Path to the PKCS#11 shared library (`.so` on Linux, `.dylib` on macOS).
   * The library must be installed separately — electron-builder does not bundle it.
   *
   * Example: `"/usr/lib/x86_64-linux-gnu/opensc-pkcs11.so"`
   *
   * Must be paired with `pkcs11KeyUri`.
   */
  readonly pkcs11Module: string

  /**
   * RFC 7512 PKCS#11 URI identifying the private key within the module.
   * Maps to osslsigncode's `-key` parameter.
   *
   * Example: `"pkcs11:token=MyToken;object=MyKey;type=private"`
   *
   * Must be paired with `pkcs11Module`.
   */
  readonly pkcs11KeyUri: string

  /**
   * Optional path to a certificate chain file to accompany the PKCS#11 key.
   * If omitted the certificate embedded in the token is used.
   */
  readonly certificateFile?: string | null
}

// ─── Signing mode: azure (Azure Trusted Signing) ──────────────────────────────

export interface WindowsAzureSigningConfig {
  readonly type: "azure"

  /**
   * [The publisher name](https://github.com/electron-userland/electron-builder/issues/1187#issuecomment-278972073), exactly as in your code signed certificate. Several names can be provided.
   */
  readonly publisherName: string

  /**
   * The Trusted Signing Account endpoint. The URI value must align to the region your Trusted
   * Signing Account and Certificate Profile were created in.
   *
   * Requires Azure Entra ID environment variables per
   * [Microsoft's documentation](https://learn.microsoft.com/en-us/dotnet/api/azure.identity.environmentcredential?view=azure-dotnet#definition).
   */
  readonly endpoint: string

  /**
   * The Certificate Profile name. Translates to field: CertificateProfileName.
   */
  readonly certificateProfileName: string

  /**
   * The Code Signing Account name. Translates to field: CodeSigningAccountName.
   */
  readonly codeSigningAccountName: string

  /**
   * The file digest algorithm. Translates to field: FileDigest.
   * @default SHA256
   */
  readonly fileDigest?: string

  /**
   * The RFC3161 timestamp server. Translates to field: TimestampRfc3161.
   * @default http://timestamp.acs.microsoft.com
   */
  readonly timestampRfc3161?: string

  /**
   * The timestamp digest algorithm. Translates to field: TimestampDigest.
   * @default SHA256
   */
  readonly timestampDigest?: string

  /**
   * Additional fields to include verbatim in the `metadata.json` file passed to
   * `Azure.CodeSigning.Dlib.dll` via `signtool /dmdf`. Use this for DLib-specific options
   * not covered by the typed fields above (e.g. `ExcludeCredentials`, `CorrelationId`).
   */
  readonly additionalMetadata?: Record<string, string>
}

// ─── Discriminated union ──────────────────────────────────────────────────────

export type WindowsSigningConfiguration = WindowsSigntoolSigningConfig | WindowsHsmSigningConfig | WindowsPkcs11SigningConfig | WindowsAzureSigningConfig

/** Signing modes that use signtool.exe or osslsigncode (not Azure). */
export type WindowsSigntoolFamilyConfig = WindowsSigntoolSigningConfig | WindowsHsmSigningConfig | WindowsPkcs11SigningConfig

/**
 * Resolves the active signing configuration object. `false`, `null`, and unset all mean
 * "no explicit signing config object" (env-based discovery still applies when unset).
 */
export function resolveWindowsSigningConfiguration(config: WindowsConfiguration): WindowsSigningConfiguration | null {
  const { sign } = config
  return sign == null || sign === false ? null : sign
}

/** Whether Windows code signing has been explicitly disabled via `sign: false | null`. */
export function isWindowsSigningDisabled(config: WindowsConfiguration): boolean {
  return config.sign === false || config.sign === null
}
