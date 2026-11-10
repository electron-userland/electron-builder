import { CommonWindowsInstallerConfiguration } from "./CommonWindowsInstallerConfiguration.js"
import { CommonWixOptions } from "./MsiOptions.js"

export interface MsiWrappedOptions extends CommonWixOptions, CommonWindowsInstallerConfiguration {
  /**
   * Extra arguments to provide to the wrapped installer (ie: /S for silent install)
   */
  readonly wrappedInstallerArgs?: string | null

  /**
   * Determines if the wrapped installer should be executed with impersonation
   * @default false
   */
  readonly impersonate?: boolean
}
