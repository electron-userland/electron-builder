/**
 * Squirrel.Windows options.
 */
import { TargetSpecificOptions } from "../core"

export interface SquirrelWindowsOptions extends TargetSpecificOptions {
  /**
   * A URL to an ICO file to use as the application icon (displayed in Control Panel > Programs and Features). Defaults to the Electron icon.
   *
   * Please note — [local icon file url is not accepted](https://github.com/atom/grunt-electron-installer/issues/73), must be https/http.
   *
   * If you don't plan to build windows installer, you can omit it.
   * If your project repository is public on GitHub, it will be `https://github.com/${u}/${p}/blob/master/build/icon.ico?raw=true` by default.
   */
  readonly iconUrl?: string | null

  /**
   * The path to a .gif file to display during install. `build/install-spinner.gif` will be used if exists (it is a recommended way to set)
   * (otherwise [default](https://github.com/electron/windows-installer/blob/master/resources/install-spinner.gif)).
   */
  readonly loadingGif?: string | null

  /**
   * Whether to create an MSI installer. Defaults to `false` (MSI is not created).
   */
  readonly msi?: boolean

  /**
   * A URL to your existing updates. Or `true` to automatically set to your GitHub repository. If given, these will be downloaded to create delta updates.
   */
  readonly remoteReleases?: string | boolean | null

  /**
   * Authentication token for remote updates
   */
  readonly remoteToken?: string | null

  /**
   * Use `appId` to identify package instead of `name`.
   */
  readonly useAppIdAsId?: boolean

  /**
   * https://github.com/electron-userland/electron-builder/issues/1743
   * @private
   */
  readonly name?: string
}
