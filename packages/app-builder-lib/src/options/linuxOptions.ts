import { PlatformSpecificBuildOptions, TargetConfigType, TargetSpecificOptions } from "../index"

/**
 * Example Spec: https://specifications.freedesktop.org/desktop-entry-spec/latest/example.html
 */
export interface LinuxDesktopFile {
  /**
   * `[Desktop Entry]` metadata entries (name to value). Overwrites default values calculated by electron-builder
   */
  entry?: {
    [k: string]: string
  } | null
  /**
   * `[Desktop Actions <ActionName>]` metadata entries (name to value).
   *
   * Config Example:
   * ```js
   * desktopActions: {
   *    NewWindow: {
   *       Name: 'New Window',
   *       Exec: 'app --new-window',
   *    }
   * }
   * ```
   */
  desktopActions?: {
    [ActionName: string]: any
  } | null
}

export interface LinuxConfiguration extends CommonLinuxOptions, PlatformSpecificBuildOptions {
  /**
   * Target package type: list of `AppImage`, `flatpak`, `snap`, `deb`, `rpm`, `freebsd`, `pacman`, `p5p`, `apk`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`.
   *
   * electron-builder [docker image](https://www.electron.build/multi-platform-build#docker) can be used to build Linux targets on any platform.
   *
   * Please [do not put an AppImage into another archive](https://github.com/probonopd/AppImageKit/wiki/Creating-AppImages#common-mistake) like a .zip or .tar.gz.
   * @default AppImage
   */
  readonly target?: TargetConfigType

  /**
   * The maintainer. Defaults to [author](https://www.electron.build/configuration#author).
   */
  readonly maintainer?: string | null

  /**
   * The vendor. Defaults to [author](https://www.electron.build/configuration#author).
   */
  readonly vendor?: string | null

  /**
   * The path to icon set directory or one png file, relative to the [build resources](https://www.electron.build/contents#extraresources) or to the project directory. The icon filename must contain the size (e.g. 32x32.png) of the icon.
   * By default will be generated automatically based on the macOS icns file.
   */
  readonly icon?: string

  /**
   * @private
   * @internal Allows specifying an FPM-only package category for all FPM targets in one place.
   * For user-facing category configuration use the target-specific options (e.g. {@link DebOptions}).
   */
  readonly packageCategory?: string | null

  /**
   * When `true`, the installed `.desktop` filename is derived from `desktopName` in `package.json`
   * (minus the `.desktop` suffix) so that it matches `StartupWMClass` and Electron's `app_id`.
   * Falls back to `executableName` when `desktopName` is absent.
   *
   * @default false
   * @see https://github.com/electron-userland/electron-builder/issues/9103
   * @remarks Will become the default behavior in v27 and this option will be removed in v27 as well to align with electron upstream and common Linux desktop application practices. If you rely on the current default behavior, set this option to `false` explicitly to silence the warning.
   */
  readonly syncDesktopName?: boolean
}

/**
 * Desktop-entry and runtime fields shared by all Linux targets and all snap core strategies.
 *
 * Fields set under `linux.*` in your build config (i.e. on {@link LinuxConfiguration}) are
 * automatically cascaded into each snap core's options by `LinuxTargetHelper.getSnapCore()`.
 * You do not need to duplicate them under `snapcraft.core24.*`, `snapcraft.core22.*`, etc.
 * Per-core values always take precedence when both are set.
 */
export interface CommonLinuxOptions {
  /**
   * The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
   */
  readonly synopsis?: string | null

  /**
   * As [description](https://www.electron.build/configuration#description) from application package.json, but allows you to specify different for Linux.
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
   * The [Desktop file](https://developer.gnome.org/documentation/guidelines/maintainer/integrating.html#desktop-files)
   */
  readonly desktop?: LinuxDesktopFile | null

  /**
   * The executable parameters. Pass to executableName
   */
  readonly executableArgs?: Array<string> | null
}

// fpm-only specific options
export interface LinuxTargetSpecificOptions extends CommonLinuxOptions, TargetSpecificOptions {
  /**
   * Package dependencies.
   * `rpm` defaults to `["gtk3", "libnotify", "nss", "libXScrnSaver", "(libXtst or libXtst6)", "xdg-utils", "at-spi2-core", "(libuuid or libuuid1)"]`
   * `pacman` defaults to `["c-ares", "ffmpeg", "gtk3", "http-parser", "libevent", "libvpx", "libxslt", "libxss", "minizip", "nss", "re2", "snappy", "libnotify", "libappindicator-gtk3"]`
   */
  readonly depends?: Array<string> | null

