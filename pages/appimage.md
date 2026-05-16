The top-level [appImage](configuration.md) key contains set of options instructing electron-builder on how it should build [AppImage](https://appimage.org/) files.

## What is AppImage?

AppImage is a self-contained Linux application format — a single file that runs on almost any Linux distribution without installation. Users download the file, make it executable (`chmod +x`), and run it. No root access, no package manager, no dependencies to install.

Key characteristics:
- **No installation required** — runs directly from the downloaded file
- **Cross-distro** — works on Ubuntu, Fedora, Arch, Debian, and virtually any x86_64 or ARM Linux
- **Self-contained** — all dependencies bundled (except glibc and a few other fundamentals)
- **Portable** — can run from a USB drive or any writable location

## AppImage vs. Snap vs. Flatpak vs. DEB

| Aspect | AppImage | Snap | Flatpak | DEB/RPM |
|---|---|---|---|---|
| Installation | None | `snap install` | `flatpak install` | `apt`/`dnf` |
| Sandboxed | No | Yes (strict) | Yes | No |
| Auto-update | AppImageUpdate / electron-updater | Snap Store | Flathub | Package manager |
| Cross-distro | Yes | Yes (snapd needed) | Yes | No |
| Root required | No | No | No | Yes |
| Store distribution | N/A | Snap Store | Flathub | apt/dnf repos |
| electron-builder default | **Yes** | No | No | No |

AppImage is the default Linux target for electron-builder (`@default AppImage`).

## Desktop Integration

!!! info "Desktop Integration"
    Since electron-builder 21, desktop integration (creating `.desktop` files, associating file types, registering with application menus) is NOT handled by the AppImage itself.

The recommended way to integrate AppImages into the desktop is [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher):

- Automatically prompts users to integrate AppImages when they first run them
- Creates desktop entries, file associations, and application menu entries
- Handles AppImage updates via AppImageUpdate
- Available for Ubuntu, Debian, Fedora, and other major distros

Without AppImageLauncher, users can manually create a `.desktop` file or use the AppImage directly without system integration.

## Auto-Update Support

AppImages support delta updates via the `electron-updater` package using the zsync protocol. Configure a publish provider and electron-updater will handle updates:

```yaml
publish:
  provider: github   # or s3, generic, etc.
```

When publishing, electron-builder generates a `.AppImage.zsync` file alongside the AppImage. electron-updater uses this for efficient differential updates.

See [Auto Update](auto-update.md) for the full setup guide.

## Architecture Support

| Architecture | CLI Flag | Notes |
|---|---|---|
| `x64` | `--x64` | Standard 64-bit x86 Linux |
| `arm64` | `--arm64` | 64-bit ARM (Raspberry Pi 4+, server ARM) |
| `armv7l` | `--armv7l` | 32-bit ARM (Raspberry Pi 3 and older) |

Build requirements: Linux host (or [Docker](multi-platform-build.md#docker)) for all architectures.

## Toolset Version

electron-builder uses a bundled AppImage toolset to create AppImages. The `toolsets.appimage` option selects which version:

```yaml
toolsets:
  appimage: "0.0.0"     # stable, legacy toolset (default)
  # appimage: "1.0.3"   # beta, newer runtime
```

| Version | Runtime | Notes |
|---|---|---|
| `"0.0.0"` | Legacy | Default, stable |
| `"1.0.2"` | 20251108 | Beta |
| `"1.0.3"` | 20251108 | Beta, fixes issue #9598 |

The newer runtime versions include an updated AppImage runtime binary that supports more modern Linux features.

## Desktop Entry Customization

Customize the `.desktop` file metadata embedded in the AppImage via the `linux.desktop` option:

```yaml
linux:
  desktop:
    entry:
      Name: My Application
      Comment: A great application
      Categories: Office;Productivity
      Keywords: productivity;tool
      StartupWMClass: myapp
    desktopActions:
      NewWindow:
        Name: New Window
        Exec: myapp --new-window
```

See [Linux Configuration](linux.md#desktop-file-customization) for the full desktop entry reference.

## MIME Type Associations

Associate your AppImage with file types via `linux.mimeTypes`:

```yaml
linux:
  mimeTypes:
    - application/x-myapp-document
```

## Build Requirements

AppImages must be built on Linux (or via Docker). They cannot be cross-compiled from macOS or Windows.

To build on a non-Linux host:

```bash
# Build Linux targets using Docker
docker run --rm -ti \
  --env-file <(env | grep -iE 'DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS_TAG|TRAVIS|TRAVIS_REPO_|TRAVIS_BUILD_|TRAVIS_BRANCH|TRAVIS_PULL_REQUEST_|APPVEYOR_|CSC_|GH_|GITHUB_|BT_|AWS_|STRIP|BUILD_') \
  --env ELECTRON_CACHE="/root/.cache/electron" \
  --env ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
  -v ${PWD}:/project \
  -v ~/.cache/electron:/root/.cache/electron \
  -v ~/.cache/electron-builder:/root/.cache/electron-builder \
  electronuserland/builder:wine \
  /bin/bash -c "npm install && npx electron-builder --linux"
```

See [Multi Platform Build](multi-platform-build.md#docker) for full Docker documentation.

## Debugging

Enable verbose output:

```bash
DEBUG=electron-builder electron-builder --linux AppImage
```

Test the built AppImage:

```bash
chmod +x dist/MyApp-1.0.0.AppImage
./dist/MyApp-1.0.0.AppImage --no-sandbox
```

The `--no-sandbox` flag may be required on some distributions where user namespaces are restricted.

## Configuration

{!./app-builder-lib.Interface.AppImageOptions.md!}
