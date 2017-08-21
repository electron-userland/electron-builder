import { TargetConfigType, TargetSpecificOptions } from "../core"
import { PlatformSpecificBuildOptions } from "../metadata"

export interface LinuxBuildOptions extends CommonLinuxOptions, PlatformSpecificBuildOptions {
  /**
   * Target package type: list of `AppImage`, `snap`, `deb`, `rpm`, `freebsd`, `pacman`, `p5p`, `apk`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`.
   *
   * electron-builder [docker image](https://github.com/electron-userland/electron-builder/wiki/Docker) can be used to build Linux targets on any platform. See [Multi platform build](https://github.com/electron-userland/electron-builder/wiki/Multi-Platform-Build).
   *
   * @see [Please do not put an AppImage into another archive like a .zip or .tar.gz](https://github.com/probonopd/AppImageKit/wiki/Creating-AppImages#common-mistake)
   * @default AppImage
   */
  readonly target?: TargetConfigType

  /**
   * The maintainer. Defaults to [author](#Metadata-author).
   */
  readonly maintainer?: string | null

  /**
   * The vendor. Defaults to [author](#Metadata-author).
   */
  readonly vendor?: string | null

  /**
   * @deprecated
   * @private
   */
  readonly depends?: Array<string> | null

  /**
   * The executable name. Defaults to `productName`.
   * Cannot be specified per target, allowed only in the `linux`.
   */
  readonly executableName?: string | null

  /**
   * The path to icon set directory, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory. The icon filename must contain the size (e.g. 32x32.png) of the icon.
   * By default will be generated automatically based on the macOS icns file.
   */
  readonly icon?: string
}

export interface CommonLinuxOptions {
  /**
   * The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
   */
  readonly synopsis?: string | null

  /**
   * As [description](#Metadata-description) from application package.json, but allows you to specify different for Linux.
   */
  readonly description?: string | null

  /**
   * The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).
   */
  readonly category?: string | null

  /**
   * The [Desktop file](https://developer.gnome.org/integration-guide/stable/desktop-files.html.en) entries (name to value).
   */
  readonly desktop?: any | null
}

export interface LinuxTargetSpecificOptions extends CommonLinuxOptions, TargetSpecificOptions {
  /**
   * Package dependencies.
   */
  readonly depends?: Array<string> | null

  readonly icon?: string

  /**
   * The [package category](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Section). Not applicable for AppImage.
   */
  readonly packageCategory?: string | null

  readonly vendor?: string | null
  readonly maintainer?: string | null

  readonly afterInstall?: string | null
  readonly afterRemove?: string | null

  /**
   * should be not documented, only to experiment
   * @private
   */
  readonly fpm?: Array<string> | null
}

export interface DebOptions extends LinuxTargetSpecificOptions {
  /**
   * The compression type.
   * @default xz
   */
  readonly compression?: "gz" | "bzip2" | "xz" | null

  /**
   * The [Priority](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Priority) attribute.
   */
  readonly priority?: string | null

  /**
   * Package dependencies. Defaults to `["gconf2", "gconf-service", "libnotify4", "libappindicator1", "libxtst6", "libnss3"]`.
   */
  readonly depends?: Array<string> | null
}

export interface AppImageOptions extends CommonLinuxOptions, TargetSpecificOptions {
  /**
   * The system integration installation.
   * @default ask
   */
  readonly systemIntegration?: "ask" | "doNotAsk",
}