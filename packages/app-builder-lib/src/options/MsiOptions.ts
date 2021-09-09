import { TargetSpecificOptions } from "../core"
import { CommonWindowsInstallerConfiguration } from "./CommonWindowsInstallerConfiguration"

export interface MsiOptions extends CommonWindowsInstallerConfiguration, TargetSpecificOptions {
  /**
   * One-click installation.
   * @default true
   */
  readonly oneClick?: boolean

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

  /**
   * The [shortcut iconId](https://wixtoolset.org/documentation/manual/v4/reference/wxs/shortcut/). Optional, by default generated using app file name.
   */
  readonly iconId?: string
}
