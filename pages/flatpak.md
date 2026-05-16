!!! warning "Single-file Flatpak bundles"
    Currently `electron-builder` does **not** support publishing apps to Flatpak repositories like [Flathub](https://flathub.org/). Flatpak support in `electron-builder` is limited to generating [single-file bundles](https://docs.flatpak.org/en/latest/single-file-bundles.html) which have limitations compared to apps installed from a repository.

The top-level [flatpak](configuration.md#flatpak) key contains a set of options instructing electron-builder on how it should build a [Flatpak](https://flatpak.org/) bundle.

## What is Flatpak?

Flatpak is a universal Linux packaging system that runs apps in a sandbox with controlled access to system resources. Unlike AppImage (no sandbox) and Snap (Ubuntu-primary), Flatpak is designed to be distro-agnostic and runs on any Linux distribution with `flatpak` installed.

Key characteristics:
- **Sandboxed** — apps run in an isolated environment with portal-based access to system resources
- **Cross-distro** — works on Ubuntu, Fedora, Arch, Debian, and more
- **Runtime-based** — apps are built against a specific runtime (freedesktop, GNOME, KDE)
- **Distributed via Flathub** (for repository-based distribution — note: currently not supported by electron-builder)

## Flatpak vs. AppImage vs. Snap

| Aspect | Flatpak | AppImage | Snap |
|---|---|---|---|
| Sandboxed | Yes (portals) | No | Yes (interfaces) |
| Distro support | Any (flatpak required) | Universal | Any (snapd required) |
| Store/repo | Flathub (not via eb) | N/A | Snap Store |
| Auto-update | Flathub (not via eb) | AppImageUpdate | Snap Store |
| electron-builder output | Single-file bundle | Single file | Package |

## Build Requirements

Install `flatpak` and `flatpak-builder` on your Linux build machine:

```bash
# Ubuntu/Debian
sudo apt install flatpak flatpak-builder

# Fedora
sudo dnf install flatpak flatpak-builder

# Arch
sudo pacman -S flatpak flatpak-builder
```

## Runtime and SDK

Flatpak apps run against a runtime that provides base libraries. Choose the runtime that matches your app's dependencies:

```yaml
flatpak:
  runtime: org.freedesktop.Platform         # freedesktop (most common for Electron)
  sdk: org.freedesktop.Sdk
  runtimeVersion: "24.08"                   # runtime version
```

Common runtimes for Electron apps:

| Runtime | SDK | Use Case |
|---|---|---|
| `org.freedesktop.Platform` | `org.freedesktop.Sdk` | Standard Electron apps (recommended) |
| `org.gnome.Platform` | `org.gnome.Sdk` | GNOME-integrated apps |
| `org.kde.Platform` | `org.kde.Sdk` | KDE-integrated apps |

Install the runtime before building:

```bash
flatpak install flathub org.freedesktop.Platform//24.08
flatpak install flathub org.freedesktop.Sdk//24.08
```

## Finish Args (Permissions)

The `finishArgs` array defines what the sandboxed app is allowed to access. Electron apps need several permissions:

```yaml
flatpak:
  finishArgs:
    # Display
    - "--socket=x11"
    - "--socket=wayland"
    - "--share=ipc"              # shared memory with X11 compositor
    # Network
    - "--share=network"
    # Filesystem
    - "--filesystem=home"        # access user home directory
    # Desktop integration
    - "--talk-name=org.freedesktop.Notifications"
    - "--talk-name=org.kde.StatusNotifierWatcher"
    - "--talk-name=com.canonical.AppMenu.Registrar"
    # Electron-specific
    - "--device=dri"             # GPU access
    - "--socket=pulseaudio"      # audio
```

**Common finish args for Electron:**

| Arg | Purpose |
|---|---|
| `--socket=x11` | X11 display |
| `--socket=wayland` | Wayland display |
| `--share=ipc` | Shared memory (required for X11) |
| `--share=network` | Network access |
| `--filesystem=home` | Home directory access |
| `--device=dri` | GPU/DRM device (for WebGL, video decode) |
| `--socket=pulseaudio` | Audio output |
| `--talk-name=org.freedesktop.Notifications` | Desktop notifications |
| `--filesystem=xdg-download` | Downloads folder only (less than `--filesystem=home`) |

## Branch

```yaml
flatpak:
  branch: stable    # Default: master/main
```

The branch name is embedded in the Flatpak bundle and visible to users.

## Extra Modules

Include additional system libraries not in the runtime:

```yaml
flatpak:
  modules:
    - name: zlib
      buildsystem: autotools
      sources:
        - type: archive
          url: https://www.zlib.net/zlib-1.3.tar.gz
          sha256: "..."
```

## Custom Files and Symlinks

Copy additional files into the app bundle:

```yaml
flatpak:
  files:
    - - build/extra-binary        # source
      - /app/bin/extra-binary     # destination (absolute within Flatpak)
  symlinks:
    - - /app/bin/myapp            # target
      - /app/bin/myapp-alias      # symlink location
```

## Wayland Support

```yaml
flatpak:
  useWaylandFlags: true   # Sets ELECTRON_OZONE_PLATFORM_HINT=auto
```

## Local Testing

Build and install the Flatpak locally:

```bash
electron-builder --linux flatpak
# This produces a .flatpak bundle file

# Install it (no root required)
flatpak install --user dist/myapp-1.0.0.flatpak

# Run it
flatpak run com.mycompany.myapp
```

## Troubleshooting

If the build fails, enable debug logging to see the underlying `flatpak-builder` output:

```bash
env DEBUG="@malept/flatpak-bundler" electron-builder build --linux flatpak
```

**Missing runtime:** Install the runtime before building — see the Runtime section above.

**Sandbox permission denied:** Check the `finishArgs` — the app is likely trying to access something not in its allowed permissions. Run `flatpak run --log-session-bus com.mycompany.myapp` to see D-Bus access denials.

**GPU rendering issues:** Ensure `--device=dri` is in `finishArgs` for WebGL support.

## Configuration

{!./app-builder-lib.Interface.FlatpakOptions.md!}
