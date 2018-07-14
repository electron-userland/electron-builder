import { TargetSpecificOptions } from "../core"

export interface AppXOptions extends TargetSpecificOptions {
  /**
   * The application id. Defaults to `identityName`. Can’t start with numbers.
   */
  readonly applicationId?: string

  /**
   * The background color of the app tile. See [Visual Elements](https://msdn.microsoft.com/en-us/library/windows/apps/br211471.aspx).
   * @default #464646
   */
  readonly backgroundColor?: string | null

  /**
   * A friendly name that can be displayed to users. Corresponds to [Properties.DisplayName](https://msdn.microsoft.com/en-us/library/windows/apps/br211432.aspx).
   * Defaults to the application product name.
   */
  readonly displayName?: string | null

  /**
   * The name. Corresponds to [Identity.Name](https://msdn.microsoft.com/en-us/library/windows/apps/br211441.aspx). Defaults to the [application name](/configuration/configuration#Metadata-name).
   */
  readonly identityName?: string | null

  /**
   * The Windows Store publisher. Not used if AppX is build for testing. See [AppX Package Code Signing](#appx-package-code-signing) below.
   */
  readonly publisher?: string | null

  /**
   * A friendly name for the publisher that can be displayed to users. Corresponds to [Properties.PublisherDisplayName](https://msdn.microsoft.com/en-us/library/windows/apps/br211460.aspx).
   * Defaults to company name from the application metadata.
   */
  readonly publisherDisplayName?: string | null

  /**
   * The list of [supported languages](https://docs.microsoft.com/en-us/windows/uwp/globalizing/manage-language-and-region#specify-the-supported-languages-in-the-apps-manifest) that will be listed in the Windows Store.
   * The first entry (index 0) will be the default language.
   * Defaults to en-US if omitted.
   */
  readonly languages?: Array<string> | string | null

  /**
   * Whether to add auto launch extension. Defaults to `true` if [electron-winstore-auto-launch](https://github.com/felixrieseberg/electron-winstore-auto-launch) in the dependencies.
   */
  readonly addAutoLaunchExtension?: boolean

  /**
   * @private
   * @default false
   */
  readonly electronUpdaterAware?: boolean

  /** @private */
  readonly makeappxArgs?: Array<string> | null
}