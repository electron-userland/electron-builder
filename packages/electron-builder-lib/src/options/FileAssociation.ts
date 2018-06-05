/**
 * File associations.
 *
 * macOS (corresponds to [CFBundleDocumentTypes](https://developer.apple.com/library/content/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-101685)) and NSIS only.
 *
 * On Windows works only if [nsis.perMachine](https://electron.build/configuration/configuration#NsisOptions-perMachine) is set to `true`.
 */
export interface FileAssociation {
  /**
   * The extension (minus the leading period). e.g. `png`.
   */
  readonly ext: string | Array<string>

  /**
   * The name. e.g. `PNG`. Defaults to `ext`.
   */
  readonly name?: string | null

  /**
   * *windows-only.* The description.
   */
  readonly description?: string | null

  /**
   * *linux-only.* The mime-type.
   */
  readonly mimeType?: string | null

  /**
   * The path to icon (`.icns` for MacOS and `.ico` for Windows), relative to `build` (build resources directory). Defaults to `${firstExt}.icns`/`${firstExt}.ico` (if several extensions specified, first is used) or to application icon.
   *
   * Not supported on Linux, file issue if need (default icon will be `x-office-document`).
   */
  readonly icon?: string | null

  /**
   * *macOS-only* The app’s role with respect to the type. The value can be `Editor`, `Viewer`, `Shell`, or `None`. Corresponds to `CFBundleTypeRole`.
   * @default Editor
   */
  readonly role?: string

  /**
   * *macOS-only* Whether the document is distributed as a bundle. If set to true, the bundle directory is treated as a file. Corresponds to `LSTypeIsPackage`.
   */
  readonly isPackage?: boolean
}
