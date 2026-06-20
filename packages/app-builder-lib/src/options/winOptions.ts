import { CustomWindowsSign } from "../codeSign/win/windowsSignToolManager.js"
import { TargetConfigType } from "../core.js"
import { PlatformSpecificBuildOptions } from "./PlatformSpecificBuildOptions.js"

export interface WindowsConfiguration extends PlatformSpecificBuildOptions {
  /**
   * The target package type: list of `nsis`, `nsis-web` (Web installer), `portable` ([portable app](https://www.electron.build/nsis#portable) without installation), `appx`, `msix`, `msi`, `msi-wrapped`, `squirrel`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`.
   * AppX and MSIX packages can be built on Windows 10 or Windows Server 2012 R2 (version 6.3+) or later, and on macOS via Parallels Desktop.
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
   * Code signing configuration. Code signing stamps every installer and executable
   * electron-builder produces with an Authenticode signature, so that Windows (SmartScreen / UAC)
   * and your auto-updater can verify the publisher and that the files were not tampered with.
   *
   * How this option behaves:
   * - Leave **unset** to sign using credentials discovered from the environment — primarily a
   *   certificate supplied via `WIN_CSC_LINK` (or `CSC_LINK`) with its password in
   *   `WIN_CSC_KEY_PASSWORD` (or `CSC_KEY_PASSWORD`). `WIN_CSC_LINK` accepts a file path, an
   *   `https://` URL, or a base64-encoded certificate. This is the recommended setup for CI.
   * - Set to `false` or `null` to **disable** code signing entirely (executable resources such as
   *   the icon and metadata are still edited).
   * - Set to an **object** to configure signing explicitly. The `type` field selects the signing
   *   backend (`signtool` is the implicit default) and dispatches to a dedicated sign manager;
   *   provide exactly one of the modes below. Each output artifact is signed individually, and by
   *   default executables are dual-signed (see `signingHashAlgorithms`).
   *
   * - `{ type: "signtool", ... }` — Sign with a local certificate file (.pfx/.p12) or a
   *   certificate from the Windows certificate store. Uses Microsoft `signtool.exe` on Windows and
   *   `osslsigncode` on macOS/Linux.
   * - `{ type: "hsm", ... }` — Sign using a Hardware Security Module (HSM) or FIPS-compliant
   *   hardware token via signtool's `/csp` (cryptographic service provider) and `/kc` (key
   *   container) flags. Requires a modern `winCodeSign` toolset (the default — only the legacy
   *   `"0.0.0"` pin is unsupported). Windows-only.
   * - `{ type: "pkcs11", ... }` — Sign using a PKCS#11 hardware token via osslsigncode.
   *   Available on macOS and Linux CI without a Windows VM.
   * - `{ type: "azure", ... }` — Sign via Azure Trusted Signing (cloud service). Requires
   *   Azure Entra ID environment variables for authentication.
   *
   * See [Code Signing](https://www.electron.build/code-signing).
   */
  readonly sign?: WindowsSigningConfiguration | false | null

  /**
   * Whether the NSIS auto-updater should verify the Authenticode signature of a downloaded update
   * before installing it. This is a **runtime** check performed by your app via electron-updater,
   * not a build-time check.
   *
   * When enabled (the default), the resolved [publisher name](#publisherName) is embedded into
   * `app-update.yml` at build time. At update time electron-updater inspects the certificate that
   * signed the downloaded installer and compares its subject (Distinguished Name / Common Name)
   * against that publisher name, refusing to install on a mismatch. This prevents a tampered or
   * maliciously substituted update from being installed.
   *
   * Set to `false` to skip verification — in which case the publisher name is **not** embedded.
   * Disable this only if your updates are not Authenticode-signed.
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
   * Additional file name suffixes to code sign, beyond the default. By default electron-builder
   * only signs `.exe` files; list extra suffixes here to also sign e.g. `.dll`, `.node`, or
   * specific file names. Advanced option — most apps do not need it.
   *
   * Each entry is matched with `String.endsWith`, so both bare extensions (`".dll"`) and full file
   * names (`"mybinary.dll"`) work. Prefix a pattern with `!` to *exclude* a suffix that would
   * otherwise be signed. Positive patterns are evaluated first, then negative ones. For example,
   * `["somefilename", ".dll", "!.appx"]` signs `.dll` files (and anything ending in `somefilename`)
   * but never signs `.appx` files.
   *
   * @see https://github.com/electron-userland/electron-builder/issues/7329
   * @default null
   */
  readonly signExts?: string[] | null
}

