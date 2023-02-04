import { TargetSpecificOptions } from "../core"
import { CommonWindowsInstallerConfiguration } from "./CommonWindowsInstallerConfiguration"

export interface MsiWrappedOptions extends CommonWindowsInstallerConfiguration, TargetSpecificOptions {
  /**
   * Extra arguments to provide to the wrapped installer (ie: /S for silent install)
   */
  readonly wrappedInstallerArgs?: string | null

  /**
   * Determines if the wrapped installer should be executed with impersonation
   * @default false
   */
  readonly impersonate?: boolean

  /**
   * The [upgrade code](https://msdn.microsoft.com/en-us/library/windows/desktop/aa372375(v=vs.85).aspx). Optional, by default generated using app id.
   */
  readonly upgradeCode?: string | null

  /**
   * If `warningsAsErrors` is `true` (default): treat warnings as errors. If `warningsAsErrors` is `false`: allow warnings.
   * @default true
   */
  readonly warningsAsErrors?: boolean

  /**
   * Any additional arguments to be passed to the WiX installer compiler, such as `["-ext", "WixUtilExtension"]`
   */
  readonly additionalWixArgs?: Array<string> | null
}
