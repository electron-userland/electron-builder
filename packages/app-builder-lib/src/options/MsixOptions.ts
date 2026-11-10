import { CommonAppxOptions } from "./AppXOptions.js"

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

export interface MsixOptions extends CommonAppxOptions {
  /** @private */
  readonly electronUpdaterAware?: boolean

  /**
   * The manifest's `TargetDeviceFamily/@MinVersion`. The default is Windows 10 version 1809, the minimum for Store submissions.
   * @default 10.0.17763.0
   */
  readonly minVersion?: string | null

  /**
   * The manifest's `TargetDeviceFamily/@MaxVersionTested`. Defaults to `minVersion`, else to its default.
   */
  readonly maxVersionTested?: string | null

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
