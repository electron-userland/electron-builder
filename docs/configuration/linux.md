The top-level [linux](configuration.md#Configuration-linux) key contains set of options instructing electron-builder on how it should build Linux targets. These options applicable for any Linux target.

<!-- do not edit. start of generated block -->
* <code id="LinuxConfiguration-target">target</code> = `AppImage` String | [TargetConfiguration](/cli#targetconfiguration) - Target package type: list of `AppImage`, `flatpak`, `snap`, `deb`, `rpm`, `freebsd`, `pacman`, `p5p`, `apk`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`.
    
    electron-builder [docker image](/multi-platform-build#docker) can be used to build Linux targets on any platform.
    
    Please [do not put an AppImage into another archive](https://github.com/probonopd/AppImageKit/wiki/Creating-AppImages#common-mistake) like a .zip or .tar.gz.

* <code id="LinuxConfiguration-maintainer">maintainer</code> String | "undefined" - The maintainer. Defaults to [author](/configuration/configuration#Metadata-author).
* <code id="LinuxConfiguration-vendor">vendor</code> String | "undefined" - The vendor. Defaults to [author](/configuration/configuration#Metadata-author).
* <code id="LinuxConfiguration-icon">icon</code> String - The path to icon set directory or one png file, relative to the [build resources](/configuration/configuration#MetadataDirectories-buildResources) or to the project directory. The icon filename must contain the size (e.g. 32x32.png) of the icon. By default will be generated automatically based on the macOS icns file.
* <code id="LinuxConfiguration-synopsis">synopsis</code> String | "undefined" - The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
* <code id="LinuxConfiguration-description">description</code> String | "undefined" - As [description](/configuration/configuration#Metadata-description) from application package.json, but allows you to specify different for Linux.
* <code id="LinuxConfiguration-category">category</code> String | "undefined" - The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).
* <code id="LinuxConfiguration-mimeTypes">mimeTypes</code> Array&lt;String&gt; | "undefined" - The mime types in addition to specified in the file associations. Use it if you don't want to register a new mime type, but reuse existing.
* <code id="LinuxConfiguration-desktop">desktop</code> any | "undefined" - The [Desktop file](https://developer.gnome.org/documentation/guidelines/maintainer/integrating.html#desktop-files) entries (name to value).
* <code id="LinuxConfiguration-executableArgs">executableArgs</code> Array&lt;String&gt; | "undefined" - The executable parameters. Pass to executableName

<!-- end of generated block -->

---

{!includes/platform-specific-configuration-note.md!}

## Debian Package Options

The top-level [deb](configuration.md#Configuration-deb) key contains set of options instructing electron-builder on how it should build Debian package.

{!generated/DebOptions.md!}

All [LinuxTargetSpecificOptions](linux.md#linuxtargetspecificoptions-apk-freebsd-pacman-p5p-and-rpm-options) can be also specified in the `deb` to customize Debian package. 

## `LinuxTargetSpecificOptions` APK, FreeBSD, Pacman, P5P and RPM Options
<a name="LinuxTargetSpecificOptions"></a>

The top-level `apk`, `freebsd`, `pacman`, `p5p` and `rpm` keys contains set of options instructing electron-builder on how it should build corresponding Linux target.

{!generated/LinuxTargetSpecificOptions.md!}