export type RequestedExecutionLevel = "asInvoker" | "highestAvailable" | "requireAdministrator"

// ─── Shared base for signtool-family signing modes ───────────────────────────

/**
 * Options shared by every certificate-based signing mode (`signtool`, `hsm`, `pkcs11`). These
 * control the signature itself — publisher identity, digest algorithms, timestamping, and the
 * extra certificates added to the signature block — independently of where the private key lives.
 */
interface WindowsSigningSharedOptions {
  /**
   * The publisher name(s) to associate with the signature, written exactly as the subject appears
   * in your code signing certificate. May be a single string or an array — an array is useful when
   * rotating certificates, so updates signed by either the old or the new certificate still verify.
   *
   * This value is not a `signtool` argument; it is consumed in two places:
   * - **Update verification** — when [verifyUpdateCodeSignature](#verifyUpdateCodeSignature) is
   *   enabled, it is written into `app-update.yml` and electron-updater checks it against the
   *   certificate that signed each downloaded update.
   * - **AppX / MSIX identity** — the package `Publisher` attribute must equal the certificate
   *   subject, so electron-builder derives it from this value (or the certificate) to keep them
   *   in sync; a mismatch makes packaging fail with `ERROR_BAD_FORMAT`.
   *
   * Defaults to the Common Name (CN) extracted from your code signing certificate. Set to `null`
   * to opt out.
   *
   * @see https://github.com/electron-userland/electron-builder/issues/1187#issuecomment-278972073
   */
  readonly publisherName?: string | Array<string> | null

  /**
   * The digest (hash) algorithms to sign with, applied via signtool's `/fd` flag (or
   * osslsigncode's `-h`). One signing pass runs per entry, in order; listing more than one
   * **dual-signs** the file, with each additional signature appended as a nested signature
   * (signtool `/as`). Signing with both `sha1` and `sha256` lets a single binary validate on
   * legacy (pre-SHA-2) Windows as well as modern Windows.
   *
   * Some targets override this: `.msi` cannot be dual-signed (a single hash is used) and AppX/MSIX
   * is always `sha256` only.
   *
   * @default ['sha1', 'sha256']
   */
  readonly signingHashAlgorithms?: Array<"sha1" | "sha256"> | null

  /**
   * The URL of the [RFC 3161](https://www.ietf.org/rfc/rfc3161.txt) timestamp server, used for
   * SHA-256 and nested/appended signatures (signtool's `/tr` flag). Timestamping records *when*
   * the file was signed so the signature stays valid after the signing certificate expires.
   * Ignored when the build runs with `ELECTRON_BUILDER_OFFLINE=true`.
   *
   * @default http://timestamp.digicert.com
   */
  readonly rfc3161TimeStampServer?: string | null

  /**
   * The URL of the legacy Authenticode timestamp server, used for SHA-1 signatures (signtool's
   * `/t` flag). This is also the timestamp server used by `osslsigncode` (`-t`) when signing on
   * macOS/Linux. See [rfc3161TimeStampServer](#rfc3161TimeStampServer) for SHA-256 / nested
   * signatures. Ignored when the build runs with `ELECTRON_BUILDER_OFFLINE=true`.
   *
   * @default http://timestamp.digicert.com
   */
  readonly timeStampServer?: string | null