  /**
   * The compression type passed to fpm. For `deb`, `rpm`, and `pacman` targets prefer the
   * typed per-format interfaces (`DebOptions`, `RpmOptions`, `PacmanOptions`) which narrow
   * this to only the values that fpm actually accepts for that format.
   * @default xz
   */
  readonly compression?: "gz" | "bzip2" | "xz" | "xzmt" | "gzip" | "zst" | "zstd" | null

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

  /**
   * File path to script to be passed to FPM for `--after-install` arg.
   */
  readonly afterInstall?: string | null
  /**
   * File path to script to be passed to FPM for `--after-remove` arg.
   */
  readonly afterRemove?: string | null
  /**
   * File path to custom AppArmor profile (Ubuntu 24+)
   */
  readonly appArmorProfile?: string | null

  /**
   * *Advanced only* The [fpm](https://fpm.readthedocs.io/en/latest/cli-reference.html) options.
   *
   * Example: `["--before-install=build/deb-preinstall.sh", "--after-upgrade=build/deb-postinstall.sh"]`
   */
  readonly fpm?: Array<string> | null
}
export interface DebOptions extends LinuxTargetSpecificOptions {
  /**
   * Package dependencies.
   * If need to support Debian, `libappindicator1` should be removed, it is [deprecated in Debian](https://bugs.debian.org/cgi-bin/bugreport.cgi?bug=895037).
   * If need to support KDE, `gconf2` and `gconf-service` should be removed as it's no longer used [by GNOME](https://packages.debian.org/bullseye/gconf2).
   * @default ["libgtk-3-0", "libnotify4", "libnss3", "libxss1", "libxtst6", "xdg-utils", "libatspi2.0-0", "libuuid1", "libsecret-1-0"]
   */
  readonly depends?: Array<string> | null

  /**
   * The [recommended package dependencies](https://www.debian.org/doc/debian-policy/ch-relationships.html#s-binarydeps).
   * @default ["libappindicator3-1"]
   */
  readonly recommends?: Array<string> | null

  /**
   * The [package category](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Section).
   */
  readonly packageCategory?: string | null

  /**
   * The [Priority](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Priority) attribute.
   */
  readonly priority?: string | null

  /** @default xz */
  readonly compression?: "gz" | "bzip2" | "xz" | "zst" | null
}

export interface RpmOptions extends LinuxTargetSpecificOptions {
  /**
   * Passed to fpm via `--rpm-compression`. `"xzmt"` uses multi-threaded xz (fpm's RPM default).
   * `"xz"` is automatically promoted to `"xzmt"`. `"gzip"` and `"bzip2"` pass through as-is.
   * @default xzmt
   */
  readonly compression?: "xz" | "xzmt" | "gzip" | "bzip2" | null
}

export interface PacmanOptions extends LinuxTargetSpecificOptions {
  /** @default xz */
  readonly compression?: "gz" | "bzip2" | "xz" | "zstd" | null
}

export interface AppImageOptions extends CommonLinuxOptions, TargetSpecificOptions {
  /**
   * The path to EULA license file. Defaults to `license.txt` or `eula.txt` (or uppercase variants). Only plain text is supported.
   */
  readonly license?: string | null
  /**
   * The compression algorithm passed to the AppImage build tool.
   *
   * **FUSE2 toolset (`"0.0.0"` or unset):** only `"xz"` and `"gzip"` are forwarded
   * to mksquashfs (`-comp <value>`); `"xz"` additionally passes `-Xdict-size 100% -b 1048576`.
   * `"zstd"`, `null`, and unset fall through to the root-level `compression` option:
   * - `"maximum"` → `"xz"`
   * - anything else → flag omitted (mksquashfs defaults to gzip)
   *
   * **Static-runtime toolsets (`>= 1.0.0`):** `"gzip"` and `"zstd"` are forwarded
   * directly. `"xz"` is mapped to `"zstd"` (nearest supported equivalent). `null`
   * or unset falls through to the root-level `compression` option:
   * - `"store"` → `"gzip"`
   * - `"normal"` / `"maximum"` / unset → `"zstd"`
   */
  readonly compression?: "gzip" | "xz" | "zstd" | null
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
