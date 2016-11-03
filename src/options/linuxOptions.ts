import { PlatformSpecificBuildOptions } from "../metadata"

/*
 ### `.build.linux`

 Linux specific build options.
 */
export interface LinuxBuildOptions extends PlatformSpecificBuildOptions {
  /*
   The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).
   */
  readonly category?: string | null

  /*
  The [package category](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Section). Not applicable for AppImage.
   */
  readonly packageCategory?: string | null

  /*
   As [description](#AppMetadata-description) from application package.json, but allows you to specify different for Linux.
   */
  readonly description?: string | null

  /*
   Target package type: list of `AppImage`, `deb`, `rpm`, `freebsd`, `pacman`, `p5p`, `apk`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`. Defaults to `AppImage`.

   The most effective [xz](https://en.wikipedia.org/wiki/Xz) compression format used by default.

   Only `deb` and `AppImage` is tested. Feel free to file issues for `rpm` and other package formats.
   */
  readonly target?: Array<string> | null

  /*
   *deb-only.* The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
   */
  readonly synopsis?: string | null

  /*
   The maintainer. Defaults to [author](#AppMetadata-author).
   */
  readonly maintainer?: string | null

  /*
   The vendor. Defaults to [author](#AppMetadata-author).
   */
  readonly vendor?: string | null

  // should be not documented, only to experiment
  readonly fpm?: Array<string> | null

  /**
   The [Desktop file](https://developer.gnome.org/integration-guide/stable/desktop-files.html.en) entries.
   */
  readonly desktop?: { [key: string]: string; } | null

  readonly afterInstall?: string | null
  readonly afterRemove?: string | null

  /*
  *deb-only.* The compression type, one of `gz`, `bzip2`, `xz`. Defaults to `xz`.
   */
  readonly compression?: string | null

  /*
   Package dependencies. Defaults to `["libappindicator1", "libnotify-bin"]`.
   */
  readonly depends?: string[] | null

  /*
   The executable name. Defaults to `productName`.

   Cannot be specified per target, allowed only in the `.build.linux`.
   */
  readonly executableName?: string | null
}
