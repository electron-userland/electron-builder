The top-level [linux](configuration.md) key contains set of options instructing electron-builder on how it should build Linux targets. These options applicable for any Linux target.

## Linux Target Overview

electron-builder supports a wide range of Linux package formats. Choose based on your target audience and distribution method:

| Target | Format | Best For | Distro Support |
|---|---|---|---|
| `AppImage` | Single file | Broad compatibility, no install | Universal |
| `deb` | Debian package | Ubuntu, Debian, Mint | Debian-based |
| `rpm` | RPM package | Fedora, RHEL, openSUSE | Red Hat-based |
| `snap` | Snap package | Ubuntu-primary | Any (snapd required) |
| `flatpak` | Flatpak | Cross-distro sandboxed | Any (flatpak required) |
| `pacman` | Arch package | Arch Linux, Manjaro | Arch-based |
| `apk` | Alpine package | Alpine Linux, containers | Alpine |
| `freebsd` | FreeBSD pkg | FreeBSD | FreeBSD |
| `p5p` | Solaris IPS | Solaris, illumos | Solaris-based |
| `zip`, `7z`, `tar.*` | Archive | Custom CDN distribution | Universal |
| `dir` | Directory | Development/debugging | N/A |

The default target is `AppImage`.

## Common Linux Configuration

Options set in the `linux` key apply to all Linux targets:

```yaml
linux:
  target:
    - AppImage
    - deb
    - rpm
  category: Utility                  # freedesktop.org category
  synopsis: "A short description"    # one-line description
  description: "Full description"    # longer description
  maintainer: "Name <email>"         # package maintainer
  vendor: "My Company"               # package vendor
  mimeTypes:
    - application/x-myapp
  executableArgs:
    - --enable-features=WebContentsFocusOnResize
```

## Desktop File Customization

All Linux targets include a `.desktop` file for application menu integration. Customize it via `linux.desktop`:

```yaml
linux:
  desktop:
    entry:
      Name: My Application
      Comment: A fantastic application
      Categories: Office;Productivity
      Keywords: productivity;notes;organizer
      StartupWMClass: my-app       # helps window managers match window to icon
      Terminal: false
      Type: Application
    desktopActions:
      NewWindow:
        Name: New Window
        Exec: my-app --new-window
      NewFile:
        Name: New File
        Exec: my-app --new-file
```

Standard freedesktop.org category values include: `AudioVideo`, `Audio`, `Video`, `Development`, `Education`, `Game`, `Graphics`, `Network`, `Office`, `Science`, `Settings`, `System`, `Utility`.

See the [freedesktop.org specification](https://specifications.freedesktop.org/desktop-entry-spec/latest/example.html) for all valid keys.

## Icon Configuration

Provide a directory of PNG icons named with their size:

```yaml
linux:
  icon: build/icons/
```

Files must be named `NxN.png` (e.g., `256x256.png`, `512x512.png`). If not specified, electron-builder auto-generates Linux icons from the macOS `.icns` file (if present) or the Windows `.ico` file.

Recommended sizes: 16, 24, 32, 48, 64, 96, 128, 256, 512 pixels.

## Debian Package (`deb`)

The `deb` target creates a `.deb` package installable via `apt` on Debian, Ubuntu, Mint, and other Debian-based distributions.

```yaml
deb:
  depends:
    - libgtk-3-0
    - libnotify4
    - libnss3
    - libxss1
    - libxtst6
    - xdg-utils
    - libatspi2.0-0
    - libuuid1
    - libsecret-1-0
  recommends:
    - libappindicator3-1    # system tray support
  packageCategory: utils
  priority: optional
```

**Common `depends` packages for Electron apps:**
- `libgtk-3-0` — GTK3 (required)
- `libnotify4` — desktop notifications
- `libnss3` — NSS (Chromium networking)
- `libxss1` — screen saver extension
- `libxtst6` — X test extension
- `xdg-utils` — desktop integration utilities
- `libatspi2.0-0` — accessibility
- `libuuid1` — UUID support
- `libsecret-1-0` — keychain/Secret Service

**Priority values:** `required`, `important`, `standard`, `optional` (use `optional` for most apps)

## RPM Package (`rpm`)

The `rpm` target creates a `.rpm` package for Fedora, RHEL, CentOS, openSUSE, and other RPM-based distributions.

```yaml
rpm:
  depends:
    - libXScrnSaver
    - libnotify
    - libappindicator
    - nss
    - gtk3
  compression: xz     # gz | bzip2 | xz | lzo (default: xz)
  packageCategory: Applications/Internet
```

**Common `depends` for Electron on RPM systems:**
- `gtk3` — GTK3
- `libnotify` — notifications
- `libXScrnSaver` — screen saver
- `nss` — networking

**After-install/after-remove scripts:**

```yaml
rpm:
  afterInstall: build/scripts/after-install.sh
  afterRemove: build/scripts/after-remove.sh
```

## Pacman Package (`pacman`)

:::warning[Beta]
The `pacman` target is in beta. Test thoroughly before distributing.
:::

Creates a `.pkg.tar.zst` package for Arch Linux and Arch-based distributions (Manjaro, EndeavourOS, etc.):

```yaml
pacman:
  depends:
    - gtk3
    - libnotify
    - nss
    - libxss
    - libxtst
    - xdg-utils
    - at-spi2-core
    - libsecret
```

## Alpine APK Package (`apk`)

Creates an `.apk` package for Alpine Linux, commonly used in Docker containers:

```yaml
apk:
  depends:
    - gtk+3.0
    - libnotify
    - nss
```

:::note[musl libc]
Alpine uses musl libc rather than glibc. Electron bundles its own copy of glibc-dependent libraries, but some native modules may not be compatible with Alpine without recompilation.
:::

## FreeBSD Package (`freebsd`)

Creates a `.pkg` package (not to be confused with macOS PKG) for FreeBSD systems:

```yaml
freebsd:
  depends:
    - gtk3
    - libnotify
    - nss
```

## FPM Passthrough Options

The DEB, RPM, Pacman, APK, FreeBSD, and P5P targets are built using [FPM](https://github.com/jordansissel/fpm) internally. Pass additional FPM command-line arguments:

```yaml
deb:
  fpm:
    - "--deb-changelog=CHANGELOG.md"
    - "--deb-no-default-config-files"
```

## AppArmor Profile (Ubuntu 24+)

Ubuntu 24.04 introduced mandatory AppArmor profiles for application sandboxing. Specify a custom profile:

```yaml
deb:
  appArmorProfile: build/apparmor-profile
```

Without a profile, the app may be restricted by Ubuntu's default profile. See the [AppArmor documentation](https://ubuntu.com/security/apparmor) for profile syntax.

## Base Linux Configuration

{!./app-builder-lib.Interface.LinuxConfiguration.md!}

## Debian Package Options

The top-level [deb](configuration.md) key contains set of options for Debian packages.

{!./app-builder-lib.Interface.DebOptions.md!}

All [LinuxTargetSpecificOptions](linux.md#linuxtargetspecificoptions-apk-freebsd-pacman-p5p-and-rpm-options) can also be specified in `deb` to customize Debian packages.

## `LinuxTargetSpecificOptions` — APK, FreeBSD, Pacman, P5P and RPM Options {#linuxtargetspecificoptions-apk-freebsd-pacman-p5p-and-rpm-options}

The top-level `apk`, `freebsd`, `pacman`, `p5p` and `rpm` keys contain options for their respective Linux targets.

{!./app-builder-lib.Interface.LinuxTargetSpecificOptions.md!}
