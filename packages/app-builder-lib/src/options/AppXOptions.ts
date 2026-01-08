import { TargetSpecificOptions } from "../core"

export interface AppXOptions extends TargetSpecificOptions {
  /**
   * The application id. Defaults to `identityName`. This string contains alpha-numeric fields separated by periods. Each field must begin with an ASCII alphabetic character.
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
   * The name. Corresponds to [Identity.Name](https://msdn.microsoft.com/en-us/library/windows/apps/br211441.aspx). Defaults to the [application name](./configuration.md#metadata).
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
   * Relative path to custom extensions xml to be included in an `appmanifest.xml`.
   */
  readonly customExtensionsPath?: string

  /**
   * The list of [capabilities](https://learn.microsoft.com/en-us/windows/uwp/packaging/app-capability-declarations) to be added to an `appmanifest.xml`.
   * The `runFullTrust` capability is obligatory for electron apps and will be auto added if not specified here.
   * Defaults to `['runFullTrust']` if omitted
   * Example:  `['runFullTrust', 'privateNetworkClientServer', 'webcam']`
   */
  readonly capabilities?: Array<string> | null

  /**
   * (Advanced Option) Relative path to custom `appmanifest.xml` (file name doesn't matter, it'll be renamed) located in build resources directory.
   * Supports the following template macros:
   *
   * - ${publisher}
   * - ${publisherDisplayName}
   * - ${version}
   * - ${applicationId}
   * - ${identityName}
   * - ${executable}
   * - ${displayName}
   * - ${description}
   * - ${backgroundColor}
   * - ${logo}
   * - ${square150x150Logo}
   * - ${square44x44Logo}
   * - ${lockScreen}
   * - ${defaultTile}
   * - ${splashScreen}
   * - ${arch}
   * - ${resourceLanguages}
   * - ${capabilities}
   * - ${extensions}
   * - ${minVersion}
   * - ${maxVersionTested}
   */
  readonly customManifestPath?: string

  /**
   * Whether to overlay the app's name on top of tile images on the Start screen. Defaults to `false`. (https://docs.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-uap-shownameontiles) in the dependencies.
   * @default false
   */
  readonly showNameOnTiles?: boolean

  /**
   * @private
   * @default false
   */
  readonly electronUpdaterAware?: boolean

  /**
   * Whether to set build number. See https://github.com/electron-userland/electron-builder/issues/3875
   * @default false
   */
  readonly setBuildNumber?: boolean

  /**
   * Set the MinVersion field in the appx manifest.xml
   * @default arch === Arch.arm64 ? "10.0.16299.0" : "10.0.14316.0"
   */
  readonly minVersion?: string | null

  /**
   * Set the `MaxVersionTested` field in the appx manifest.xml
   * @default arch === Arch.arm64 ? "10.0.16299.0" : "10.0.14316.0"
   */
  readonly maxVersionTested?: string | null

  /** @private */
  readonly makeappxArgs?: Array<string> | null
}
