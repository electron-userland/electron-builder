The top-level [linux](configuration.md#Configuration-linux) key contains set of options instructing electron-builder on how it should build Linux targets. These options applicable for any Linux target.

# Base Linux Configuration

{% include "./app-builder-lib.Interface.LinuxConfiguration.md" %}

# Debian Package Options

The top-level [deb](configuration.md#Configuration-deb) key contains set of options instructing electron-builder on how it should build Debian package.

{% include "./app-builder-lib.Interface.DebOptions.md" %}

All [LinuxTargetSpecificOptions](linux.md#linuxtargetspecificoptions-apk-freebsd-pacman-p5p-and-rpm-options) can be also specified in the `deb` to customize Debian package.

# `LinuxTargetSpecificOptions` APK, FreeBSD, Pacman, P5P and RPM Options
<a name="LinuxTargetSpecificOptions"></a>

The top-level `apk`, `freebsd`, `pacman`, `p5p` and `rpm` keys contains set of options instructing electron-builder on how it should build corresponding Linux target.

{% include "./app-builder-lib.Interface.LinuxTargetSpecificOptions.md" %}

