import { TargetSpecificOptions } from "../core"

// noinspection SpellCheckingInspection
export type BackgroundAlignment = "center" | "left" | "right" | "top" | "bottom" | "topleft" | "topright" | "bottomleft" | "bottomright"
// noinspection SpellCheckingInspection
export type BackgroundScaling = "tofit" | "none" | "proportional"

/**
 * macOS product archive options.
 */
export interface PkgOptions extends TargetSpecificOptions {
  /**
   * The scripts directory, relative to `build` (build resources directory).
   * The scripts can be in any language so long as the files are marked executable and have the appropriate shebang indicating the path to the interpreter.
   * Scripts are required to be executable (`chmod +x file`).
   * @default build/pkg-scripts
   * @see [Scripting in installer packages](http://macinstallers.blogspot.de/2012/07/scripting-in-installer-packages.html).
   */
  readonly scripts?: string | null

  /**
   * should be not documented, only to experiment
   * @private
   */
  readonly productbuild?: Array<string> | null

  /**
   * The install location. [Do not use it](https://stackoverflow.com/questions/12863944/how-do-you-specify-a-default-install-location-to-home-with-pkgbuild) to create per-user package.
   * Mostly never you will need to change this option. `/Applications` would install it as expected into `/Applications` if the local system domain is chosen, or into `$HOME/Applications` if the home installation is chosen.
   * @default /Applications
   */
  readonly installLocation?: string | null

  /**
   * Whether can be installed at the root of any volume, including non-system volumes. Otherwise, it cannot be installed at the root of a volume.
   *
   * Corresponds to [enable_anywhere](https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW70).
   * @default true
   */
  readonly allowAnywhere?: boolean | null

  /**
   * Whether can be installed into the current user’s home directory.
   * A home directory installation is done as the current user (not as root), and it cannot write outside of the home directory.
   * If the product cannot be installed in the user’s home directory and be not completely functional from user’s home directory.
   *
   * Corresponds to [enable_currentUserHome](https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW70).
   * @default true
   */
  readonly allowCurrentUserHome?: boolean | null

  /**
   * Whether can be installed into the root directory. Should usually be `true` unless the product can be installed only to the user’s home directory.
   *
   * Corresponds to [enable_localSystem](https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW70).
   * @default true
   */
  readonly allowRootDirectory?: boolean | null

  /**
   * The name of certificate to use when signing. Consider using environment variables [CSC_LINK or CSC_NAME](/code-signing) instead of specifying this option.
   */
  readonly identity?: string | null

  /**
   * The path to EULA license file. Defaults to `license.txt` or `eula.txt` (or uppercase variants). In addition to `txt, `rtf` and `html` supported (don't forget to use `target="_blank"` for links).
   */
  readonly license?: string | null

  /**
   * Options for the background image for the installer.
   */
  readonly background?: PkgBackgroundOptions | null

  /**
   * The path to the welcome file. This may be used to customize the text on the Introduction page of the installer.
   */
  readonly welcome?: string | null

  /**
   * The path to the conclusion file. This may be used to customize the text on the final "Summary" page of the installer.
   */
  readonly conclusion?: string | null

  /**
   * Install bundle over previous version if moved by user?
   * @default true
   */
  readonly isRelocatable?: boolean | null

  /**
   * Don't install bundle if newer version on disk?
   * @default true
   */
  readonly isVersionChecked?: boolean | null

  /**
   * Require identical bundle identifiers at install path?
   * @default true
   */
  readonly hasStrictIdentifier?: boolean | null

  /**
   * Specifies how an existing version of the bundle on disk should be handled when the version in
   * the package is installed.
   *
   * If you specify upgrade, the bundle in the package atomi-cally replaces any version on disk;
   * this has the effect of deleting old paths that no longer exist in the new version of
   * the bundle.
   *
   * If you specify update, the bundle in the package overwrites the version on disk, and any files
   * not contained in the package will be left intact; this is appropriate when you are delivering
   * an update-only package.
   *
   * Another effect of update is that the package bundle will not be installed at all if there is
   * not already a version on disk; this allows a package to deliver an update for an app that
   * the user might have deleted.
   *
   * @default upgrade
   */
  readonly overwriteAction?: "upgrade" | "update" | null
}

/**
 * Options for the background image in a PKG installer
 */
export interface PkgBackgroundOptions {
  /**
   * Path to the image to use as an installer background.
   */
  file?: string

  /**
   * Alignment of the background image.
   * Options are: center, left, right, top, bottom, topleft, topright, bottomleft, bottomright
   * @default center
   */
  alignment?: BackgroundAlignment | null

  /**
   * Scaling of the background image.
   * Options are: tofit, none, proportional
   * @default tofit
   */
  scaling?: BackgroundScaling | null
}