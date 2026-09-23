import { TargetSpecificOptions } from "../core.js"

export interface MsixWindowsService {
  /** The service name used in the Windows Service Control Manager. */
  readonly name: string
  /**
   * Relative path to the service executable within the package.
   * Defaults to the main app executable.
   */
  readonly executable?: string
  /**
   * How Windows starts the service. Required by the desktop6 schema.
   * @default "manual"
   */
  readonly startupType?: "auto" | "manual" | "disabled"
  /**
   * The account the service runs under. Required by the desktop6 schema.
   * @default "localSystem"
   */
  readonly startAccount?: "localSystem" | "localService" | "networkService"
  /**
   * Optional command-line arguments passed to the service executable.
   */
  readonly arguments?: string
}

export interface MsixOptions extends TargetSpecificOptions {
  /**
   * The application id. Defaults to `identityName`. This string contains alpha-numeric fields separated by periods.
   * Each field must begin with an ASCII alphabetic character.
   */
  readonly applicationId?: string

  /**
   * The background color of the app tile.
   * @default #464646
   */
  readonly backgroundColor?: string | null

  /**
   * A friendly name displayed to users. Corresponds to Properties.DisplayName. Defaults to the application product name.
   */
  readonly displayName?: string | null

  /**
   * The package identity name. Corresponds to Identity.Name. Defaults to the application name.
   */
  readonly identityName?: string | null

  /**
   * The Windows Store publisher. Not used if MSIX is built for testing.
   */
  readonly publisher?: string | null

  /**
   * A friendly name for the publisher displayed to users. Corresponds to Properties.PublisherDisplayName.
   * Defaults to company name from the application metadata.
   */
  readonly publisherDisplayName?: string | null

  /**
   * The list of supported languages listed in the Windows Store. The first entry (index 0) will be the default language.
   * @default ["en-US"]
   */
  readonly languages?: Array<string> | string | null

  /**
   * Whether to add auto launch extension. Defaults to `true` if electron-winstore-auto-launch is in the dependencies.
   */
  readonly addAutoLaunchExtension?: boolean

  /**
   * Relative path to custom extensions xml to be included in the AppxManifest.xml.
   */
  readonly customExtensionsPath?: string

  /**
   * The list of capabilities to be added to the AppxManifest.xml.
   * The `runFullTrust` capability is obligatory for Electron apps and will be auto-added if not specified.
   * @default ["runFullTrust"]
   */
  readonly capabilities?: Array<string> | null

  /**
   * Relative path to a custom AppxManifest.xml template located in the build resources directory.
   * Supports the same `${}` template macros as the default template, including the MSIX-specific
   * `${packageIntegrity}` macro. Windows services are injected via the `${extensions}` macro
   * alongside protocol/file-association extensions.
   */
  readonly customManifestPath?: string

  /**
   * Whether to overlay the app's name on top of tile images on the Start screen.
   * @default false
   */
  readonly showNameOnTiles?: boolean

  /** @private */
  readonly electronUpdaterAware?: boolean

  /**
   * Whether to set the build number in the version field.
   * @default false
   */
  readonly setBuildNumber?: boolean

  /**
   * Set the MinVersion field in the AppxManifest.xml.
   * @default "10.0.17763.0" (Windows 10 version 1809 — minimum for Store submissions)
   */
  readonly minVersion?: string | null

  /**
   * Set the MaxVersionTested field in the AppxManifest.xml.
   * @default same as minVersion
   */
  readonly maxVersionTested?: string | null

  /** @private */
  readonly makeappxArgs?: Array<string> | null

  /**
   * Whether to produce a .msixbundle when more than one architecture is built.
   * @default true
   */
  readonly createMsixbundle?: boolean

  /**
   * Whether to produce a .msixupload archive suitable for submission to the Microsoft Store Partner Center.
   * @default false
   */
  readonly createMsixupload?: boolean

  /**
   * Enforce package integrity (uap10:PackageIntegrity). Requires Windows 10 version 2004 (build 19041) or later.
   * When enabled, Windows verifies that no files have been tampered with after the package was signed.
   * @default false
   */
  readonly enforcePackageIntegrity?: boolean

  /**
   * Windows Services to register with the MSIX package (desktop6 namespace).
   * Requires Windows 10 version 1903 or later, and the `packagedServices` (or `localSystemServices`)
   * restricted capability declared via `capabilities`.
   */
  readonly windowsServices?: Array<MsixWindowsService>
}