  /**
   * Path to an additional certificate file (typically an intermediate / cross-signing CA
   * certificate) whose contents are added to the signature block via signtool's `/ac` flag. Use
   * this when the signing certificate's full chain is not already present on target machines and
   * you want it embedded in the signature so the chain can be validated.
   */
  readonly additionalCertificateFile?: string | null

  /**
   * A custom signing hook that **replaces** electron-builder's built-in `signtool` /
   * `osslsigncode` invocation. Provide a function, or the path / module id of a file that exports
   * a `sign` function (resolved relative to the project, then as a module).
   *
   * The hook is invoked once per signing pass (i.e. once per entry in
   * [signingHashAlgorithms](#signingHashAlgorithms)) and receives a configuration object describing
   * the file to sign (`path`), the resolved certificate info (`cscInfo`), the current `hash`, and
   * whether this pass is a nested signature (`isNest`), plus a `computeSignToolArgs(isWin)` helper
   * that returns the default arguments electron-builder would otherwise have used. Use this to
   * integrate an external or cloud signing service. See
   * [Code Signing](https://www.electron.build/code-signing).
   */
  readonly sign?: CustomWindowsSign | string | null
}

// ─── Signing mode: signtool (file or Windows certificate store) ──────────────

/**
 * Sign with a certificate file (`.pfx` / `.p12`) or with a certificate from the Windows
 * certificate store, using Microsoft `signtool.exe` on Windows and `osslsigncode` on macOS/Linux.
 * This is the default mode when `win.sign` is unset. Supply the certificate one of four ways:
 * a file via `certificateFile` (or the `WIN_CSC_LINK` env var), or a store lookup via
 * `certificateSubjectName` or `certificateSha1`.
 */
export interface WindowsSigntoolSigningConfig extends WindowsSigningSharedOptions {
  /** Discriminator selecting the default file/store signing mode. */
  readonly type: "signtool"

  /**
   * Path to the PKCS#12 certificate file (`.pfx` or `.p12`) holding both the signing certificate
   * and its private key. Passed to signtool via `/f` (or osslsigncode via `-pkcs12`).
   *
   * Prefer supplying this out-of-band via the `WIN_CSC_LINK` (or `CSC_LINK`) environment variable
   * instead of hardcoding a path — that variable also accepts an `https://` URL or a base64-encoded
   * certificate, which is safer and more convenient on CI. See
   * [Code Signing](https://www.electron.build/code-signing).
   */
  readonly certificateFile?: string | null

  /**
   * The password protecting the private key in `certificateFile`. Passed to signtool via `/p`
   * (or osslsigncode via `-pass`).
   *
   * Prefer the `WIN_CSC_KEY_PASSWORD` (or `CSC_KEY_PASSWORD`) environment variable so the secret
   * never lands in your build configuration.
   */
  readonly certificatePassword?: string | null

  /**
   * Select the signing certificate from the Windows certificate store by (a substring of) its
   * subject name, instead of pointing at a `.pfx` file. electron-builder enumerates the installed
   * code-signing certificates, picks the match, and signs by its thumbprint
   * (`/sha1 <thumbprint> /s <store>`). **Required for EV (Extended Validation) certificates**,
   * whose private keys live on a hardware token and cannot be exported to a file.
   *
   * Works only on Windows (or macOS with Parallels Desktop, via the bundled Windows VM).
   */
  readonly certificateSubjectName?: string | null

  /**
   * Select the signing certificate from the Windows certificate store by its SHA-1 thumbprint,
   * instead of pointing at a `.pfx` file. electron-builder looks the certificate up in the store
   * and signs with `/sha1 <thumbprint> /s <store>`. Like
   * [certificateSubjectName](#certificateSubjectName), this suits EV certificates backed by a
   * hardware token; if both are set, both must resolve to the same certificate.
   *
   * Works only on Windows (or macOS with Parallels Desktop, via the bundled Windows VM).
   */
  readonly certificateSha1?: string | null
}

