import { CommonWixOptions } from "./MsiOptions.js"

/**
 * Options of the `msiWrapped` target, an MSI that runs the NSIS installer. The installer itself (one-click or assisted, per-machine,
 * shortcuts, ...) is configured under `nsis`.
 */
export interface MsiWrappedOptions extends CommonWixOptions {
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
