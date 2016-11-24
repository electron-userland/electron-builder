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
   Target package type: list of `AppImage`, `snap`, `deb`, `rpm`, `freebsd`, `pacman`, `p5p`, `apk`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`. Defaults to `AppImage`.

   The most effective [xz](https://en.wikipedia.org/wiki/Xz) compression format used by default.
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
   The [Desktop file](https://developer.gnome.org/integration-guide/stable/desktop-files.html.en) entries (name to value).
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

export interface SnapOptions extends LinuxBuildOptions {
  /*
  The type of confinement supported by the snap. Can be either `devmode` (i.e. this snap doesn’t support running under confinement) or `strict` (i.e. full confinement supported via interfaces).
   */
  confinement?: "devmode" | "strict" | null

  /*
  The 78 character long summary. Defaults to [productName](#AppMetadata-productName).
   */
  summary?: string | null

  /*
  The quality grade of the snap. It can be either `devel` (i.e. a development version of the snap, so not to be published to the “stable” or “candidate” channels) or “stable” (i.e. a stable release or release candidate, which can be released to all channels).
  Defaults to `stable`.
   */
  grade?: "devel" | "stable" | null

  /*
  The list of features that must be supported by the core in order for this snap to install.
   */
  assumes?: Array<string> | null
}