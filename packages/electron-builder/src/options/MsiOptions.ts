import { TargetSpecificOptions } from "../core"
import { CommonWindowsInstallerOptions } from "./CommonWindowsInstallerOptions"

export interface MsiOptions extends CommonWindowsInstallerOptions, TargetSpecificOptions {
  /**
   * One-click installation.
   * @default true
   */
  readonly oneClick?: boolean

  /**
   * Install per all users (per-machine).
   * @default true
   * @private Well, one-click per-user is not easy to write for us, feature hidden for now
   */
  readonly perMachine?: boolean

  /**
   * The [upgrade code](https://msdn.microsoft.com/en-us/library/windows/desktop/aa372375(v=vs.85).aspx). Optional, by default generated using app id.
   */
  readonly upgradeCode?: string | null

  /**
   * If `warningsAsErrors` is `true` (default): treat warnings as errors. If `warningsAsErrors` is `false`: allow warnings.
   * @default true
   */
  readonly warningsAsErrors?: boolean
}