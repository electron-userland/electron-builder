import { TargetSpecificOptions } from "../core.js"
import { CommonWindowsInstallerConfiguration } from "./CommonWindowsInstallerConfiguration.js"

/** WiX Toolset options shared by the `msi` and `msiWrapped` targets, which are both built with candle.exe and light.exe. */
export interface CommonWixOptions extends TargetSpecificOptions {
  /**
   * The [upgrade code](https://learn.microsoft.com/en-us/windows/win32/msi/upgradecode). Optional, by default generated using app id.
   */
  readonly upgradeCode?: string | null

  /**
   * If `warningsAsErrors` is `true` (default): treat warnings as errors. If `warningsAsErrors` is `false`: allow warnings.
   * @default true
   */
  readonly warningsAsErrors?: boolean

  /**
   * Any additional arguments passed to both the WiX compiler (candle.exe) and linker (light.exe), such as `["-ext", "WixUtilExtension"]`.
   */
  readonly additionalWixArgs?: Array<string> | null

  /**
   * Any additional arguments passed to the WiX linker (light.exe) only, such as `["-cultures:ja-jp"]`.
   */
  readonly additionalLightArgs?: Array<string> | null
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MsiOptions extends CommonWixOptions, CommonWindowsInstallerConfiguration {}
