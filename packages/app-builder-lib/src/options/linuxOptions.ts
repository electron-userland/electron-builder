import { PlatformSpecificBuildOptions, TargetConfigType, TargetSpecificOptions } from "../index"

export interface LinuxConfiguration extends CommonLinuxOptions, PlatformSpecificBuildOptions {
  /**
   * Target package type: list of `AppImage`, `snap`, `deb`, `rpm`, `freebsd`, `pacman`, `p5p`, `apk`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`.
   *
   * electron-builder [docker image](/multi-platform-build#docker) can be used to build Linux targets on any platform.
   *
   * Please [do not put an AppImage into another archive](https://github.com/probonopd/AppImageKit/wiki/Creating-AppImages#common-mistake) like a .zip or .tar.gz.
   * @default AppImage
   */
  readonly target?: TargetConfigType

  /**
   * The maintainer. Defaults to [author](/configuration/configuration#Metadata-author).
   */
  readonly maintainer?: string | null

  /**
   * The vendor. Defaults to [author](/configuration/configuration#Metadata-author).
   */
  readonly vendor?: string | null

  /**
   * The executable name. Defaults to `productName`.
   * Cannot be specified per target, allowed only in the `linux`.
   */
  readonly executableName?: string | null

  /**
   * The path to icon set directory or one png file, relative to the [build resources](/configuration/configuration#MetadataDirectories-buildResources) or to the project directory. The icon filename must contain the size (e.g. 32x32.png) of the icon.
   * By default will be generated automatically based on the macOS icns file.
   */
  readonly icon?: string

  /**
   * backward compatibility + to allow specify fpm-only category for all possible fpm targets in one place
   * @private
   */
  readonly packageCategory?: string | null
}

export interface CommonLinuxOptions {
  /**
   * The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
   */
  readonly synopsis?: string | null

  /**
   * As [description](/configuration/configuration#Metadata-description) from application package.json, but allows you to specify different for Linux.
   */
  readonly description?: string | null

  /**
   * The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).
   */
  readonly category?: string | null

  /**
   * The mime types in addition to specified in the file associations. Use it if you don't want to register a new mime type, but reuse existing.
   */
  readonly mimeTypes?: Array<string> | null

  /**
   * The [Desktop file](https://developer.gnome.org/integration-guide/stable/desktop-files.html.en) entries (name to value).
   */
  readonly desktop?: any | null
}

// fpm-only specific options
export interface LinuxTargetSpecificOptions extends CommonLinuxOptions, TargetSpecificOptions {
  /**
   * Package dependencies.
   */
  readonly depends?: Array<string> | null

  /**
   * The compression type.
   * @default xz
   */
  readonly compression?: "gz" | "bzip2" | "xz" | null

  readonly icon?: string

  /**
   * The package category.
   */
  readonly packageCategory?: string | null

  readonly vendor?: string | null
  readonly maintainer?: string | null

  readonly afterInstall?: string | null
  readonly afterRemove?: string | null

  /**
   * *Advanced only* The [fpm](https://github.com/jordansissel/fpm/wiki#usage) options.
   *
   * Example: `["--before-install=build/deb-preinstall.sh", "--after-upgrade=build/deb-postinstall.sh"]`
   */
  readonly fpm?: Array<string> | null
}

export interface DebOptions extends LinuxTargetSpecificOptions {
  /**
   * Package dependencies. Defaults to `["gconf2", "gconf-service", "libnotify4", "libappindicator1", "libxtst6", "libnss3"]`.
   */
  readonly depends?: Array<string> | null

  /**
   * The [package category](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Section).
   */
  readonly packageCategory?: string | null

  /**
   * The [Priority](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Priority) attribute.
   */
  readonly priority?: string | null
}

export interface AppImageOptions extends CommonLinuxOptions, TargetSpecificOptions {
  /**
   * The path to EULA license file. Defaults to `license.txt` or `eula.txt` (or uppercase variants). Only plain text is supported.
   */
  readonly license?: string | null
}