import { TargetConfigType } from "electron-builder-core"
import { PlatformSpecificBuildOptions } from "../metadata"

/**
 * Linux Options
 */
export interface LinuxBuildOptions extends PlatformSpecificBuildOptions {
  /**
   * The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).
   */
  readonly category?: string | null

  /**
   * The [package category](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Section). Not applicable for AppImage.
   */
  readonly packageCategory?: string | null

  /**
   * As [description](#AppMetadata-description) from application package.json, but allows you to specify different for Linux.
   */
  readonly description?: string | null

  /**
   * Target package type: list of `AppImage`, `snap`, `deb`, `rpm`, `freebsd`, `pacman`, `p5p`, `apk`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`. Defaults to `AppImage`.
   * 
   * electron-builder [docker image](https://github.com/electron-userland/electron-builder/wiki/Docker) can be used to build Linux targets on any platform. See [Multi platform build](https://github.com/electron-userland/electron-builder/wiki/Multi-Platform-Build).
   */
  readonly target?: TargetConfigType

  /**
   * The maintainer. Defaults to [author](#AppMetadata-author).
   */
  readonly maintainer?: string | null

  /**
   * The vendor. Defaults to [author](#AppMetadata-author).
   */
  readonly vendor?: string | null

  /**
   * @private should be not documented, only to experiment
   */
  readonly fpm?: Array<string> | null

  /**
   * The [Desktop file](https://developer.gnome.org/integration-guide/stable/desktop-files.html.en) entries (name to value).
   */
  readonly desktop?: { [key: string]: string; } | null

  readonly afterInstall?: string | null
  readonly afterRemove?: string | null

  /**
   * Package dependencies. Defaults to `["gconf2", "gconf-service", "libnotify4", "libappindicator1", "libxtst6", "libnss3"]` for `deb`.
   */
  readonly depends?: string[] | null

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

/**
 * Debian Package Specific Options
 */
export interface DebOptions extends LinuxBuildOptions {
  /**
   * The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
   */
  readonly synopsis?: string | null

  /**
   * The compression type.
   * @default xz
   */
  readonly compression?: "gz" | "bzip2" | "xz" | null

  /**
   * The [Priority](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Priority) attribute.
   */
  readonly priority?: string | null
}

/**
 * [Snap](http://snapcraft.io) Options
 */
export interface SnapOptions extends LinuxBuildOptions {
  /**
   * The type of [confinement](https://snapcraft.io/docs/reference/confinement) supported by the snap.
   * @default strict
   */
  readonly confinement?: "devmode" | "strict" | "classic" | null

  /**
   * The 78 character long summary. Defaults to [productName](#AppMetadata-productName).
   */
  readonly summary?: string | null

  /**
   * The quality grade of the snap. It can be either `devel` (i.e. a development version of the snap, so not to be published to the “stable” or “candidate” channels) or “stable” (i.e. a stable release or release candidate, which can be released to all channels).
   * @default stable
   */
  readonly grade?: "devel" | "stable" | null

  /**
   * The list of features that must be supported by the core in order for this snap to install.
   */
  readonly assumes?: Array<string> | null

  /**
   * The list of Ubuntu packages to use that are needed to support the `app` part creation. Like `depends` for `deb`.
   * Defaults to `["libnotify4", "libappindicator1", "libxtst6", "libnss3", "libxss1", "fontconfig-config", "gconf2", "libasound2", "pulseaudio"]`.
   * 
   * If list contains `default`, it will be replaced to default list, so, `["default", "foo"]` can be used to add custom package `foo` in addition to defaults.
   */
  readonly stagePackages?: Array<string> | null

  /**
   * The list of [plugs](https://snapcraft.io/docs/reference/interfaces).
   * Defaults to `["home", "x11", "unity7", "browser-support", "network", "gsettings", "pulseaudio", "opengl"]`.
   * 
   * If list contains `default`, it will be replaced to default list, so, `["default", "foo"]` can be used to add custom plug `foo` in addition to defaults.
   */
  readonly plugs?: Array<string> | null

  /**
   * Specify `ubuntu-app-platform1` to use [ubuntu-app-platform](https://insights.ubuntu.com/2016/11/17/how-to-create-snap-packages-on-qt-applications/).
   * Snap size will be greatly reduced, but it is not recommended for now because "the snaps must be connected before running uitk-gallery for the first time".
   */
  readonly ubuntuAppPlatformContent?: string | null
}