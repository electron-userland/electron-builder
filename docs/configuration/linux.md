The top-level [linux](configuration.md#Configuration-linux) key contains set of options instructing electron-builder on how it should build Linux targets. These options applicable for any Linux target.

<!-- do not edit. start of generated block -->
* <code id="LinuxConfiguration-target">target</code> = `AppImage` String | [TargetConfiguration](/configuration/target.md#targetconfiguration) - Target package type: list of `AppImage`, `snap`, `deb`, `rpm`, `freebsd`, `pacman`, `p5p`, `apk`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`.
  
  electron-builder [docker image](/multi-platform-build#docker) can be used to build Linux targets on any platform.
  
  Please [do not put an AppImage into another archive](https://github.com/probonopd/AppImageKit/wiki/Creating-AppImages#common-mistake) like a .zip or .tar.gz.
* <code id="LinuxConfiguration-maintainer">maintainer</code> String - The maintainer. Defaults to [author](/configuration/configuration.md#Metadata-author).
* <code id="LinuxConfiguration-vendor">vendor</code> String - The vendor. Defaults to [author](/configuration/configuration.md#Metadata-author).
* <code id="LinuxConfiguration-executableName">executableName</code> String - The executable name. Defaults to `productName`. Cannot be specified per target, allowed only in the `linux`.
* <code id="LinuxConfiguration-icon">icon</code> String - The path to icon set directory, relative to the [build resources](/configuration/configuration.md#MetadataDirectories-buildResources) or to the project directory. The icon filename must contain the size (e.g. 32x32.png) of the icon. By default will be generated automatically based on the macOS icns file.
* <code id="LinuxConfiguration-synopsis">synopsis</code> String - The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
* <code id="LinuxConfiguration-description">description</code> String - As [description](/configuration/configuration.md#Metadata-description) from application package.json, but allows you to specify different for Linux.
* <code id="LinuxConfiguration-category">category</code> String - The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).
* <code id="LinuxConfiguration-desktop">desktop</code> any - The [Desktop file](https://developer.gnome.org/integration-guide/stable/desktop-files.html.en) entries (name to value).
<!-- end of generated block -->

## AppImage Options

The top-level `appImage` key contains set of options instructing electron-builder on how it should build [AppImage](https://appimage.org/).

{% include "/generated/appimage-options.md" %}

## Debian Package Options

The top-level [deb](configuration.md#Configuration-deb) key contains set of options instructing electron-builder on how it should build Debian package.

{% include "/generated/DebOptions.md" %}

All `LinuxTargetSpecificOptions` can be also specified in the `deb` to customize Debian package. 

## `LinuxTargetSpecificOptions` APK, FreeBSD, Pacman, P5P and RPM Options
<a name="LinuxTargetSpecificOptions"></a>

The top-level `apk`, `freebsd`, `pacman`, `p5p` and `rpm` keys contains set of options instructing electron-builder on how it should build corresponding Linux target.

{% include "/generated/LinuxTargetSpecificOptions.md" %}