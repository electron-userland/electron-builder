import { TargetSpecificOptions } from "../core.js"

/**
 * Package identity and manifest options shared by the `appx` and `msix` targets, which both pack the app with makeappx.exe.
 * Each target reads only its own section (merged over `win`): `appx` values do not apply to `msix`, and the other way round.
 */
export interface CommonAppxOptions extends TargetSpecificOptions {
  /**
   * The application id (`Application/@Id`): alpha-numeric fields separated by periods, each beginning with an ASCII letter.
   * Defaults to `identityName`, else the application name.
   */
  readonly applicationId?: string

  /**
   * The background color of the app tile. See [Visual Elements](https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-uap-visualelements).
   * @default #464646
   */
  readonly backgroundColor?: string | null

  /**
   * The name displayed to users ([Properties.DisplayName](https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-displayname)).
   * Defaults to the application product name.
   */
  readonly displayName?: string | null

  /**
   * The package name ([Identity.Name](https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-identity)).
   * Defaults to the [application name](https://www.electron.build/configuration#metadata).
   */
  readonly identityName?: string | null

  /**
   * The package publisher (`Identity/@Publisher`). It must match the subject of the signing certificate exactly. Defaults to that
   * subject (`CN=ms` for an unsigned build, such as one for the Store); with `win.sign.type: "azure"`, `win.sign.publisherName` is used.
   */
  readonly publisher?: string | null

  /**
   * The publisher name displayed to users ([Properties.PublisherDisplayName](https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-publisherdisplayname)).
   * Defaults to the company name (the `author` in package.json); the build fails when neither is set.
   */
  readonly publisherDisplayName?: string | null

  /**
   * The [supported languages](https://learn.microsoft.com/en-us/windows/uwp/globalizing/manage-language-and-region#specify-the-supported-languages-in-the-apps-manifest)
   * listed in the Windows Store. The first entry is the default language.
   * @default ["en-US"]
   */
  readonly languages?: Array<string> | string | null

  /**
   * Whether to add the auto launch extension. Defaults to `true` when [electron-winstore-auto-launch](https://github.com/felixrieseberg/electron-winstore-auto-launch) is a dependency.
   */
  readonly addAutoLaunchExtension?: boolean

  /**
   * Path, relative to the app directory, of an XML file whose content is added to the manifest's extensions.
   */
  readonly customExtensionsPath?: string

  /**
   * The [capabilities](https://learn.microsoft.com/en-us/windows/uwp/packaging/app-capability-declarations) to declare in the manifest,
   * e.g. `["privateNetworkClientServer", "webcam"]`. `runFullTrust`, which Electron apps need, is always added.
   */
  readonly capabilities?: Array<string> | null

  /**
   * (Advanced) Path to a custom `AppxManifest.xml` template (any file name), looked up in the build resources directory, then the project
   * directory. Supports the template macros of the default template:
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
   *
   * The `msix` target also supports `${packageIntegrity}`, and adds its `windowsServices` to `${extensions}`.
   */
  readonly customManifestPath?: string

  /**
   * Whether to overlay the app's name on its tile images on the Start screen ([showNameOnTiles](https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-uap-shownameontiles)).
   * @default false
   */
  readonly showNameOnTiles?: boolean

  /**
   * Whether the fourth component of the package version is the build number instead of 0. See https://github.com/electron-userland/electron-builder/issues/3875
   * @default false
   */
  readonly setBuildNumber?: boolean

  /** @private */
  readonly makeappxArgs?: Array<string> | null
}

export interface AppXOptions extends CommonAppxOptions {
  /**
   * The manifest's `TargetDeviceFamily/@MinVersion`. Defaults to `10.0.16299.0` for arm64 and `10.0.14316.0` otherwise.
   */
  readonly minVersion?: string | null

  /**
   * The manifest's `TargetDeviceFamily/@MaxVersionTested`. Defaults to `minVersion`, else to its default.
   */
  readonly maxVersionTested?: string | null

  /**
   * @private
   * @default false
   */
  readonly electronUpdaterAware?: boolean
}
