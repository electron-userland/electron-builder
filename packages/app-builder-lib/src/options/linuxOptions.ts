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

  /**
   * The executable parameters. Pass to executableName
   */
  readonly executableArgs?: Array<string> | null
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

  /**
   * The name of the package.
   */
  readonly packageName?: string | null

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
   * If need to support Debian, `libappindicator1` should be removed, it is [deprecated in Debian](https://bugs.debian.org/cgi-bin/bugreport.cgi?bug=895037).
   * If need to support KDE, `gconf2` and `gconf-service` should be removed as it's no longer used by GNOME](https://packages.debian.org/bullseye/gconf2).
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

export interface FlatpakOptions extends CommonLinuxOptions, TargetSpecificOptions {
  /**
   * The path to EULA license file. Defaults to `license.txt` or `eula.txt` (or uppercase variants). Only plain text is supported.
   */
  readonly license?: string | null

  /**
   * The name of the runtime that the application uses. Defaults to `org.freedesktop.Platform`.
   *
   * See [flatpak manifest documentation](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html#flatpak-manifest).
   */
  readonly runtime?: string

  /**
   * The version of the runtime that the application uses. Defaults to `20.08`.
   *
   * See [flatpak manifest documentation](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html#flatpak-manifest).
   */
  readonly runtimeVersion?: string

  /**
   * The name of the development runtime that the application builds with. Defaults to `org.freedesktop.Sdk`.
   *
   * See [flatpak manifest documentation](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html#flatpak-manifest).
   */
  readonly sdk?: string

  /**
   * Start with the files from the specified application. This can be used to create applications that extend another application.
   * Defaults to [org.electronjs.Electron2.BaseApp](https://github.com/flathub/org.electronjs.Electron2.BaseApp).
   *
   * See [flatpak manifest documentation](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html#flatpak-manifest).
   */
  readonly base?: string

  /**
   * Use this specific version of the application specified in base. Defaults to `20.08`.
   *
   * See [flatpak manifest documentation](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html#flatpak-manifest).
   */
  readonly baseVersion?: string

  /**
   * The branch to use when exporting the application. Defaults to `master`.
   *
   * See [flatpak manifest documentation](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html#flatpak-manifest).
   */
  readonly branch?: string

  /**
   * An array of arguments passed to the flatpak build-finish command. Defaults to:
   * ```json
   * [
   *   // Wayland/X11 Rendering
   *   "--socket=wayland",
   *   "--socket=x11",
   *   "--share=ipc",
   *   // Open GL
   *   "--device=dri",
   *   // Audio output
   *   "--socket=pulseaudio",
   *   // Read/write home directory access
   *   "--filesystem=home",
   *   // Allow communication with network
   *   "--share=network",
   *   // System notifications with libnotify
   *   "--talk-name=org.freedesktop.Notifications",
   * ]
   * ```
   *
   * See [flatpak manifest documentation](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html#flatpak-manifest).
   */
  readonly finishArgs?: string[]

  /**
   * An array of objects specifying the modules to be built in order.
   *
   * See [flatpak manifest documentation](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html#flatpak-manifest).
   */
  readonly modules?: (string | any)[]

  /**
   * Files to copy directly into the app. Should be a list of [source, dest] tuples. Source should be a relative/absolute path to a file/directory to copy into the flatpak, and dest should be the path inside the app install prefix (e.g. /share/applications/).
   *
   * See [@malept/flatpak-bundler documentation](https://github.com/malept/flatpak-bundler#build-options).
   */
  readonly files?: [string, string][]

  /**
   * Symlinks to create in the app files. Should be a list of [target, location] symlink tuples. Target can be either a relative or absolute path inside the app install prefix, and location should be a absolute path inside the prefix to create the symlink at.
   *
   * See [@malept/flatpak-bundler documentation](https://github.com/malept/flatpak-bundler#build-options).
   */
  readonly symlinks?: [string, string][]

  /**
   * Whether to enable the Wayland specific flags (`--enable-features=UseOzonePlatform --ozone-platform=wayland`) in the wrapper script. These flags are only available starting with Electron version 12. Defaults to `false`.
   */
  readonly useWaylandFlags?: boolean
}