// ─── Signing mode: hsm (Hardware Security Module via signtool /csp /kc) ──────

/**
 * @beta HSM signing is available in v27 as a beta feature. The interface is stable but
 * real-hardware test coverage is limited.
 */
export interface WindowsHsmSigningConfig extends WindowsSigningSharedOptions {
  /** Discriminator selecting HSM / hardware-token signing via signtool's `/csp` and `/kc` flags. */
  readonly type: "hsm"

  /**
   * The name of the cryptographic service provider (CSP) that holds the private key.
   * Maps to signtool's `/csp` flag. Examples:
   * - Google Cloud KMS: `"Google Cloud KMS Provider"`
   * - Smart card / FIPS token: `"Microsoft Base Smart Card Crypto Provider"`
   *
   * Requires a modern `winCodeSign` toolset (the default; only the legacy `"0.0.0"` pin is
   * unsupported). Windows-only — use `type: "pkcs11"` on macOS/Linux.
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
   * Alternative to `certificateFile`: locate the public certificate in the Windows certificate
   * store by its SHA-1 thumbprint. The private key still comes from the HSM via
   * `cryptoServiceProvider` / `keyContainer`; this only identifies which public certificate to sign
   * with.
   */
  readonly certificateSha1?: string | null

  /**
   * Alternative to `certificateFile`: locate the public certificate in the Windows certificate
   * store by (a substring of) its subject name. The private key still comes from the HSM via
   * `cryptoServiceProvider` / `keyContainer`; this only identifies which public certificate to sign
   * with.
   */
  readonly certificateSubjectName?: string | null
}

// ─── Signing mode: pkcs11 (cross-platform PKCS#11 via osslsigncode) ──────────

/**
 * Sign with a PKCS#11 hardware token (smart card, USB HSM, cloud KMS exposed via a PKCS#11
 * provider) using `osslsigncode`. Unlike `hsm`, this mode does **not** require Windows or a
 * Windows VM, so it can sign Windows binaries directly from macOS/Linux CI. The token PIN is read
 * from the `WIN_CSC_KEY_PASSWORD` (or `CSC_KEY_PASSWORD`) environment variable.
 *
 * @beta PKCS#11 signing is available in v27 as a beta feature. The interface is stable but
 * real-hardware test coverage is limited.
 */
export interface WindowsPkcs11SigningConfig extends WindowsSigningSharedOptions {
  /** Discriminator selecting cross-platform PKCS#11 token signing via `osslsigncode`. */
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

/**
 * The `signtool /dlib` Azure Trusted Signing integration was introduced in `toolsets.winCodeSign: 1.3.0`.
 * The legacy PowerShell integration is deprecated, but leverages the same underlying Azure APIs, so both interfaces share the same config shape.
 */
export interface WindowsAzureSigningConfig {
  /** Discriminator selecting Azure Trusted Signing (cloud signing — no local certificate). */
  readonly type: "azure"

  /**
   * The publisher name to associate with the signature, exactly as it appears in the certificate
   * issued by your Trusted Signing certificate profile. Required. Used for
   * [update verification](#verifyUpdateCodeSignature) (embedded in `app-update.yml` and checked by
   * electron-updater) and must match the certificate subject.
   *
   * @see https://github.com/electron-userland/electron-builder/issues/1187#issuecomment-278972073
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
   * The name of the Trusted Signing Certificate Profile to sign with, as created in your Azure
   * Code Signing Account. Maps to the DLib metadata field `CertificateProfileName`.
   */
  readonly certificateProfileName: string

  /**
   * The name of the Azure Trusted Signing (Code Signing) Account that owns the certificate profile.
   * Maps to the DLib metadata field `CodeSigningAccountName`.
   */
  readonly codeSigningAccountName: string

  /**
   * The digest algorithm used to hash the files being signed. Maps to the DLib metadata field
   * `FileDigest`.
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
