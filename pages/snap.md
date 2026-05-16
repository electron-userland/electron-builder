The top-level [snap](configuration.md#snap) key contains set of options instructing electron-builder on how it should build [Snap](http://snapcraft.io) packages for Linux.

## What is Snap?

Snap is a universal Linux packaging format developed by Canonical (Ubuntu). Snap packages are self-contained, install on most Linux distributions, and are distributed through the [Snap Store](https://snapcraft.io/store). Key characteristics:

- **Sandboxed by default** — confined to declared interfaces
- **Automatic updates** — the Snap daemon (`snapd`) handles updates silently
- **Cross-distro** — works on Ubuntu, Fedora, Debian, Arch, and more (with snapd installed)
- **Ubuntu-primary** — snapd ships by default on Ubuntu; other distros require manual install

## Snap vs. AppImage vs. Flatpak

| Aspect | Snap | AppImage | Flatpak |
|---|---|---|---|
| Sandboxed | Yes (default) | No | Yes |
| Auto-update | Via Snap Store | Via AppImageUpdate | Via Flathub |
| Offline install | Yes (`--dangerous`) | Yes | Yes |
| Distro support | Ubuntu-native, others need snapd | Universal | Universal |
| Store | Snap Store | N/A | Flathub |
| electron-updater | Not needed (use Snap Store) | Needed | Not needed (Flathub) |
| electron-builder support | Full | Full | Full |

## Build Requirements

Building Snap packages requires a Linux environment (or [Docker](multi-platform-build.md#docker)).

## Confinement

The `confinement` option controls how strictly the snap is sandboxed:

| Confinement | Description | Use Case |
|---|---|---|
| `strict` | Full sandbox, access via declared interfaces only | Production apps (required for Snap Store) |
| `devmode` | No sandbox, all access allowed | Development and debugging only |
| `classic` | Unrestricted access (like a regular binary) | CLI tools that need full system access |

```yaml
snap:
  confinement: strict   # required for Snap Store submission
```

!!! warning "Classic Confinement"
    Snap Store requires manual review and approval for `classic` confinement. Electron apps typically use `strict` with appropriate interface plugs.

## Base

The `base` option selects the Ubuntu runtime your snap is built against. This determines which Ubuntu packages are available and the minimum snapd version required:

| Base | Ubuntu Version | snapd Requirement | Status |
|---|---|---|---|
| `core` | Ubuntu 16.04 | Any | Legacy |
| `core20` | Ubuntu 20.04 LTS | snapd 2.44+ | Stable |
| `core22` | Ubuntu 22.04 LTS | snapd 2.58+ | Recommended |
| `core24` | Ubuntu 24.04 LTS | snapd 2.63+ | Stable |

```yaml
snap:
  base: core22   # recommended as of 2024
```

## Interface Plugs

Electron apps require several interface plugs to function properly in strict confinement:

```yaml
snap:
  plugs:
    - browser-support          # required for Chromium/Electron rendering
    - network                  # network access
    - network-bind             # listen on ports
    - home                     # read/write home directory
    - removable-media          # USB drives, external storage
    - audio-playback           # sound output
    - audio-record             # microphone
    - opengl                   # GPU acceleration
    - desktop                  # X11/Wayland display
    - desktop-legacy           # GTK legacy theming
    - unity7                   # Unity/X11 appindicator
    - x11                      # X11 display
    - wayland                  # Wayland display
    - gsettings                # GNOME settings (theming, fonts)
    - password-manager-service # system keychain access
```

!!! tip "Minimal Plugs"
    Start with only the plugs you actually need. Unnecessary plugs may slow Snap Store review. At minimum, `browser-support`, `network`, `desktop`, and `desktop-legacy` are needed for most Electron apps.

Custom plug configuration:

```yaml
snap:
  plugs:
    - name: browser-support
      allow-sandbox: true
    - network
    - home
```

## Stage Packages

Include Ubuntu system packages in your snap if your app depends on libraries not available in the base:

```yaml
snap:
  stagePackages:
    - libusb-1.0-0           # USB device access
    - libsecret-1-0          # Secret Service (keychain)
    - libappindicator3-1     # System tray (deprecated but widely needed)
```

## Grade

```yaml
snap:
  grade: stable    # or "devel"
```

The `stable` grade is required for release to the `stable` and `candidate` channels in the Snap Store. Use `devel` during development.

## Environment Variables

Pass environment variables into the snap runtime:

```yaml
snap:
  environment:
    TMPDIR: $XDG_RUNTIME_DIR
    NODE_ENV: production
```

## Wayland Support

Enable native Wayland rendering (instead of XWayland compatibility):

```yaml
snap:
  allowNativeWayland: true
```

This requires the `wayland` plug.

## Auto-Start on Login

```yaml
snap:
  autoStart: true   # Default: false
```

Adds a systemd user service that starts the app after the user logs in.

## Snap Layouts

Use layouts to give the snap access to restricted paths:

```yaml
snap:
  layout:
    /usr/share/alsa:
      bind: $SNAP/usr/share/alsa
    /etc/asound.conf:
      bind-file: $SNAP/etc/asound.conf
```

## Parts

The `appPartStage` option controls which files are included from the main app part:

```yaml
snap:
  appPartStage:
    - -usr/share/doc
    - -usr/share/man
```

## Publishing to the Snap Store

1. Create an account at [snapcraft.io](https://snapcraft.io/account) and register your snap name
2. Install `snapcraft`: `sudo snap install snapcraft --classic`
3. Log in: `snapcraft login`
4. Configure publishing in your electron-builder config:

```yaml
publish:
  provider: snapStore
  repo: myapp       # your registered snap name
  channels:
    - stable
```

5. Build and publish: `electron-builder --linux snap --publish always`

### Channel Strategy

| Channel | Purpose |
|---|---|
| `edge` | Latest development builds (auto-published from CI) |
| `beta` | Beta testing builds |
| `candidate` | Release candidates |
| `stable` | Production releases |

## Local Testing

Install a locally built snap without the Snap Store:

```bash
sudo snap install --dangerous dist/myapp_1.0.0_amd64.snap
```

Run and check logs:

```bash
myapp
journalctl --user -xe | grep myapp
```

To uninstall: `sudo snap remove myapp`

## Debugging

Enable verbose electron-builder output:

```bash
DEBUG=electron-builder electron-builder --linux snap
```

For snap runtime issues, check confinement denials:

```bash
snap run --shell myapp
# Inside the snap shell, test what's accessible
```

## Configuration

{!./app-builder-lib.Interface.SnapOptions.md!}
